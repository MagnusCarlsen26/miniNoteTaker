import { describe, expect, it } from "vitest";
import { shouldUseDarkTheme } from "./theme";

describe("shouldUseDarkTheme", () => {
  it("uses dark for dark preference", () => {
    expect(shouldUseDarkTheme("dark", false)).toBe(true);
  });

  it("uses light for light preference", () => {
    expect(shouldUseDarkTheme("light", true)).toBe(false);
  });

  it("follows system preference for system preference", () => {
    expect(shouldUseDarkTheme("system", true)).toBe(true);
    expect(shouldUseDarkTheme("system", false)).toBe(false);
  });
});
