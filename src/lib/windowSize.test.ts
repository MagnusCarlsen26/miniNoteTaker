import { LogicalSize } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "./tauri";
import {
  DASHBOARD_WINDOW_SIZE,
  EDITOR_WINDOW_SIZE,
  getSavedWindowSize,
  parseStoredWindowDimension,
  resolveWindowSize,
  saveWindowSizeForMode
} from "./windowSize";

vi.mock("./tauri", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn()
}));

const getSettingMock = vi.mocked(getSetting);
const setSettingMock = vi.mocked(setSetting);

describe("parseStoredWindowDimension", () => {
  it("returns null for missing or invalid values", () => {
    expect(parseStoredWindowDimension(null)).toBeNull();
    expect(parseStoredWindowDimension("")).toBeNull();
    expect(parseStoredWindowDimension("abc")).toBeNull();
    expect(parseStoredWindowDimension("0")).toBeNull();
    expect(parseStoredWindowDimension("-10")).toBeNull();
  });

  it("parses positive numbers", () => {
    expect(parseStoredWindowDimension("1320")).toBe(1320);
    expect(parseStoredWindowDimension("1840.5")).toBe(1840.5);
  });
});

describe("resolveWindowSize", () => {
  it("returns saved dimensions when both are present", () => {
    const size = resolveWindowSize("editor", 700, 420);
    expect(size.width).toBe(700);
    expect(size.height).toBe(420);
  });

  it("falls back to editor preset", () => {
    const size = resolveWindowSize("editor", null, null);
    expect(size.width).toBe(EDITOR_WINDOW_SIZE.width);
    expect(size.height).toBe(EDITOR_WINDOW_SIZE.height);
  });

  it("falls back to dashboard preset", () => {
    const size = resolveWindowSize("home", null, null);
    expect(size.width).toBe(DASHBOARD_WINDOW_SIZE.width);
    expect(size.height).toBe(DASHBOARD_WINDOW_SIZE.height);
  });
});

describe("getSavedWindowSize", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    setSettingMock.mockReset();
    setSettingMock.mockResolvedValue(undefined);
  });

  it("returns saved editor size", async () => {
    getSettingMock.mockImplementation(async (key) => {
      if (key === "window.editor.width") return "700";
      if (key === "window.editor.height") return "420";
      return null;
    });

    const size = await getSavedWindowSize("editor");
    expect(size).toEqual(new LogicalSize(700, 420));
  });

  it("returns saved home size", async () => {
    getSettingMock.mockImplementation(async (key) => {
      if (key === "window.home.width") return "980";
      if (key === "window.home.height") return "600";
      return null;
    });

    const size = await getSavedWindowSize("home");
    expect(size).toEqual(new LogicalSize(980, 600));
  });

  it("migrates legacy editor keys and copies them forward", async () => {
    getSettingMock.mockImplementation(async (key) => {
      if (key === "window.width") return "680";
      if (key === "window.height") return "390";
      return null;
    });

    const size = await getSavedWindowSize("editor");
    expect(size).toEqual(new LogicalSize(680, 390));
    expect(setSettingMock).toHaveBeenCalledWith("window.editor.width", "680");
    expect(setSettingMock).toHaveBeenCalledWith("window.editor.height", "390");
  });

  it("upgrades legacy editor defaults to the new preset", async () => {
    getSettingMock.mockImplementation(async (key) => {
      if (key === "window.editor.width") return "660";
      if (key === "window.editor.height") return "400";
      return null;
    });

    const size = await getSavedWindowSize("editor");
    expect(size).toEqual(EDITOR_WINDOW_SIZE);
    expect(setSettingMock).toHaveBeenCalledWith("window.editor.width", "1320");
    expect(setSettingMock).toHaveBeenCalledWith("window.editor.height", "800");
  });

  it("upgrades legacy home defaults to the new preset", async () => {
    getSettingMock.mockImplementation(async (key) => {
      if (key === "window.home.width") return "920";
      if (key === "window.home.height") return "560";
      return null;
    });

    const size = await getSavedWindowSize("home");
    expect(size).toEqual(DASHBOARD_WINDOW_SIZE);
    expect(setSettingMock).toHaveBeenCalledWith("window.home.width", "1840");
    expect(setSettingMock).toHaveBeenCalledWith("window.home.height", "1120");
  });
});

describe("saveWindowSizeForMode", () => {
  beforeEach(() => {
    setSettingMock.mockReset();
    setSettingMock.mockResolvedValue(undefined);
  });

  it("writes per-mode keys", async () => {
    await saveWindowSizeForMode("home", new LogicalSize(980, 600));

    expect(setSettingMock).toHaveBeenCalledWith("window.home.width", "980");
    expect(setSettingMock).toHaveBeenCalledWith("window.home.height", "600");
  });
});
