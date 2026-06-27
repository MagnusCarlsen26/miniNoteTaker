import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import type { ViewMode } from "../store/uiStore";
import { getSetting, persistWindowSizeForMode as persistWindowSizeForModeCommand, setSetting } from "./tauri";

export const EDITOR_WINDOW_SIZE = new LogicalSize(1320, 800);
export const DASHBOARD_WINDOW_SIZE = new LogicalSize(1840, 1120);

const LEGACY_EDITOR_SIZES: ReadonlyArray<readonly [number, number]> = [
  [600, 400],
  [660, 400]
];
const LEGACY_HOME_SIZES: ReadonlyArray<readonly [number, number]> = [
  [600, 400],
  [920, 560]
];

const LEGACY_WIDTH_KEY = "window.width";
const LEGACY_HEIGHT_KEY = "window.height";

const WINDOW_SIZE_KEYS = {
  editor: { width: "window.editor.width", height: "window.editor.height" },
  home: { width: "window.home.width", height: "window.home.height" }
} as const;

export function parseStoredWindowDimension(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function resolveWindowSize(
  mode: ViewMode,
  width: number | null,
  height: number | null
): LogicalSize {
  if (width !== null && height !== null) {
    return new LogicalSize(width, height);
  }

  return mode === "home" ? DASHBOARD_WINDOW_SIZE : EDITOR_WINDOW_SIZE;
}

function isLegacyDefaultSize(mode: ViewMode, width: number, height: number): boolean {
  const legacySizes = mode === "home" ? LEGACY_HOME_SIZES : LEGACY_EDITOR_SIZES;
  return legacySizes.some(([legacyWidth, legacyHeight]) => legacyWidth === width && legacyHeight === height);
}

function defaultWindowSizeForMode(mode: ViewMode): LogicalSize {
  return mode === "home" ? DASHBOARD_WINDOW_SIZE : EDITOR_WINDOW_SIZE;
}

export async function getSavedWindowSize(mode: ViewMode): Promise<LogicalSize | null> {
  const keys = WINDOW_SIZE_KEYS[mode];
  let width = parseStoredWindowDimension(await getSetting(keys.width));
  let height = parseStoredWindowDimension(await getSetting(keys.height));

  if (mode === "editor" && (width === null || height === null)) {
    const legacyWidth = parseStoredWindowDimension(await getSetting(LEGACY_WIDTH_KEY));
    const legacyHeight = parseStoredWindowDimension(await getSetting(LEGACY_HEIGHT_KEY));

    if (legacyWidth !== null && legacyHeight !== null) {
      width = legacyWidth;
      height = legacyHeight;
      void saveWindowSizeForMode("editor", new LogicalSize(width, height));
    }
  }

  if (width === null || height === null) {
    return null;
  }

  if (isLegacyDefaultSize(mode, width, height)) {
    const upgraded = defaultWindowSizeForMode(mode);
    void saveWindowSizeForMode(mode, upgraded);
    return upgraded;
  }

  return new LogicalSize(width, height);
}

export async function saveWindowSizeForMode(mode: ViewMode, size: LogicalSize): Promise<void> {
  const keys = WINDOW_SIZE_KEYS[mode];
  await setSetting(keys.width, String(size.width));
  await setSetting(keys.height, String(size.height));
}

export async function captureCurrentWindowSize(): Promise<LogicalSize> {
  const window = getCurrentWindow();
  const physical = await window.innerSize();
  const scale = await window.scaleFactor();
  return physical.toLogical(scale);
}

export async function persistCurrentWindowSizeForMode(mode: ViewMode): Promise<void> {
  try {
    await persistWindowSizeForModeCommand(mode);
  } catch {
    try {
      const size = await captureCurrentWindowSize();
      await saveWindowSizeForMode(mode, size);
    } catch {
      // Window size persistence should never block closing the overlay.
    }
  }
}

export async function applyWindowSize(mode: ViewMode): Promise<void> {
  try {
    const window = getCurrentWindow();
    const saved = await getSavedWindowSize(mode);
    const size = saved ?? (mode === "home" ? DASHBOARD_WINDOW_SIZE : EDITOR_WINDOW_SIZE);
    await window.setSize(size);
    await window.center();
  } catch {
    // Window resize/center should not interrupt overlay usage.
  }
}
