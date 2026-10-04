import { describe, expect, it } from "vitest";
import { Notebook, emptyState } from "./model";
import { parseTodos, todoEntries } from "./todo";
import { fingerprint, resolveTodoNavigation } from "./todoNavigation";
describe("Todo parsing and navigation", () => {
  it("parses multiline CRLF, indentation and exact UTF-16 source ranges", () => {
    const text = "Intro 😀\r\n  -- Buy groceries  \r\nMilk\r\nBread\r\n\t-- Call\r\nSaturday";
    const entries = parseTodos("n", text);
    expect(entries.map((e) => [e.title, e.details])).toEqual([
      ["Buy groceries", "Milk\nBread"], ["Call", "Saturday"],
    ]);
    expect(entries[0].start).toBe(text.indexOf("  --"));
    expect(entries[0].end).toBe(text.indexOf("\t--"));
    expect(text.slice(entries[1].start, entries[1].end)).toBe("\t-- Call\r\nSaturday");
  });
  it("ignores preamble and empty blocks and promotes a continuation title", () => {
    expect(parseTodos("n", "Ignored\n-- \n\n--\n\n First title \nDetails\n--  ")).toEqual([
      expect.objectContaining({ ordinal: 1, title: "First title", details: "Details" }),
    ]);
    expect(parseTodos("n", "nothing -- here")).toEqual([]);
  });
  it("gives duplicate blocks separate identities and preserves note ordering", () => {
    const book = new Notebook(() => {}, emptyState(), (() => { let id = 0; return () => `${++id}`; })());
    const a = book.edit(null, "-- Same\n-- Same", undefined, true)!;
    const b = book.edit(null, "-- Pinned", undefined, true)!;
    book.change(b, "pin");
    const entries = todoEntries(book.state.notes);
    expect(entries.map((e) => e.noteId)).toEqual([b, a, a]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
  });
  it("resolves current entries and falls back for stale or removed entries", () => {
    const book = new Notebook(() => {});
    const id = book.edit(null, "-- Buy milk\nBread", undefined, true)!;
    const entry = todoEntries(book.state.notes)[0];
    const url = `quicknote://todo?note=${id}&ordinal=0&start=0&fingerprint=${fingerprint(entry.text)}`;
    expect(resolveTodoNavigation(url, book.state.notes)).toEqual(entry);
    book.edit(id, "-- Another entry");
    expect(resolveTodoNavigation(url, book.state.notes)).toBeUndefined();
    book.edit(id, "-- Buy milk\nBread");
    book.change(id, "todo");
    expect(resolveTodoNavigation(url, book.state.notes)).toBeUndefined();
    expect(resolveTodoNavigation("invalid", book.state.notes)).toBeUndefined();
  });
});

import fixtures from "./fixtures/todos.json";
it("parses shared native fixtures and keeps completed block ordinals and UTF-16 offsets", () => {
  for (const fixture of fixtures) {
    const entries = parseTodos("fixture", fixture.content);
    expect(entries.map(e => ({ ordinal: e.ordinal, title: e.title, details: e.details,
      text: e.text, start: e.start, end: e.end, completed: e.completed }))).toEqual(fixture.expected);
  }
  const entries = parseTodos("n", fixtures[0].content);
  expect(entries.map(e => e.completed)).toEqual([true, true, false, false, false]);
  const book = new Notebook(() => {});
  const id = book.edit(null, fixtures[0].content, undefined, true)!;
  expect(todoEntries(book.state.notes).map(e => e.ordinal)).toEqual([2, 3, 4]);
  book.edit(id, fixtures[0].content.replace("[x]", "[ ]").replace("[X]", ""));
  expect(todoEntries(book.state.notes)).toHaveLength(5);
});
