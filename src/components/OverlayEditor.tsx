import { listen } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef } from "react";
import {
  getRegisteredShortcut,
  getSetting,
  getShortcutFailure,
  quitApp,
  registerShortcut
} from "../lib/tauri";
import { useAppShortcuts } from "../hooks/useAppShortcuts";
import { useAutosaveNote } from "../hooks/useAutosaveNote";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";
import type { SaveStatus, ThemePreference } from "../types/note";
import { NoteHistory } from "./NoteHistory";
import { ShortcutHint } from "./ShortcutHint";
import { Toast } from "./Toast";

function statusLabel(status: SaveStatus) {
  switch (status) {
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
    case "error":
      return "Save delayed";
    case "idle":
      return "Ready";
  }
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    return;
  }
  if (theme === "light") {
    root.classList.remove("dark");
    return;
  }
  root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function OverlayEditor() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeNote = useNoteStore((state) => state.activeNote);
  const draftContent = useNoteStore((state) => state.draftContent);
  const notes = useNoteStore((state) => state.notes);
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const saveError = useNoteStore((state) => state.saveError);
  const pendingSave = useNoteStore((state) => state.pendingSave);
  const setDraftContent = useNoteStore((state) => state.setDraftContent);
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const resetDraft = useNoteStore((state) => state.resetDraft);
  const setOverlayVisible = useUiStore((state) => state.setOverlayVisible);
  const lastCursorPosition = useUiStore((state) => state.lastCursorPosition);
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);
  const setTheme = useUiStore((state) => state.setTheme);
  const setToastMessage = useUiStore((state) => state.setToastMessage);
  const shortcutFailure = useUiStore((state) => state.shortcutFailure);
  const setShortcutFailure = useUiStore((state) => state.setShortcutFailure);
  const setActiveNoteId = useUiStore((state) => state.setActiveNoteId);
  const { flushSave } = useAutosaveNote({ debounceMs: 300 });

  useAppShortcuts({ textareaRef, flushSave });

  const focusEditor = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    const cursorPosition = Math.min(useUiStore.getState().lastCursorPosition, textarea.value.length);
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }, []);

  const noteTimestamp = useMemo(() => {
    if (!activeNote) {
      return "New note";
    }

    return `Updated ${dayjs(activeNote.updated_at).format("h:mm A")}`;
  }, [activeNote]);

  useEffect(() => {
    void loadNotes(1000).then(() => {
      const state = useNoteStore.getState();
      if (!state.pendingSave && !state.activeNote && state.draftContent.length === 0) {
        resetDraft();
      }
    });
  }, [loadNotes, resetDraft]);

  useEffect(() => {
    let cleanupMediaListener: (() => void) | undefined;

    void getSetting("theme.preference").then((storedTheme) => {
      const theme = isThemePreference(storedTheme) ? storedTheme : "system";
      setTheme(theme);
      applyTheme(theme);

      if (theme === "system") {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => applyTheme("system");
        media.addEventListener("change", handleChange);
        cleanupMediaListener = () => media.removeEventListener("change", handleChange);
      }
    });

    return () => cleanupMediaListener?.();
  }, [setTheme]);

  useEffect(() => {
    const unlistenPromise = listen("overlay:shown", async () => {
      setOverlayVisible(true);
      try {
        setShortcutFailure(await getShortcutFailure());
      } catch {
        setShortcutFailure(null);
      }
      window.requestAnimationFrame(focusEditor);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [focusEditor, setOverlayVisible, setShortcutFailure]);

  useEffect(() => {
    void getRegisteredShortcut().catch(() => undefined);
  }, []);

  useEffect(() => {
    const unlistenPromise = listen("app:quit-requested", () => {
      void (async () => {
        await flushSave();
        await quitApp();
      })();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [flushSave]);

  useEffect(() => {
    setToastMessage(saveError);
  }, [saveError, setToastMessage]);

  useEffect(() => {
    setActiveNoteId(activeNote?.id ?? null);
  }, [activeNote?.id, setActiveNoteId]);

  const handleCursorChange = () => {
    setLastCursorPosition(textareaRef.current?.selectionStart ?? 0);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraftContent(event.target.value);
    setLastCursorPosition(event.target.selectionStart);
  };

  const showHistory = draftContent.trim().length === 0 && notes.length > 0;

  const handleShortcutFallback = (accelerator: string) => {
    void (async () => {
      try {
        await registerShortcut(accelerator);
        setShortcutFailure(null);
        setToastMessage(`Shortcut set to ${accelerator}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setShortcutFailure(message);
        setToastMessage("Shortcut registration failed");
      }
    })();
  };

  return (
    <main className="relative flex h-full min-h-0 flex-col bg-[#f7faf6] text-[#172116] dark:bg-[#11170f] dark:text-[#ecf3ea]">
      <section className="flex h-full min-h-0 flex-col gap-3 px-4 py-3">
        <header className="flex shrink-0 items-center justify-between gap-4 text-sm">
          <div className="min-w-0 truncate text-[#536150] dark:text-[#b8c7b4]">{noteTimestamp}</div>
          <div className="shrink-0 text-xs font-medium text-[#2f6b43] dark:text-[#9bd38f]">
            {statusLabel(saveStatus)}
          </div>
        </header>

        <textarea
          ref={textareaRef}
          value={draftContent}
          placeholder="Write anything..."
          spellCheck
          onChange={handleChange}
          onBlur={() => void flushSave()}
          onClick={handleCursorChange}
          onKeyUp={handleCursorChange}
          onSelect={handleCursorChange}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-6 text-[#172116] outline-none placeholder:text-[#8a9587] dark:text-[#ecf3ea] dark:placeholder:text-[#788475]"
        />

        {shortcutFailure ? (
          <div className="rounded-md border border-[#d6c7a7] bg-[#fff8e8] px-3 py-2 text-xs text-[#60451d] dark:border-[#5c4a2e] dark:bg-[#211b12] dark:text-[#f0d8a8]">
            <div className="mb-2 font-medium">Ctrl+Space is unavailable</div>
            <div className="flex flex-wrap gap-2">
              {["Ctrl+Shift+Space", "Ctrl+Alt+Space"].map((accelerator) => (
                <button
                  key={accelerator}
                  type="button"
                  onClick={() => handleShortcutFallback(accelerator)}
                  className="rounded border border-[#c4ad7b] px-2 py-1 font-medium text-[#4b3718] hover:bg-[#f8edcf] dark:border-[#755e35] dark:text-[#f4dfb7] dark:hover:bg-[#302716]"
                >
                  {accelerator}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showHistory ? <NoteHistory onSelectNote={() => window.requestAnimationFrame(focusEditor)} /> : null}

        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#dce5d8] pt-2 dark:border-[#2c3628]">
          <ShortcutHint keys="Esc" label="Close" />
          <ShortcutHint keys="Ctrl N" label="New" />
          <ShortcutHint keys="Ctrl P" label="Pin" />
          {pendingSave ? (
            <span className="ml-auto text-xs text-[#8a5a2a] dark:text-[#f0c48d]">Local draft</span>
          ) : null}
        </footer>
      </section>

      {saveError ? <Toast message={saveError} /> : null}
    </main>
  );
}
