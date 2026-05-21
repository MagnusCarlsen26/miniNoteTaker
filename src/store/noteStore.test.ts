import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/note";

vi.mock("../lib/tauri", () => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  deleteFolder: vi.fn(),
  deleteEmptyNote: vi.fn(),
  listFolders: vi.fn(),
  listNotes: vi.fn(),
  listNotesByFolder: vi.fn(),
  setPinned: vi.fn(),
  setNoteFolders: vi.fn(),
  updateNote: vi.fn()
}));

import { createFolder, createNote, deleteFolder, listFolders, listNotes, setNoteFolders, updateNote } from "../lib/tauri";
import { useNoteStore } from "./noteStore";

const createNoteMock = vi.mocked(createNote);
const createFolderMock = vi.mocked(createFolder);
const deleteFolderMock = vi.mocked(deleteFolder);
const listFoldersMock = vi.mocked(listFolders);
const listNotesMock = vi.mocked(listNotes);
const setNoteFoldersMock = vi.mocked(setNoteFolders);
const updateNoteMock = vi.mocked(updateNote);

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    content: "content",
    pinned: false,
    folders: [],
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z",
    ...overrides
  };
}

function resetStore() {
  useNoteStore.setState({
    activeNote: null,
    draftContent: "",
    notes: [],
    folders: [],
    selectedFolderId: null,
    folderError: null,
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

    expect(createNoteMock).toHaveBeenCalledWith("hello");
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

    expect(createNoteMock).toHaveBeenCalledWith("pending");
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

    expect(createNoteMock).toHaveBeenCalledWith("draft");
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

    expect(createNoteMock).toHaveBeenCalledWith("pending");
    expect(setNoteFoldersMock).toHaveBeenCalledWith("note-1", ["folder-1"]);
    expect(useNoteStore.getState().activeNote).toEqual(assigned);
  });

  it("deleting a folder reloads folders and notes", async () => {
    const remaining = note({ id: "remaining" });
    deleteFolderMock.mockResolvedValue(undefined);
    listFoldersMock.mockResolvedValue([]);
    listNotesMock.mockResolvedValue([remaining]);

    await useNoteStore.getState().deleteFolder("folder-1");

    expect(deleteFolderMock).toHaveBeenCalledWith("folder-1");
    expect(useNoteStore.getState().folders).toEqual([]);
    expect(useNoteStore.getState().notes).toEqual([remaining]);
  });
});
