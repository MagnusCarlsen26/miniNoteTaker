import { useCallback, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { getSetting, setSetting } from "../lib/tauri";
import {
  ZOOM_DEFAULT,
  ZOOM_SETTING_KEY,
  ZOOM_STEP,
  applyZoom,
  normalizeZoom,
  parseStoredZoom
} from "../lib/zoom";

export function useZoomShortcuts() {
  const zoomRef = useRef(ZOOM_DEFAULT);

  const adjustZoom = useCallback((delta: number) => {
    const next = normalizeZoom(zoomRef.current + delta);
    zoomRef.current = next;
    void applyZoom(next).then(() => {
      void setSetting(ZOOM_SETTING_KEY, String(next));
    });
  }, []);

  useEffect(() => {
    void getSetting(ZOOM_SETTING_KEY).then((stored) => {
      const level = parseStoredZoom(stored);
      zoomRef.current = level;
      void applyZoom(level);
    });
  }, []);

  useHotkeys(
    "ctrl+equal, ctrl+plus, meta+equal, meta+plus",
    (event) => {
      event.preventDefault();
      adjustZoom(ZOOM_STEP);
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [adjustZoom]
  );

  useHotkeys(
    "ctrl+minus, meta+minus",
    (event) => {
      event.preventDefault();
      adjustZoom(-ZOOM_STEP);
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [adjustZoom]
  );

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      adjustZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [adjustZoom]);
}
