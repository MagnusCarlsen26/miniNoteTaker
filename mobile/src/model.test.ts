import { describe, expect, it } from "vitest";
import {
  active,
  dayKey,
  emptyState,
  Notebook,
  sorted,
  title,
  type State,
} from "./model";
function setup() {
  let disk = emptyState();
  let sequence = 0;
  const book = new Notebook(
    (s) => {
      disk = structuredClone(s);
    },
    disk,
    () => String(++sequence),
    () => "2026-10-03T09:00:00.000Z",
  );
  return { book, disk: () => disk };
}
describe("mobile notebook", () => {
  it("does not create untouched or whitespace drafts and retains cleared saved notes", () => {
    const { book } = setup();
    expect(book.edit(null, "")).toBeNull();
    expect(book.edit(null, " \n")).toBeNull();
    const id = book.edit(null, "Title\nBody")!;
    book.edit(id, "");
    expect(book.state.notes).toHaveLength(1);
    expect(title(book.state.notes[0])).toBe("Empty note");
  });
  it("persists edits and last edited note atomically for restart", () => {
    const { book, disk } = setup();
    const id = book.edit(null, "First")!;
    book.edit(id, "Second");
    const restored = new Notebook(() => {}, disk());
    expect(restored.state.lastEditedId).toBe(id);
    expect(restored.state.notes[0].content).toBe("Second");
  });
  it("does not publish unsaved changes after storage failure and allows retry", () => {
    let fail = false;
    let disk: State = emptyState();
    const book = new Notebook((s) => {
      if (fail) throw new Error("Disk full");
      disk = s;
    });
    const id = book.edit(null, "Saved")!;
    fail = true;
    expect(() => book.edit(id, "Unsaved")).toThrow("Disk full");
    expect(book.state.notes[0].content).toBe("Saved");
    expect(disk.notes[0].content).toBe("Saved");
    fail = false;
    book.edit(id, "Unsaved");
    expect(disk.notes[0].content).toBe("Unsaved");
  });
  it("sorts pinned first and then by update time", () => {
    const { book } = setup();
    const a = book.edit(null, "A")!;
    book.edit(null, "B");
    book.change(a, "pin");
    expect(sorted(book.state.notes)[0].id).toBe(a);
    const notes = book.state.notes.map((n) => ({
      ...n,
      pinned: false,
      updatedAt: n.id === a ? "2026-01-01" : "2026-02-01",
    }));
    expect(sorted(notes)[0].content).toBe("B");
  });
  it("archives are excluded from active notes and cannot be edited until restored", () => {
    const { book } = setup();
    const id = book.edit(null, "A")!;
    book.change(id, "pin");
    book.change(id, "archive");
    expect(active(book.state.notes[0])).toBe(false);
    expect(book.state.notes[0].pinned).toBe(false);
    expect(() => book.edit(id, "B")).toThrow("Restore");
    expect(() => book.change(id, "pin")).toThrow("Restore");
    book.change(id, "restore");
    book.edit(id, "B");
    expect(active(book.state.notes[0])).toBe(true);
  });
  it("restores archived trash to Archive, then allows restore to Recent", () => {
    const { book } = setup();
    const id = book.edit(null, "A")!;
    book.change(id, "archive");
    book.change(id, "trash");
    expect(() => book.edit(id, "B")).toThrow();
    book.change(id, "restore");
    expect(book.state.notes[0].deletedAt).toBeNull();
    expect(book.state.notes[0].archivedAt).not.toBeNull();
    book.change(id, "restore");
    expect(active(book.state.notes[0])).toBe(true);
  });
  it("only permanently deletes trashed notes and clears their resume pointer", () => {
    const { book } = setup();
    const id = book.edit(null, "A")!;
    expect(() => book.change(id, "delete")).toThrow();
    book.change(id, "trash");
    book.change(id, "delete");
    expect(book.state.notes).toEqual([]);
    expect(book.state.lastEditedId).toBeNull();
  });
  it("supports multiple folders and deleting one trashes active members across folders", () => {
    const { book } = setup();
    book.createFolder("One");
    book.createFolder("Two");
    const [one, two] = book.state.folders;
    const id = book.edit(null, "Active")!;
    book.change(id, "folders", [one.id, two.id, two.id]);
    const archived = book.edit(null, "Archived")!;
    book.change(archived, "folders", [one.id]);
    book.change(archived, "archive");
    book.deleteFolder(one.id);
    const note = book.state.notes.find((n) => n.id === id)!;
    expect(note.deletedAt).not.toBeNull();
    expect(note.folderIds).toEqual([two.id]);
    expect(
      book.state.notes.find((n) => n.id === archived)!.deletedAt,
    ).toBeNull();
    book.change(id, "restore");
    expect(active(book.state.notes.find((n) => n.id === id)!)).toBe(true);
    book.change(id, "folders", []);
    expect(book.state.notes.find((n) => n.id === id)!.folderIds).toEqual([]);
  });
  it("validates folder names and prevents case-insensitive duplicates", () => {
    const { book } = setup();
    expect(() => book.createFolder(" ")).toThrow();
    expect(() => book.createFolder("x".repeat(41))).toThrow();
    book.createFolder(" Work ");
    expect(() => book.createFolder("work")).toThrow();
    expect(book.state.folders[0].name).toBe("Work");
  });
  it("assigns calendar creation dates using local time and keeps them through edits", () => {
    const { book } = setup();
    const id = book.edit(null, "Day note", "2026-02-28")!;
    expect(dayKey(new Date(book.state.notes[0].createdAt))).toBe("2026-02-28");
    book.edit(id, "Edited");
    expect(dayKey(new Date(book.state.notes[0].createdAt))).toBe("2026-02-28");
  });
  it("persists all theme preferences", () => {
    const { book, disk } = setup();
    for (const theme of ["dark", "light", "system"] as const) {
      book.setTheme(theme);
      expect(disk().theme).toBe(theme);
    }
  });
});
