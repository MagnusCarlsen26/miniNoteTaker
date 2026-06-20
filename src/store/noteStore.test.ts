import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/note";

vi.mock("../lib/tauri", () => ({
  archiveNote: vi.fn(),
  createFolder: vi.fn(),
  createNote: vi.fn(),
  deleteFolder: vi.fn(),
  deleteEmptyNote: vi.fn(),
  getNote: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  LAST_OPEN_NOTE_ID_KEY: "editor.lastNoteId",
  listArchivedNotes: vi.fn(),
  listFolders: vi.fn(),
  listNotes: vi.fn(),
  listNotesByCreatedDate: vi.fn(),
  listNotesByFolder: vi.fn(),
  listTrashedNotes: vi.fn(),
  permanentlyDeleteNote: vi.fn(),
  restoreNote: vi.fn(),
  setPinned: vi.fn(),
  setNoteFolders: vi.fn(),
  softDeleteNote: vi.fn(),
  unarchiveNote: vi.fn(),
  updateNote: vi.fn()
}));

import {
  archiveNote,
  createFolder,
  createNote,
  deleteFolder,
  getNote,
  getSetting,
  LAST_OPEN_NOTE_ID_KEY,
  listArchivedNotes,
  listFolders,
  listNotes,
  listTrashedNotes,
  permanentlyDeleteNote,
  restoreNote,
  setNoteFolders,
  setSetting,
  softDeleteNote,
  unarchiveNote,
  updateNote
} from "../lib/tauri";
import { useNoteStore } from "./noteStore";

const archiveNoteMock = vi.mocked(archiveNote);
const createNoteMock = vi.mocked(createNote);
const listArchivedNotesMock = vi.mocked(listArchivedNotes);
const unarchiveNoteMock = vi.mocked(unarchiveNote);
const createFolderMock = vi.mocked(createFolder);
const deleteFolderMock = vi.mocked(deleteFolder);
const getNoteMock = vi.mocked(getNote);
const getSettingMock = vi.mocked(getSetting);
const listFoldersMock = vi.mocked(listFolders);
const listNotesMock = vi.mocked(listNotes);
const listTrashedNotesMock = vi.mocked(listTrashedNotes);
const permanentlyDeleteNoteMock = vi.mocked(permanentlyDeleteNote);
const restoreNoteMock = vi.mocked(restoreNote);
const setNoteFoldersMock = vi.mocked(setNoteFolders);
const setSettingMock = vi.mocked(setSetting);
const softDeleteNoteMock = vi.mocked(softDeleteNote);
const updateNoteMock = vi.mocked(updateNote);

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    content: "content",
    pinned: false,
    folders: [],
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z",
    deleted_at: null,
    archived_at: null,
    ...overrides
  };
}

function resetStore() {
  useNoteStore.setState({
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
    pendingSave: null
  });
}

describe("noteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("does not persist an empty whitespace draft", async () => {
    useNoteStore.getState().setDraftContent("   \n\t");

    await useNoteStore.getState().saveDraft();

    expect(createNoteMock).not.toHaveBeenCalled();
    expect(useNoteStore.getState().saveStatus).toBe("idle");
  });

  it("creates a note for a new non-empty draft", async () => {
    const saved = note({ content: "hello" });
    createNoteMock.mockResolvedValue(saved);
    useNoteStore.getState().setDraftContent("hello");

    await useNoteStore.getState().saveDraft();

    expect(createNoteMock).toHaveBeenCalledWith("hello", undefined);
    expect(useNoteStore.getState().activeNote).toEqual(saved);
    expect(useNoteStore.getState().notes).toEqual([saved]);
    expect(useNoteStore.getState().saveStatus).toBe("saved");
  });

  it("updates an existing note instead of creating", async () => {
    const existing = note({ id: "existing", content: "before" });
    const saved = note({ id: "existing", content: "after" });
    updateNoteMock.mockResolvedValue(saved);
    useNoteStore.getState().setActiveNote(existing);
    useNoteStore.getState().setDraftContent("after");

    await useNoteStore.getState().saveDraft();

    expect(updateNoteMock).toHaveBeenCalledWith("existing", "after");
    expect(createNoteMock).not.toHaveBeenCalled();
    expect(useNoteStore.getState().activeNote).toEqual(saved);
  });

  it("preserves draft in memory when save fails", async () => {
    createNoteMock.mockRejectedValue(new Error("offline"));
    useNoteStore.getState().setDraftContent("unsaved");

    await useNoteStore.getState().saveDraft();

    expect(useNoteStore.getState().draftContent).toBe("unsaved");
    expect(useNoteStore.getState().pendingSave).toEqual({
      noteId: null,
      content: "unsaved",
      pinned: undefined
    });
    expect(useNoteStore.getState().saveStatus).toBe("error");
  });

  it("retries pending save and clears retry state", async () => {
    const saved = note({ id: "retry", content: "pending" });
    createNoteMock.mockResolvedValue(saved);
    useNoteStore.setState({
      draftContent: "pending",
      pendingSave: { noteId: null, content: "pending" },
      saveStatus: "error"
    });

    await useNoteStore.getState().retryPendingSave();

    expect(createNoteMock).toHaveBeenCalledWith("pending", undefined);
    expect(useNoteStore.getState().pendingSave).toBeNull();
    expect(useNoteStore.getState().saveStatus).toBe("saved");
  });

  it("sorts pinned notes above unpinned notes, then by newest update", async () => {
    const oldPinned = note({
      id: "old-pinned",
      pinned: true,
      updated_at: "2026-05-21T00:00:00.000Z"
    });
    const updatedPinned = note({
      id: "old-pinned",
      pinned: true,
      updated_at: "2026-05-21T00:02:00.000Z"
    });
    const newestUnpinned = note({
      id: "newest-unpinned",
      pinned: false,
      updated_at: "2026-05-21T00:03:00.000Z"
    });
    listNotesMock.mockResolvedValue([oldPinned, newestUnpinned]);
    useNoteStore.setState({ notes: [oldPinned, newestUnpinned] });
    updateNoteMock.mockResolvedValue(updatedPinned);
    useNoteStore.getState().setActiveNote(oldPinned);
    useNoteStore.getState().setDraftContent("updated pinned");

    await useNoteStore.getState().saveDraft();

    expect(useNoteStore.getState().notes.map((item) => item.id)).toEqual([
      "old-pinned",
      "newest-unpinned"
    ]);
  });

  it("loads folders", async () => {
    const folders = [
      {
        id: "folder-1",
        name: "Work",
        note_count: 0,
        created_at: "2026-05-21T00:00:00.000Z",
        updated_at: "2026-05-21T00:00:00.000Z"
      }
    ];
    listFoldersMock.mockResolvedValue(folders);

    await useNoteStore.getState().loadFolders();

    expect(useNoteStore.getState().folders).toEqual(folders);
    expect(useNoteStore.getState().selectedFolderId).toBe("folder-1");
  });

  it("creates a folder and adds it to the folder list", async () => {
    const folder = {
      id: "folder-1",
      name: "Work",
      note_count: 0,
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z"
    };
    createFolderMock.mockResolvedValue(folder);

    await useNoteStore.getState().createFolder(" Work ");

    expect(createFolderMock).toHaveBeenCalledWith(" Work ");
    expect(useNoteStore.getState().folders).toEqual([folder]);
  });

  it("assigning a folder to a new non-empty draft saves the note first", async () => {
    const saved = note({ id: "note-1", content: "draft" });
    const assigned = note({ id: "note-1", content: "draft", folders: [{ id: "folder-1", name: "Work", note_count: 1, created_at: "now", updated_at: "now" }] });
    createNoteMock.mockResolvedValue(saved);
    setNoteFoldersMock.mockResolvedValue(assigned);
    listFoldersMock.mockResolvedValue(assigned.folders);
    useNoteStore.getState().setDraftContent("draft");

    await useNoteStore.getState().setActiveNoteFolders(["folder-1"]);

    expect(createNoteMock).toHaveBeenCalledWith("draft", undefined);
    expect(setNoteFoldersMock).toHaveBeenCalledWith("note-1", ["folder-1"]);
    expect(useNoteStore.getState().activeNote).toEqual(assigned);
  });

  it("assigning a folder to an empty draft does not create a note", async () => {
    await useNoteStore.getState().setActiveNoteFolders(["folder-1"]);

    expect(createNoteMock).not.toHaveBeenCalled();
    expect(useNoteStore.getState().folderError).toBe("Write something before filing");
  });

  it("folder assignment failure preserves draft and reports error", async () => {
    const saved = note({ id: "note-1", content: "draft" });
    createNoteMock.mockResolvedValue(saved);
    setNoteFoldersMock.mockRejectedValue(new Error("offline"));
    useNoteStore.getState().setDraftContent("draft");

    await useNoteStore.getState().setActiveNoteFolders(["folder-1"]);

    expect(useNoteStore.getState().draftContent).toBe("draft");
    expect(useNoteStore.getState().folderError).toBe("offline");
    expect(useNoteStore.getState().pendingSave?.folderIds).toEqual(["folder-1"]);
  });

  it("pending save with folders retries content first, then folders", async () => {
    const saved = note({ id: "note-1", content: "pending" });
    const assigned = note({ id: "note-1", content: "pending", folders: [{ id: "folder-1", name: "Work", note_count: 1, created_at: "now", updated_at: "now" }] });
    createNoteMock.mockResolvedValue(saved);
    setNoteFoldersMock.mockResolvedValue(assigned);
    listFoldersMock.mockResolvedValue(assigned.folders);
    useNoteStore.setState({
      draftContent: "pending",
      pendingSave: { noteId: null, content: "pending", folderIds: ["folder-1"] },
      saveStatus: "error"
    });

    await useNoteStore.getState().retryPendingSave();

    expect(createNoteMock).toHaveBeenCalledWith("pending", undefined);
    expect(setNoteFoldersMock).toHaveBeenCalledWith("note-1", ["folder-1"]);
    expect(useNoteStore.getState().activeNote).toEqual(assigned);
  });

  it("soft deleting a note removes it from active notes and loads trash", async () => {
    const active = note({ id: "active" });
    const trashed = note({ id: "active", deleted_at: "2026-05-22T00:00:00.000Z" });
    softDeleteNoteMock.mockResolvedValue(undefined);
    listNotesMock.mockResolvedValue([]);
    listTrashedNotesMock.mockResolvedValue([trashed]);
    listArchivedNotesMock.mockResolvedValue([]);
    listFoldersMock.mockResolvedValue([]);
    useNoteStore.setState({ notes: [active] });

    await useNoteStore.getState().softDeleteNote("active");

    expect(softDeleteNoteMock).toHaveBeenCalledWith("active");
    expect(useNoteStore.getState().notes).toEqual([]);
    expect(useNoteStore.getState().trashedNotes).toEqual([trashed]);
  });

  it("soft deleting the active note clears the editor draft", async () => {
    const active = note({ id: "active", content: "draft" });
    softDeleteNoteMock.mockResolvedValue(undefined);
    listNotesMock.mockResolvedValue([]);
    listTrashedNotesMock.mockResolvedValue([note({ id: "active", deleted_at: "2026-05-22T00:00:00.000Z" })]);
    listArchivedNotesMock.mockResolvedValue([]);
    listFoldersMock.mockResolvedValue([]);
    useNoteStore.setState({ activeNote: active, draftContent: "draft", pendingSave: { noteId: "active", content: "draft" } });

    await useNoteStore.getState().softDeleteNote("active");

    expect(useNoteStore.getState().activeNote).toBeNull();
    expect(useNoteStore.getState().draftContent).toBe("");
    expect(useNoteStore.getState().pendingSave).toBeNull();
  });

  it("restoring a note removes it from trash and upserts active notes", async () => {
    const trashed = note({ id: "restore", deleted_at: "2026-05-22T00:00:00.000Z" });
    const restored = note({ id: "restore", updated_at: "2026-05-22T00:01:00.000Z" });
    restoreNoteMock.mockResolvedValue(restored);
    listFoldersMock.mockResolvedValue([]);
    useNoteStore.setState({ notes: [], trashedNotes: [trashed] });

    await useNoteStore.getState().restoreNote("restore");

    expect(restoreNoteMock).toHaveBeenCalledWith("restore");
    expect(useNoteStore.getState().trashedNotes).toEqual([]);
    expect(useNoteStore.getState().notes).toEqual([restored]);
  });

  it("permanently deleting removes note from trash", async () => {
    const trashed = note({ id: "trash", deleted_at: "2026-05-22T00:00:00.000Z" });
    permanentlyDeleteNoteMock.mockResolvedValue(undefined);
    useNoteStore.setState({ trashedNotes: [trashed] });

    await useNoteStore.getState().permanentlyDeleteNote("trash");

    expect(permanentlyDeleteNoteMock).toHaveBeenCalledWith("trash");
    expect(useNoteStore.getState().trashedNotes).toEqual([]);
  });

  it("archiving a note removes it from active notes and loads archive", async () => {
    const active = note({ id: "active" });
    const archived = note({ id: "active", archived_at: "2026-05-22T00:00:00.000Z", pinned: false });
    archiveNoteMock.mockResolvedValue(archived);
    listNotesMock.mockResolvedValue([]);
    listArchivedNotesMock.mockResolvedValue([archived]);
    listFoldersMock.mockResolvedValue([]);
    useNoteStore.setState({ notes: [active] });

    await useNoteStore.getState().archiveNote("active");

    expect(archiveNoteMock).toHaveBeenCalledWith("active");
    expect(useNoteStore.getState().notes).toEqual([]);
    expect(useNoteStore.getState().archivedNotes).toEqual([archived]);
  });

  it("unarchiving a note restores it to active notes", async () => {
    const archived = note({ id: "restore", archived_at: "2026-05-22T00:00:00.000Z" });
    const restored = note({ id: "restore", updated_at: "2026-05-22T00:01:00.000Z" });
    unarchiveNoteMock.mockResolvedValue(restored);
    listNotesMock.mockResolvedValue([restored]);
    listArchivedNotesMock.mockResolvedValue([]);
    listFoldersMock.mockResolvedValue([]);
    useNoteStore.setState({ archivedNotes: [archived] });

    await useNoteStore.getState().unarchiveNote("restore");

    expect(unarchiveNoteMock).toHaveBeenCalledWith("restore");
    expect(useNoteStore.getState().archivedNotes).toEqual([]);
    expect(useNoteStore.getState().notes).toEqual([restored]);
  });

  it("deleting a folder reloads folders notes and trashed notes", async () => {
    const remaining = note({ id: "remaining" });
    const trashed = note({ id: "trashed", deleted_at: "2026-05-22T00:00:00.000Z" });
    deleteFolderMock.mockResolvedValue(undefined);
    listFoldersMock.mockResolvedValue([]);
    listNotesMock.mockResolvedValue([remaining]);
    listTrashedNotesMock.mockResolvedValue([trashed]);

    await useNoteStore.getState().deleteFolder("folder-1");

    expect(deleteFolderMock).toHaveBeenCalledWith("folder-1");
    expect(useNoteStore.getState().folders).toEqual([]);
    expect(useNoteStore.getState().notes).toEqual([remaining]);
    expect(useNoteStore.getState().trashedNotes).toEqual([trashed]);
  });

  it("persistLastOpenNoteId writes setting when activeNote is set", async () => {
    const active = note({ id: "note-a" });
    useNoteStore.getState().setActiveNote(active);

    await useNoteStore.getState().persistLastOpenNoteId();

    expect(setSettingMock).toHaveBeenCalledWith(LAST_OPEN_NOTE_ID_KEY, "note-a");
  });

  it("persistLastOpenNoteId skips when activeNote is null", async () => {
    await useNoteStore.getState().persistLastOpenNoteId();

    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it("restoreLastOpenNote loads note when setting exists and editor is empty", async () => {
    const saved = note({ id: "note-a", content: "restored" });
    getSettingMock.mockResolvedValue("note-a");
    getNoteMock.mockResolvedValue(saved);

    await useNoteStore.getState().restoreLastOpenNote();

    expect(getSettingMock).toHaveBeenCalledWith(LAST_OPEN_NOTE_ID_KEY);
    expect(getNoteMock).toHaveBeenCalledWith("note-a");
    expect(useNoteStore.getState().activeNote).toEqual(saved);
    expect(useNoteStore.getState().draftContent).toBe("restored");
  });

  it("restoreLastOpenNote is a no-op when editor already has active note", async () => {
    useNoteStore.getState().setActiveNote(note({ id: "current" }));

    await useNoteStore.getState().restoreLastOpenNote();

    expect(getSettingMock).not.toHaveBeenCalled();
    expect(getNoteMock).not.toHaveBeenCalled();
    expect(useNoteStore.getState().activeNote?.id).toBe("current");
  });

  it("restoreLastOpenNote is a no-op when editor has draft content", async () => {
    useNoteStore.getState().setDraftContent("typing");

    await useNoteStore.getState().restoreLastOpenNote();

    expect(getSettingMock).not.toHaveBeenCalled();
    expect(getNoteMock).not.toHaveBeenCalled();
  });

  it("restoreLastOpenNote is a no-op when note is missing", async () => {
    getSettingMock.mockResolvedValue("gone");
    getNoteMock.mockResolvedValue(null);

    await useNoteStore.getState().restoreLastOpenNote();

    expect(getNoteMock).toHaveBeenCalledWith("gone");
    expect(useNoteStore.getState().activeNote).toBeNull();
    expect(useNoteStore.getState().draftContent).toBe("");
  });
});
