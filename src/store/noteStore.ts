import { create } from "zustand";
import {
  createNote,
  deleteEmptyNote,
  listNotes,
  setPinned,
  updateNote
} from "../lib/tauri";
import type { Note, SaveStatus } from "../types/note";

type PendingSave = {
  noteId: string | null;
  content: string;
  pinned?: boolean;
};

type NoteState = {
  activeNote: Note | null;
  draftContent: string;
  notes: Note[];
  saveStatus: SaveStatus;
  saveError: string | null;
  pendingSave: PendingSave | null;

  setDraftContent: (content: string) => void;
  setActiveNote: (note: Note | null) => void;
  loadNotes: (limit?: number) => Promise<void>;
  saveDraft: () => Promise<Note | null>;
  retryPendingSave: () => Promise<Note | null>;
  togglePinned: () => Promise<Note | null>;
  deleteEmptyActiveNote: () => Promise<void>;
  resetDraft: () => void;
};

function upsertNote(notes: Note[], note: Note): Note[] {
  const withoutNote = notes.filter((existing) => existing.id !== note.id);
  return [note, ...withoutNote].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return Number(right.pinned) - Number(left.pinned);
    }

    return right.updated_at.localeCompare(left.updated_at);
  });
}

function pendingFromState(state: NoteState): PendingSave {
  return {
    noteId: state.activeNote?.id ?? null,
    content: state.draftContent,
    pinned: state.activeNote?.pinned
  };
}

async function persistPendingSave(pendingSave: PendingSave): Promise<Note> {
  const note = pendingSave.noteId
    ? await updateNote(pendingSave.noteId, pendingSave.content)
    : await createNote(pendingSave.content);

  if (typeof pendingSave.pinned === "boolean" && note.pinned !== pendingSave.pinned) {
    return setPinned(note.id, pendingSave.pinned);
  }

  return note;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  activeNote: null,
  draftContent: "",
  notes: [],
  saveStatus: "idle",
  saveError: null,
  pendingSave: null,

  setDraftContent: (content) =>
    set((state) => ({
      draftContent: content,
      saveStatus: content !== state.draftContent ? "dirty" : state.saveStatus,
      saveError: content !== state.draftContent ? null : state.saveError
    })),

  setActiveNote: (note) =>
    set({
      activeNote: note,
      draftContent: note?.content ?? "",
      saveStatus: "idle",
      saveError: null,
      pendingSave: null
    }),

  loadNotes: async (limit) => {
    const notes = await listNotes(limit);
    set({ notes });
  },

  saveDraft: async () => {
    const state = get();

    if (state.draftContent.trim().length === 0 && !state.activeNote) {
      set({ saveStatus: "idle", saveError: null, pendingSave: null });
      return null;
    }

    if (state.draftContent.trim().length === 0 && state.activeNote) {
      try {
        set({ saveStatus: "saving", saveError: null });
        await updateNote(state.activeNote.id, state.draftContent);
        await deleteEmptyNote(state.activeNote.id);
        const notes = await listNotes();
        set({
          activeNote: null,
          draftContent: "",
          notes,
          saveStatus: "idle",
          saveError: null,
          pendingSave: null
        });
      } catch {
        set({
          pendingSave: pendingFromState(state),
          saveStatus: "error",
          saveError: "Saved locally when storage is available"
        });
      }
      return null;
    }

    try {
      set({ saveStatus: "saving", saveError: null });
      const note = state.activeNote
        ? await updateNote(state.activeNote.id, state.draftContent)
        : await createNote(state.draftContent);

      set((current) => ({
        activeNote: note,
        draftContent: current.draftContent,
        notes: upsertNote(current.notes, note),
        saveStatus: "saved",
        saveError: null,
        pendingSave: null
      }));

      return note;
    } catch {
      set({
        pendingSave: pendingFromState(state),
        saveStatus: "error",
        saveError: "Saved locally when storage is available"
      });
      return null;
    }
  },

  retryPendingSave: async () => {
    const pendingSave = get().pendingSave;
    if (!pendingSave) {
      return null;
    }

    try {
      set({ saveStatus: "saving", saveError: null });
      const note = await persistPendingSave(pendingSave);
      set((state) => ({
        activeNote: note,
        draftContent: state.draftContent,
        notes: upsertNote(state.notes, note),
        saveStatus: "saved",
        saveError: null,
        pendingSave: null
      }));

      return note;
    } catch {
      set({
        pendingSave,
        saveStatus: "error",
        saveError: "Saved locally when storage is available"
      });
      return null;
    }
  },

  togglePinned: async () => {
    let activeNote = get().activeNote;
    if (!activeNote) {
      activeNote = await get().saveDraft();
    }

    if (!activeNote) {
      return null;
    }

    try {
      set({ saveStatus: "saving", saveError: null });
      const note = await setPinned(activeNote.id, !activeNote.pinned);
      set((state) => ({
        activeNote: note,
        notes: upsertNote(state.notes, note),
        saveStatus: "saved",
        saveError: null,
        pendingSave: null
      }));

      return note;
    } catch {
      set((state) => ({
        pendingSave: {
          noteId: activeNote.id,
          content: state.draftContent,
          pinned: !activeNote.pinned
        },
        saveStatus: "error",
        saveError: "Saved locally when storage is available"
      }));
      return null;
    }
  },

  deleteEmptyActiveNote: async () => {
    const { activeNote, draftContent } = get();
    if (!activeNote) {
      return;
    }

    await deleteEmptyNote(activeNote.id);
    if (draftContent.trim().length === 0) {
      const notes = await listNotes();
      set({
        activeNote: null,
        draftContent: "",
        notes,
        saveStatus: "idle",
        saveError: null,
        pendingSave: null
      });
    }
  },

  resetDraft: () =>
    set({
      activeNote: null,
      draftContent: "",
      saveStatus: "idle",
      saveError: null,
      pendingSave: null
    })
}));
