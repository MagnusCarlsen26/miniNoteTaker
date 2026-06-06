import { describe, expect, it } from "vitest";
import { previewContent } from "./notePreview";

describe("previewContent", () => {
  it("collapses whitespace and trims", () => {
    expect(previewContent("  hello   world \n\t foo  ")).toBe("hello world foo");
  });

  it("returns Empty note for blank content", () => {
    expect(previewContent("   \n\t")).toBe("Empty note");
    expect(previewContent("")).toBe("Empty note");
  });
});
