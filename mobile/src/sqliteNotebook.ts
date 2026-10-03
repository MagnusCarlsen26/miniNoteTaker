import {
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
  getAllSync<T>(sql: string): T[];
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
export function openNotebook(db: NotebookDatabase) {
  db.execSync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
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
  let previous = state;
  let noteIndex = new Map(state.notes.map((note) => [note.id, note]));
  let folderIndex = new Map(state.folders.map((folder) => [folder.id, folder]));
  return new Notebook((next) => {
    const nextNotes = new Map(next.notes.map((note) => [note.id, note]));
    const nextFolders = new Map(
      next.folders.map((folder) => [folder.id, folder]),
    );
    db.withTransactionSync(() => {
      // Unchanged objects keep their identity; their content is never serialized.
      next.notes.forEach((note) => {
        if (noteIndex.get(note.id) !== note)
          db.runSync(upsertNote, note.id, JSON.stringify(note));
      });
      noteIndex.forEach((_, id) => {
        if (!nextNotes.has(id))
          db.runSync("DELETE FROM mobile_notes WHERE id = ?", id);
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
  }, state);
}
