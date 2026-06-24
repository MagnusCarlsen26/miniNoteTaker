import { getCurrentWebview } from "@tauri-apps/api/webview";

export const ZOOM_SETTING_KEY = "ui.zoom";
export const ZOOM_DEFAULT = 1.0;
export const ZOOM_STEP = 0.1;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;

export function normalizeZoom(level: number): number {
  const rounded = Math.round(level * 10) / 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rounded));
}

export function parseStoredZoom(value: string | null): number {
  if (value === null) {
    return ZOOM_DEFAULT;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return ZOOM_DEFAULT;
  }

  return normalizeZoom(parsed);
}

export async function applyZoom(level: number): Promise<number> {
  const normalized = normalizeZoom(level);

  try {
    await getCurrentWebview().setZoom(normalized);
  } catch {
    // no-op outside Tauri (e.g. Vite-only dev)
  }

  return normalized;
}
