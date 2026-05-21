import type { RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";
import type { Note } from "../types/note";

type UseAppShortcutsOptions = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  closeOverlay: () => Promise<void>;
  flushSave: () => Promise<Note | null>;
};

export function useAppShortcuts({ textareaRef, closeOverlay, flushSave }: UseAppShortcutsOptions) {
  const resetDraft = useNoteStore((state) => state.resetDraft);
  const togglePinned = useNoteStore((state) => state.togglePinned);
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);

  useHotkeys(
    "escape",
    (event) => {
      event.preventDefault();
      setLastCursorPosition(textareaRef.current?.selectionStart ?? 0);
      void closeOverlay();
    },
    { enableOnFormTags: true },
    [closeOverlay, setLastCursorPosition, textareaRef]
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
