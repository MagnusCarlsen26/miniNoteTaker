import { useHotkeys } from "react-hotkeys-hook";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";

type UseAppShortcutsOptions = {
  getCursorPosition: () => number;
  focusEditor: () => void;
  closeOverlay: () => Promise<void>;
};

export function useAppShortcuts({ getCursorPosition, focusEditor, closeOverlay }: UseAppShortcutsOptions) {
  const resetDraft = useNoteStore((state) => state.resetDraft);
  const togglePinned = useNoteStore((state) => state.togglePinned);
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);

  useHotkeys(
    "escape",
    (event) => {
      event.preventDefault();
      setLastCursorPosition(getCursorPosition());
      void closeOverlay();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [closeOverlay, getCursorPosition, setLastCursorPosition]
  );

  useHotkeys(
    "ctrl+n, meta+n",
    (event) => {
      event.preventDefault();
      resetDraft();
      setLastCursorPosition(0);
      window.requestAnimationFrame(focusEditor);
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [focusEditor, resetDraft, setLastCursorPosition]
  );

  useHotkeys(
    "ctrl+p, meta+p",
    (event) => {
      event.preventDefault();
      void togglePinned();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [togglePinned]
  );
}
