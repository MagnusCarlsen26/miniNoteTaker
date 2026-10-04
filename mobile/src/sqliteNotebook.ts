import { parseTodos } from "./todo";
import {
  active,
  emptyState,
  Notebook,
  type Folder,
  type Note,
  type State,
} from "./model";

// Keep the native connection behind a small interface so tests use real SQLite.
export interface NotebookDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...params: string[]): unknown;
  getFirstSync<T>(sql: string): T | null;
  getAllSync<T>(sql: string, ...params: string[]): T[];
  withTransactionSync(action: () => void): void;
}
const upsertNote =
  "INSERT INTO mobile_notes (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data";
const upsertFolder =
  "INSERT INTO mobile_folders (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data";
const upsertSettings =
  "INSERT INTO mobile_settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data";
const settings = (state: State) => ({
  version: state.version,
  theme: state.theme,
  lastEditedId: state.lastEditedId,
});
function validate(state: State) {
  if (
    state.version !== 1 ||
    !Array.isArray(state.notes) ||
    !Array.isArray(state.folders)
  )
    throw new Error("Unsupported notebook format.");
}
function project(db: NotebookDatabase, note: Note) {
  db.runSync("DELETE FROM todo_entries WHERE note_id = ?", note.id);
  if (!note.isTodo || !active(note)) return;
  for (const entry of parseTodos(note.id, note.content).filter((entry) => !entry.completed)) {
    db.runSync(`INSERT INTO todo_entries
      (id, note_id, ordinal, title, details, text, start_offset, end_offset, pinned, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, entry.id, note.id,
      String(entry.ordinal), entry.title, entry.details, entry.text,
      String(entry.start), String(entry.end), String(Number(note.pinned)), note.updatedAt);
  }
}
export class StaleNoteError extends Error {
  constructor() { super("This note changed outside the app. Choose how to keep your draft."); }
}
export function openNotebook(db: NotebookDatabase, onCommitted = () => {}) {
  db.execSync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS todo_schema (id INTEGER PRIMARY KEY, version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS todo_entries (
      id TEXT PRIMARY KEY, note_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
      title TEXT NOT NULL, details TEXT NOT NULL, text TEXT NOT NULL,
      start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
      pinned INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS todo_order ON todo_entries (pinned DESC, updated_at DESC, note_id, ordinal);
    CREATE TABLE IF NOT EXISTS notebook (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mobile_notes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mobile_folders (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mobile_settings (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);`);
  const metadata = db.getFirstSync<{ data: string }>(
    "SELECT data FROM mobile_settings WHERE id = 1",
  );
  let state: State;
  if (metadata) {
    state = {
      ...JSON.parse(metadata.data),
      notes: db
        .getAllSync<{ data: string }>(
          "SELECT data FROM mobile_notes ORDER BY rowid",
        )
        .map((row) => JSON.parse(row.data) as Note),
      folders: db
        .getAllSync<{ data: string }>(
          "SELECT data FROM mobile_folders ORDER BY rowid",
        )
        .map((row) => JSON.parse(row.data) as Folder),
    };
    validate(state);
  } else {
    const legacy = db.getFirstSync<{ data: string }>(
      "SELECT data FROM notebook WHERE id = 1",
    );
    state = legacy ? JSON.parse(legacy.data) : emptyState();
    validate(state);
    // One-time migration: keep the legacy snapshot until all rows commit.
    db.withTransactionSync(() => {
      state.notes.forEach((note) =>
        db.runSync(upsertNote, note.id, JSON.stringify(note)),
      );
      state.folders.forEach((folder) =>
        db.runSync(upsertFolder, folder.id, JSON.stringify(folder)),
      );
      db.runSync(upsertSettings, JSON.stringify(settings(state)));
      db.runSync("DELETE FROM notebook WHERE id = 1");
    });
  }
  // Normalize old notes and backfill once, atomically with the schema marker.
  const migrated = db.getFirstSync<{ version: number }>(
    "SELECT version FROM todo_schema WHERE id = 1",
  );
  db.withTransactionSync(() => {
    state.notes = state.notes.map((note) => {
      if (typeof note.isTodo === "boolean") return note;
      const normalized = { ...note, isTodo: false };
      db.runSync(upsertNote, note.id, JSON.stringify(normalized));
      return normalized;
    });
    if (!migrated || migrated.version < 2) {
      db.runSync("DELETE FROM todo_entries");
      state.notes.filter((note) => note.isTodo).forEach((note) => project(db, note));
      db.runSync("INSERT OR REPLACE INTO todo_schema (id, version) VALUES (1, 2)");
    }
  });
  let previous = state;
  let noteIndex = new Map(state.notes.map((note) => [note.id, note]));
  let folderIndex = new Map(state.folders.map((folder) => [folder.id, folder]));
  return new Notebook((next) => {
    const nextNotes = new Map(next.notes.map((note) => [note.id, note]));
    const nextFolders = new Map(
      next.folders.map((folder) => [folder.id, folder]),
    );
    let widgetChanged = previous.theme !== next.theme;
    db.withTransactionSync(() => {
      // Compare inside the write transaction, before touching any rows.
      const changedIds = [...new Set([
        ...[...noteIndex].filter(([id, old]) => nextNotes.get(id) !== old).map(([id]) => id),
        ...[...nextNotes.keys()].filter(id => !noteIndex.has(id)),
      ])];
      const committed = new Map(changedIds.length ? db.getAllSync<{ id: string; data: string }>(
        `SELECT id, data FROM mobile_notes WHERE id IN (${changedIds.map(() => "?").join(",")})`, ...changedIds,
      ).map(row => [row.id, JSON.stringify(JSON.parse(row.data))]) : []);
      for (const [id, old] of noteIndex) {
        if (nextNotes.get(id) !== old && committed.get(id) !== JSON.stringify(old)) throw new StaleNoteError();
      }
      for (const [id] of nextNotes) {
        if (!noteIndex.has(id) && committed.has(id)) throw new StaleNoteError();
      }
      // Unchanged objects keep their identity; their content is never serialized.
      next.notes.forEach((note) => {
        if (noteIndex.get(note.id) !== note) {
          db.runSync(upsertNote, note.id, JSON.stringify(note));
          const old = noteIndex.get(note.id);
          if ((old?.isTodo || note.isTodo) && (!old ||
            old.content !== note.content || old.isTodo !== note.isTodo ||
            old.pinned !== note.pinned || old.updatedAt !== note.updatedAt ||
            old.archivedAt !== note.archivedAt || old.deletedAt !== note.deletedAt))
          {
            project(db, note);
            widgetChanged = true;
          }
        }
      });
      noteIndex.forEach((_, id) => {
        if (!nextNotes.has(id)) {
          db.runSync("DELETE FROM mobile_notes WHERE id = ?", id);
          if (noteIndex.get(id)?.isTodo) {
            db.runSync("DELETE FROM todo_entries WHERE note_id = ?", id);
            widgetChanged = true;
          }
        }
      });
      next.folders.forEach((folder) => {
        if (folderIndex.get(folder.id) !== folder)
          db.runSync(upsertFolder, folder.id, JSON.stringify(folder));
      });
      folderIndex.forEach((_, id) => {
        if (!nextFolders.has(id))
          db.runSync("DELETE FROM mobile_folders WHERE id = ?", id);
      });
      if (
        previous.theme !== next.theme ||
        previous.lastEditedId !== next.lastEditedId
      )
        db.runSync(upsertSettings, JSON.stringify(settings(next)));
    });
    // A failed transaction leaves both the in-memory state and indexes unchanged.
    previous = next;
    noteIndex = nextNotes;
    folderIndex = nextFolders;
    try {
      if (widgetChanged) onCommitted();
    } catch {
      // Widget failure cannot fail a committed save.
    }
  }, state);
}
