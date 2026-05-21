import { getCurrentWindow } from "@tauri-apps/api/window";
import type { RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { hideOverlay, saveWindowSize } from "../lib/tauri";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";
import type { Note } from "../types/note";

type UseAppShortcutsOptions = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  flushSave: () => Promise<Note | null>;
};

async function persistCurrentWindowSize() {
  const size = await getCurrentWindow().outerSize();
  await saveWindowSize(size.width, size.height);
}

export function useAppShortcuts({ textareaRef, flushSave }: UseAppShortcutsOptions) {
  const resetDraft = useNoteStore((state) => state.resetDraft);
  const togglePinned = useNoteStore((state) => state.togglePinned);
  const setOverlayVisible = useUiStore((state) => state.setOverlayVisible);
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);

  useHotkeys(
    "escape",
    (event) => {
      event.preventDefault();
      setLastCursorPosition(textareaRef.current?.selectionStart ?? 0);

      void (async () => {
        await flushSave();
        try {
          await persistCurrentWindowSize();
        } catch {
          // Window size persistence should never block closing the overlay.
        }
        await hideOverlay();
        setOverlayVisible(false);
      })();
    },
    { enableOnFormTags: true },
    [flushSave, setLastCursorPosition, setOverlayVisible, textareaRef]
  );

  useHotkeys(
    "ctrl+n, meta+n",
    (event) => {
      event.preventDefault();

      void (async () => {
        await flushSave();
        resetDraft();
        setLastCursorPosition(0);
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      })();
    },
    { enableOnFormTags: true },
    [flushSave, resetDraft, setLastCursorPosition, textareaRef]
  );

  useHotkeys(
    "ctrl+p, meta+p",
    (event) => {
      event.preventDefault();
      void togglePinned();
    },
    { enableOnFormTags: true },
    [togglePinned]
  );
}
