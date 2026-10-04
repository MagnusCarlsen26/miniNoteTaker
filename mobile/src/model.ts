export type Theme = "system" | "light" | "dark";
export type Note = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  isTodo: boolean;
  folderIds: string[];
  archivedAt: string | null;
  deletedAt: string | null;
};
export type Folder = { id: string; name: string };
export type State = {
  version: 1;
  notes: Note[];
  folders: Folder[];
  theme: Theme;
  lastEditedId: string | null;
};
export const emptyState = (): State => ({
  version: 1,
  notes: [],
  folders: [],
  theme: "system",
  lastEditedId: null,
});
export const active = (n: Note) => !n.archivedAt && !n.deletedAt;
export const title = (n: Note) =>
  n.content.split(/\r?\n/)[0].trim() || "Empty note";
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const sorted = (notes: Note[]) =>
  [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
export class Notebook {
  state: State;
  constructor(
    private write: (state: State) => void,
    state = emptyState(),
    private id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    private now = () => new Date().toISOString(),
  ) {
    this.state = state;
  }
  private commit(next: State) {
    this.write(next);
    this.state = next;
  }
  edit(
    id: string | null,
    content: string,
    date?: string,
    isTodo = false,
  ): string | null {
    const timestamp = this.now();
    if (!id) {
      if (!content.trim()) return null;
      id = this.id();
      const createdAt = date
        ? new Date(`${date}T12:00:00`).toISOString()
        : timestamp;
      const note: Note = {
        id,
        content,
        createdAt,
        updatedAt: timestamp,
        pinned: false,
        isTodo,
        folderIds: [],
        archivedAt: null,
        deletedAt: null,
      };
      this.commit({
        ...this.state,
        notes: [...this.state.notes, note],
        lastEditedId: id,
      });
    } else {
      const note = this.state.notes.find((n) => n.id === id);
      if (!note || !active(note))
        throw new Error("Restore this note before editing.");
      this.commit({
        ...this.state,
        notes: this.state.notes.map((n) =>
          n.id === id ? { ...n, content, updatedAt: timestamp } : n,
        ),
        lastEditedId: id,
      });
    }
    return id;
  }
  change(
    id: string,
    action: "pin" | "archive" | "trash" | "restore" | "delete" | "folders" | "todo",
    folderIds: string[] = [],
  ) {
    const note = this.state.notes.find((n) => n.id === id);
    if (!note) throw new Error("Note not found.");
    if (action === "delete") {
      if (!note.deletedAt)
        throw new Error("Only trashed notes can be permanently deleted.");
      this.commit({
        ...this.state,
        notes: this.state.notes.filter((n) => n.id !== id),
        lastEditedId:
          this.state.lastEditedId === id ? null : this.state.lastEditedId,
      });
      return;
    }
    if (["pin", "archive", "folders", "todo"].includes(action) && !active(note))
      throw new Error("Restore this note first.");
    const patch: Partial<Note> =
      action === "todo"
        ? { isTodo: !note.isTodo }
        : action === "pin"
        ? { pinned: !note.pinned, updatedAt: this.now() }
        : action === "archive"
          ? { archivedAt: this.now(), pinned: false }
          : action === "trash"
            ? { deletedAt: this.now(), pinned: false }
            : action === "restore"
              ? note.deletedAt
                ? { deletedAt: null }
                : { archivedAt: null }
              : {
                  folderIds: [...new Set(folderIds)].filter((id) =>
                    this.state.folders.some((f) => f.id === id),
                  ),
                };
    this.commit({
      ...this.state,
      notes: this.state.notes.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      ),
    });
  }
  createFolder(raw: string) {
    const name = raw.trim();
    if (!name || name.length > 40)
      throw new Error("Use a folder name of 1–40 characters.");
    if (
      this.state.folders.some(
        (f) => f.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("This folder already exists.");
    this.commit({
      ...this.state,
      folders: [...this.state.folders, { id: this.id(), name }],
    });
  }
  deleteFolder(id: string) {
    this.commit({
      ...this.state,
      folders: this.state.folders.filter((f) => f.id !== id),
      notes: this.state.notes.map((n) => ({
        ...n,
        folderIds: n.folderIds.filter((f) => f !== id),
        ...(active(n) && n.folderIds.includes(id)
          ? { deletedAt: this.now(), pinned: false }
          : {}),
      })),
    });
  }
  setTheme(theme: Theme) {
    this.commit({ ...this.state, theme });
  }
}
