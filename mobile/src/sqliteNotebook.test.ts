import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { emptyState } from "./model";
import { openNotebook, type NotebookDatabase } from "./sqliteNotebook";
const connections: DatabaseSync[] = [];
afterEach(() => connections.splice(0).forEach((db) => db.close()));
function database() {
  const connection = new DatabaseSync(":memory:");
  connections.push(connection);
  const writes: string[] = [];
  let failSettings = false;
  const db: NotebookDatabase = {
    execSync: (sql) => connection.exec(sql),
    runSync: (sql, ...params) => {
      writes.push(sql);
      if (failSettings && sql.includes("INSERT INTO mobile_settings"))
        throw new Error("Disk full");
      return connection.prepare(sql).run(...params);
    },
    getFirstSync: <T>(sql: string) =>
      (connection.prepare(sql).get() as T) ?? null,
    getAllSync: <T>(sql: string) => connection.prepare(sql).all() as T[],
    withTransactionSync: (action) => {
      connection.exec("BEGIN");
      try {
        action();
        connection.exec("COMMIT");
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return {
    db,
    writes,
    connection,
    fail: (value: boolean) => {
      failSettings = value;
    },
  };
}
describe("SQLite notebook persistence", () => {
  it("reloads real SQLite rows with note content, folders, theme, and resume selection", () => {
    const { db } = database();
    const book = openNotebook(db);
    book.createFolder("Work");
    const id = book.edit(null, "Saved")!;
    book.change(id, "folders", [book.state.folders[0].id]);
    book.setTheme("dark");
    book.edit(id, "");
    expect(openNotebook(db).state).toEqual(book.state);
  });
  it("writes only the edited note and does not serialize archived or trashed content", () => {
    const { db, writes } = database();
    const book = openNotebook(db);
    const id = book.edit(null, "Editing")!;
    const archive = book.edit(null, "Archived ".repeat(10000))!;
    book.change(archive, "archive");
    const trash = book.edit(null, "Trash ".repeat(10000))!;
    book.change(trash, "trash");
    book.edit(id, "Editing again");
    writes.length = 0;
    const archived = book.state.notes.find((n) => n.id === archive)!;
    // If unrelated content were serialized, this getter would fail the save.
    Object.defineProperty(archived, "content", {
      get: () => {
        throw new Error("Unrelated content read");
      },
      configurable: true,
    });
    book.edit(id, "One more character");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("INSERT INTO mobile_notes");
  });
  it("rolls back note and resume writes together after failure and retries successfully", () => {
    const { db, fail } = database();
    const book = openNotebook(db);
    const before = book.state;
    fail(true);
    expect(() => book.edit(null, "Not saved")).toThrow("Disk full");
    expect(book.state).toBe(before);
    expect(openNotebook(db).state.notes).toEqual([]);
    fail(false);
    book.edit(null, "Retry");
    expect(openNotebook(db).state).toEqual(book.state);
  });
  it("migrates the original snapshot once without losing archive, trash, or settings", () => {
    const { db, connection } = database();
    const legacy = emptyState();
    const book = openNotebook(db);
    const a = book.edit(null, "Archive")!;
    book.change(a, "archive");
    const b = book.edit(null, "Trash")!;
    book.change(b, "trash");
    book.setTheme("light");
    Object.assign(legacy, book.state);
    connection.exec(
      "DELETE FROM mobile_notes; DELETE FROM mobile_folders; DELETE FROM mobile_settings;",
    );
    db.runSync(
      "INSERT INTO notebook (id, data) VALUES (1, ?)",
      JSON.stringify(legacy),
    );
    expect(openNotebook(db).state).toEqual(legacy);
    expect(db.getFirstSync("SELECT data FROM notebook")).toBeNull();
    expect(openNotebook(db).state).toEqual(legacy);
  });
});

describe("Todo projection transactions", () => {
  it("retains first-save Todo assignment alongside folders across restart and lifecycle changes", () => {
    const { db } = database();
    const book = openNotebook(db);
    expect(book.edit(null, "", undefined, true)).toBeNull();
    const id = book.edit(null, "-- First\nDetails\n-- Second", undefined, true)!;
    book.createFolder("Work");
    book.change(id, "folders", [book.state.folders[0].id]);
    expect(openNotebook(db).state.notes[0].isTodo).toBe(true);
    const entries = () => db.getAllSync<{ title: string }>("SELECT title FROM todo_entries ORDER BY ordinal");
    expect(entries().map((e) => e.title)).toEqual(["First", "Second"]);
    book.change(id, "archive"); expect(entries()).toEqual([]);
    book.change(id, "trash"); book.change(id, "restore"); expect(entries()).toEqual([]);
    book.change(id, "restore"); expect(entries()).toHaveLength(2);
    book.change(id, "todo"); expect(entries()).toEqual([]);
    expect(book.state.notes[0].folderIds).toHaveLength(1);
    book.change(id, "todo"); book.change(id, "trash"); book.change(id, "restore");
    expect(entries()).toHaveLength(2);
    book.change(id, "trash"); book.change(id, "delete"); expect(entries()).toEqual([]);
  });
  it("backfills old databases transactionally and defaults absent flags to false", () => {
    const { db, connection } = database();
    const book = openNotebook(db);
    const a = book.edit(null, "-- Existing", undefined, true)!;
    book.edit(null, "Ordinary");
    const legacy = JSON.parse(JSON.stringify(book.state));
    delete legacy.notes[1].isTodo;
    connection.exec("DELETE FROM todo_schema; DELETE FROM todo_entries; DELETE FROM mobile_notes; DELETE FROM mobile_settings;");
    db.runSync("INSERT INTO notebook (id, data) VALUES (1, ?)", JSON.stringify(legacy));
    const restored = openNotebook(db);
    expect(restored.state.notes[1].isTodo).toBe(false);
    expect(db.getAllSync("SELECT note_id FROM todo_entries")).toEqual([{ note_id: a }]);
    expect(openNotebook(db).state).toEqual(restored.state);
  });
  it("rolls projection and source back together on failure and retries", () => {
    const { db, connection } = database();
    const book = openNotebook(db);
    const id = book.edit(null, "-- Original", undefined, true)!;
    connection.exec("CREATE TRIGGER reject_projection BEFORE INSERT ON todo_entries BEGIN SELECT RAISE(ABORT, 'Projection failed'); END;");
    expect(() => book.edit(id, "-- Changed")).toThrow("Projection failed");
    expect(book.state.notes[0].content).toBe("-- Original");
    expect(db.getAllSync("SELECT title FROM todo_entries")).toEqual([{ title: "Original" }]);
    expect(openNotebook(db).state.notes[0].content).toBe("-- Original");
    connection.exec("DROP TRIGGER reject_projection");
    book.edit(id, "-- Changed");
    expect(db.getAllSync("SELECT title FROM todo_entries")).toEqual([{ title: "Changed" }]);
  });
  it("isolates refresh failures and skips projection and refresh for ordinary saves", () => {
    const { db, writes } = database();
    let calls = 0;
    const book = openNotebook(db, () => { calls++; throw new Error("Launcher unavailable"); });
    const ordinary = book.edit(null, "Ordinary")!;
    writes.length = 0;
    book.edit(ordinary, "Ordinary edit");
    expect(writes).toHaveLength(1); expect(calls).toBe(0);
    const todo = book.edit(null, "-- Todo", undefined, true)!;
    expect(calls).toBe(1); expect(book.state.notes.find((n) => n.id === todo)?.isTodo).toBe(true);
    book.edit(todo, "-- Retry refresh"); expect(calls).toBe(2);
    expect(openNotebook(db).state).toEqual(book.state);
  });
  it("orders committed rows pinned first, then recent, preserving per-note ordinals", () => {
    const { db } = database();
    const book = openNotebook(db);
    const a = book.edit(null, "-- A1\n-- A2", undefined, true)!;
    const b = book.edit(null, "-- B", undefined, true)!;
    book.change(a, "pin");
    expect(db.getAllSync<{ note_id: string }>("SELECT note_id FROM todo_entries ORDER BY pinned DESC, updated_at DESC, (SELECT rowid FROM mobile_notes WHERE mobile_notes.id = todo_entries.note_id), ordinal").map((e) => e.note_id)).toEqual([a, a, b]);
  });
});

it("retries a failed projection migration without committing a partial backfill or schema marker", () => {
  const { db, connection } = database();
  const book = openNotebook(db);
  book.edit(null, "-- Backfill", undefined, true);
  connection.exec("DELETE FROM todo_schema; DELETE FROM todo_entries; CREATE TRIGGER reject_backfill BEFORE INSERT ON todo_entries BEGIN SELECT RAISE(ABORT, 'Backfill failed'); END;");
  expect(() => openNotebook(db)).toThrow("Backfill failed");
  expect(db.getAllSync("SELECT * FROM todo_entries")).toEqual([]);
  expect(db.getFirstSync("SELECT version FROM todo_schema")).toBeNull();
  expect(db.getAllSync("SELECT * FROM mobile_notes")).toHaveLength(1);
  connection.exec("DROP TRIGGER reject_backfill");
  expect(openNotebook(db).state).toEqual(book.state);
  expect(db.getAllSync("SELECT title FROM todo_entries")).toEqual([{ title: "Backfill" }]);
});
