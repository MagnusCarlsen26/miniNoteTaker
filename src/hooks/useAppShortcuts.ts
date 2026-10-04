import { useHotkeys } from "react-hotkeys-hook";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";

type UseAppShortcutsOptions = {
  getCursorPosition: () => number;
  focusEditor: () => void;
  closeOverlay: () => Promise<void>;
  beforeCloseOverlay?: () => boolean;
  createNote: () => void;
};

export function useAppShortcuts({
  getCursorPosition,
  focusEditor,
  closeOverlay,
  beforeCloseOverlay,
  createNote
}: UseAppShortcutsOptions) {
  const togglePinned = useNoteStore((state) => state.togglePinned);
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);

  useHotkeys(
    "escape",
    (event) => {
      event.preventDefault();
      if (beforeCloseOverlay?.()) {
        return;
      }
      setLastCursorPosition(getCursorPosition());
      void closeOverlay();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [beforeCloseOverlay, closeOverlay, getCursorPosition, setLastCursorPosition]
  );

  useHotkeys(
    "ctrl+n, meta+n",
    (event) => {
      event.preventDefault();
      createNote();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [createNote]
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
