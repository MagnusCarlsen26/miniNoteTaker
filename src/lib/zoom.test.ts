import { describe, expect, it } from "vitest";
import { normalizeZoom, ZOOM_MAX, ZOOM_MIN } from "./zoom";

describe("normalizeZoom", () => {
  it("keeps values within range unchanged when already rounded", () => {
    expect(normalizeZoom(1.0)).toBe(1.0);
    expect(normalizeZoom(1.5)).toBe(1.5);
  });

  it("clamps below minimum", () => {
    expect(normalizeZoom(0.3)).toBe(ZOOM_MIN);
    expect(normalizeZoom(-1)).toBe(ZOOM_MIN);
  });

  it("clamps above maximum", () => {
    expect(normalizeZoom(2.5)).toBe(ZOOM_MAX);
    expect(normalizeZoom(10)).toBe(ZOOM_MAX);
  });

  it("rounds to one decimal place", () => {
    expect(normalizeZoom(1.14)).toBe(1.1);
    expect(normalizeZoom(1.15)).toBe(1.2);
    expect(normalizeZoom(1.16)).toBe(1.2);
  });
});
