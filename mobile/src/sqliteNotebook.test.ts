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
