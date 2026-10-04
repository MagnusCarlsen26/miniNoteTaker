import { describe, expect, it } from "vitest";
import { presentNote, previewContent } from "./notePreview";

describe("previewContent", () => {
  it("collapses whitespace and trims", () => {
    expect(previewContent("  hello   world \n\t foo  ")).toBe("hello world foo");
  });

  it("returns Empty note for blank content", () => {
    expect(previewContent("   \n\t")).toBe("Empty note");
    expect(previewContent("")).toBe("Empty note");
  });
});

describe("note presentation", () => {
  it("uses first nonempty line once and preserves body paragraphs", () => {
    expect(presentNote("\n  Title \n\nFirst paragraph\nSecond line\n\nLast paragraph")).toEqual({ title: "Title", body: "\nFirst paragraph\nSecond line\n\nLast paragraph", excerpt: "First paragraph Second line Last paragraph" });
  });
  it("labels blank notes", () => { expect(presentNote(" \n\t").title).toBe("Empty note"); });
});
