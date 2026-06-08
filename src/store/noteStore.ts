import { create } from "zustand";
import {
  archiveNote as archiveNoteCommand,
  createFolder as createFolderCommand,
  createNote,
  deleteFolder as deleteFolderCommand,
  deleteEmptyNote,
  listArchivedNotes,
  listFolders,
  listNotes,
  listNotesByCreatedDate,
  listNotesByFolder,
  listTrashedNotes,
  permanentlyDeleteNote as permanentlyDeleteNoteCommand,
  restoreNote as restoreNoteCommand,
  setPinned,
  setNoteFolders,
  softDeleteNote as softDeleteNoteCommand,
  unarchiveNote as unarchiveNoteCommand,
  updateNote
} from "../lib/tauri";
import { localDayBounds } from "../lib/dates";
import type { Folder, Note, SaveStatus } from "../types/note";

type PendingSave = {
  noteId: string | null;
  content: string;
  pinned?: boolean;
  folderIds?: string[];
};

type NoteState = {
  activeNote: Note | null;
  draftContent: string;
  notes: Note[];
  notesByDate: Note[];
  trashedNotes: Note[];
  archivedNotes: Note[];
  folders: Folder[];
  selectedFolderId: string | null;
  folderError: string | null;
  trashError: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  pendingSave: PendingSave | null;

  setDraftContent: (content: string) => void;
  setActiveNote: (note: Note | null) => void;
  loadNotes: (limit?: number) => Promise<void>;
  loadNotesByDate: (date: string, limit?: number) => Promise<void>;
  clearNotesByDate: () => void;
  loadTrashedNotes: (limit?: number) => Promise<void>;
  loadArchivedNotes: (limit?: number) => Promise<void>;
  archiveNote: (id: string) => Promise<void>;
  unarchiveNote: (id: string) => Promise<void>;
  softDeleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<void>;
  loadNotesByFolder: (folderId: string, limit?: number) => Promise<void>;
  saveDraft: () => Promise<Note | null>;
  retryPendingSave: () => Promise<Note | null>;
  togglePinned: () => Promise<Note | null>;
  setActiveNoteFolders: (folderIds: string[]) => Promise<Note | null>;
  toggleActiveNoteFolder: (folderId: string) => Promise<Note | null>;
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
    pinned: state.activeNote?.pinned,
    folderIds: state.activeNote?.folders.map((folder) => folder.id)
  };
}

async function persistPendingSave(pendingSave: PendingSave): Promise<Note> {
  let note = pendingSave.noteId
    ? await updateNote(pendingSave.noteId, pendingSave.content)
    : await createNote(pendingSave.content);

  if (typeof pendingSave.pinned === "boolean" && note.pinned !== pendingSave.pinned) {
    note = await setPinned(note.id, pendingSave.pinned);
  }

  if (pendingSave.folderIds) {
    note = await setNoteFolders(note.id, pendingSave.folderIds);
  }

  return note;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  activeNote: null,
  draftContent: "",
  notes: [],
  notesByDate: [],
  trashedNotes: [],
  archivedNotes: [],
  folders: [],
  selectedFolderId: null,
  folderError: null,
  trashError: null,
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

  loadNotesByDate: async (date, limit) => {
    const { startIso, endIso } = localDayBounds(date);
    const notesByDate = await listNotesByCreatedDate(startIso, endIso, limit);
    set({ notesByDate });
  },

  clearNotesByDate: () => set({ notesByDate: [] }),

  loadTrashedNotes: async (limit) => {
    try {
      const trashedNotes = await listTrashedNotes(limit);
      set({ trashedNotes, trashError: null });
    } catch (error) {
      set({ trashedNotes: [], trashError: error instanceof Error ? error.message : String(error) });
    }
  },

  loadArchivedNotes: async (limit) => {
    const archivedNotes = await listArchivedNotes(limit);
    set({ archivedNotes });
  },

  archiveNote: async (id) => {
    await archiveNoteCommand(id);
    const [notes, archivedNotes, folders] = await Promise.all([
      listNotes(),
      listArchivedNotes(),
      listFolders()
    ]);
    set((state) => {
      const archivingActive = state.activeNote?.id === id;
      return {
        notes,
        archivedNotes,
        folders,
        activeNote: archivingActive ? null : state.activeNote,
        draftContent: archivingActive ? "" : state.draftContent,
        saveStatus: archivingActive ? "idle" : state.saveStatus,
        saveError: archivingActive ? null : state.saveError,
        pendingSave: archivingActive ? null : state.pendingSave
      };
    });
  },

  unarchiveNote: async (id) => {
    const note = await unarchiveNoteCommand(id);
    const [notes, archivedNotes, folders] = await Promise.all([
      listNotes(),
      listArchivedNotes(),
      listFolders()
    ]);
    set((state) => ({
      notes: upsertNote(state.notes, note),
      archivedNotes,
      folders
    }));
  },

  softDeleteNote: async (id) => {
    await softDeleteNoteCommand(id);
    const [notes, trashedNotes, archivedNotes, folders] = await Promise.all([
      listNotes(),
      listTrashedNotes(),
      listArchivedNotes(),
      listFolders()
    ]);
    set((state) => {
      const deletingActive = state.activeNote?.id === id;
      return {
        notes,
        trashedNotes,
        archivedNotes,
        folders,
        activeNote: deletingActive ? null : state.activeNote,
        draftContent: deletingActive ? "" : state.draftContent,
        saveStatus: deletingActive ? "idle" : state.saveStatus,
        saveError: deletingActive ? null : state.saveError,
        pendingSave: deletingActive ? null : state.pendingSave,
        trashError: null
      };
    });
  },

  restoreNote: async (id) => {
    const note = await restoreNoteCommand(id);
    const folders = await listFolders();
    set((state) => ({
      trashedNotes: state.trashedNotes.filter((item) => item.id !== id),
      notes: upsertNote(state.notes, note),
      folders,
      trashError: null
    }));
  },

  permanentlyDeleteNote: async (id) => {
    await permanentlyDeleteNoteCommand(id);
    set((state) => ({
      trashedNotes: state.trashedNotes.filter((note) => note.id !== id),
      trashError: null
    }));
  },

  loadFolders: async () => {
    const folders = await listFolders();
    set((state) => ({
      folders,
      selectedFolderId:
        state.selectedFolderId && folders.some((folder) => folder.id === state.selectedFolderId)
          ? state.selectedFolderId
          : folders[0]?.id ?? null,
      folderError: null
    }));
  },

  createFolder: async (name) => {
    try {
      const folder = await createFolderCommand(name);
      set((state) => ({
        folders: [folder, ...state.folders.filter((item) => item.id !== folder.id)],
        selectedFolderId: folder.id,
        folderError: null
      }));
      return folder;
    } catch (error) {
      set({ folderError: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  deleteFolder: async (id) => {
    try {
      await deleteFolderCommand(id);
      const [folders, notes, trashedNotes] = await Promise.all([listFolders(), listNotes(), listTrashedNotes()]);
      set((state) => {
        const activeStillExists = Boolean(
          state.activeNote && notes.some((note) => note.id === state.activeNote?.id)
        );
        return {
          folders,
          notes,
          trashedNotes,
          selectedFolderId:
            state.selectedFolderId === id ||
            !folders.some((folder) => folder.id === state.selectedFolderId)
              ? folders[0]?.id ?? null
              : state.selectedFolderId,
          activeNote: activeStillExists ? state.activeNote : null,
          draftContent: activeStillExists ? state.draftContent : "",
          folderError: null
        };
      });
    } catch (error) {
      set({ folderError: error instanceof Error ? error.message : String(error) });
    }
  },

  loadNotesByFolder: async (folderId, limit) => {
    try {
      const notes = await listNotesByFolder(folderId, limit);
      set({ notes, selectedFolderId: folderId, folderError: null });
    } catch (error) {
      set({ notes: [], folderError: error instanceof Error ? error.message : String(error) });
    }
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
      const folders = await listFolders();
      set((state) => ({
        activeNote: note,
        draftContent: state.draftContent,
        notes: upsertNote(state.notes, note),
        folders,
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
          pinned: !activeNote.pinned,
          folderIds: activeNote.folders.map((folder) => folder.id)
        },
        saveStatus: "error",
        saveError: "Saved locally when storage is available"
      }));
      return null;
    }
  },

  setActiveNoteFolders: async (folderIds) => {
    let activeNote = get().activeNote;
    if (!activeNote) {
      activeNote = await get().saveDraft();
    }

    if (!activeNote) {
      set({ folderError: "Write something before filing" });
      return null;
    }

    try {
      set({ saveStatus: "saving", saveError: null, folderError: null });
      const note = await setNoteFolders(activeNote.id, folderIds);
      const folders = await listFolders();
      set((state) => ({
        activeNote: note,
        notes: upsertNote(state.notes, note),
        folders,
        saveStatus: "saved",
        saveError: null,
        folderError: null,
        pendingSave: null
      }));
      return note;
    } catch (error) {
      set((state) => ({
        pendingSave: {
          noteId: activeNote.id,
          content: state.draftContent,
          pinned: activeNote.pinned,
          folderIds
        },
        saveStatus: "error",
        saveError: "Saved locally when storage is available",
        folderError: error instanceof Error ? error.message : String(error)
      }));
      return null;
    }
  },

  toggleActiveNoteFolder: async (folderId) => {
    const activeNote = get().activeNote;
    const currentFolderIds = activeNote?.folders.map((folder) => folder.id) ?? [];
    const nextFolderIds = currentFolderIds.includes(folderId)
      ? currentFolderIds.filter((id) => id !== folderId)
      : [...currentFolderIds, folderId];

    return get().setActiveNoteFolders(nextFolderIds);
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
