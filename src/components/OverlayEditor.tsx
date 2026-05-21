import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import dayjs from "dayjs";
import { Home, NotebookText, PenSquare, Pin } from "lucide-react";
import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef } from "react";
import {
  getRegisteredShortcut,
  getSetting,
  getShortcutFailure,
  hideOverlay,
  quitApp,
  registerShortcut,
  saveWindowSize
} from "../lib/tauri";
import { shouldUseDarkTheme } from "../lib/theme";
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
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", shouldUseDarkTheme(theme, systemPrefersDark));
}

function previewContent(content: string) {
  return content.replace(/\s+/g, " ").trim() || "Empty note";
}

const EDITOR_WINDOW_SIZE = new LogicalSize(600, 400);
const DASHBOARD_WINDOW_SIZE = new LogicalSize(920, 560);

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
  const setLastCursorPosition = useUiStore((state) => state.setLastCursorPosition);
  const setTheme = useUiStore((state) => state.setTheme);
  const setToastMessage = useUiStore((state) => state.setToastMessage);
  const shortcutFailure = useUiStore((state) => state.shortcutFailure);
  const setShortcutFailure = useUiStore((state) => state.setShortcutFailure);
  const setActiveNoteId = useUiStore((state) => state.setActiveNoteId);
  const viewMode = useUiStore((state) => state.viewMode);
  const setViewMode = useUiStore((state) => state.setViewMode);
  const selectedSidebarItem = useUiStore((state) => state.selectedSidebarItem);
  const setSelectedSidebarItem = useUiStore((state) => state.setSelectedSidebarItem);
  const selectedHistoryNoteId = useUiStore((state) => state.selectedHistoryNoteId);
  const setSelectedHistoryNoteId = useUiStore((state) => state.setSelectedHistoryNoteId);
  const { flushSave } = useAutosaveNote({ debounceMs: 300 });
  const registeredShortcutRef = useRef("Super+Space");

  const focusEditor = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    const cursorPosition = Math.min(useUiStore.getState().lastCursorPosition, textarea.value.length);
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }, []);

  const closeOverlay = useCallback(async () => {
    setLastCursorPosition(textareaRef.current?.selectionStart ?? 0);
    await flushSave();
    try {
      const { width, height } = await getCurrentWindow().outerSize();
      await saveWindowSize(width, height);
    } catch {
      // Window size persistence should never block closing the overlay.
    }
    resetDraft();
    setSelectedHistoryNoteId(null);
    setViewMode("editor");
    await hideOverlay();
    setOverlayVisible(false);
  }, [flushSave, resetDraft, setLastCursorPosition, setOverlayVisible, setSelectedHistoryNoteId, setViewMode]);

  useAppShortcuts({ textareaRef, closeOverlay, flushSave });

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
        registeredShortcutRef.current = await getRegisteredShortcut();
      } catch {
        setShortcutFailure(null);
        registeredShortcutRef.current = "Super+Space";
      }
      window.requestAnimationFrame(focusEditor);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [focusEditor, setOverlayVisible, setShortcutFailure]);

  useEffect(() => {
    const window = getCurrentWindow();
    const nextSize = viewMode === "home" ? DASHBOARD_WINDOW_SIZE : EDITOR_WINDOW_SIZE;

    void (async () => {
      try {
        await window.setSize(nextSize);
        await window.center();
      } catch {
        // Window resize/center should not interrupt overlay usage.
      }
    })();
  }, [viewMode]);

  useEffect(() => {
    void getRegisteredShortcut()
      .then((shortcut) => {
        registeredShortcutRef.current = shortcut;
      })
      .catch(() => undefined);
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
    const unlistenPromise = listen("overlay:close-requested", () => {
      void closeOverlay();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [closeOverlay]);

  useEffect(() => {
    setToastMessage(saveError);
  }, [saveError, setToastMessage]);

  useEffect(() => {
    setActiveNoteId(activeNote?.id ?? null);
  }, [activeNote?.id, setActiveNoteId]);

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedHistoryNoteId(null);
      return;
    }

    if (!selectedHistoryNoteId || !notes.some((note) => note.id === selectedHistoryNoteId)) {
      setSelectedHistoryNoteId(notes[0]?.id ?? null);
    }
  }, [notes, selectedHistoryNoteId, setSelectedHistoryNoteId]);

  const handleCursorChange = () => {
    setLastCursorPosition(textareaRef.current?.selectionStart ?? 0);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraftContent(event.target.value);
    setLastCursorPosition(event.target.selectionStart);
  };

  const handleShortcutFallback = (accelerator: string) => {
    void (async () => {
      try {
        await registerShortcut(accelerator);
        setShortcutFailure(null);
        registeredShortcutRef.current = accelerator;
        setToastMessage(`Shortcut set to ${accelerator}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setShortcutFailure(message);
        setToastMessage("Shortcut registration failed");
      }
    })();
  };

  const handleMouseDownAction = (event: MouseEvent<HTMLElement>, action: () => void) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    action();
  };

  const selectedHistoryNote = notes.find((note) => note.id === selectedHistoryNoteId) ?? null;

  const openNoteInEditor = useCallback(() => {
    if (!selectedHistoryNote) {
      return;
    }

    useNoteStore.getState().setActiveNote(selectedHistoryNote);
    setViewMode("editor");
    window.requestAnimationFrame(focusEditor);
  }, [focusEditor, selectedHistoryNote, setViewMode]);

  return (
    <main className="relative flex h-full min-h-0 flex-col bg-[#f7faf6] text-[#172116] dark:bg-[#11170f] dark:text-[#ecf3ea]">
      {viewMode === "editor" ? (
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
              <div className="mb-2 font-medium">{registeredShortcutRef.current} is unavailable</div>
              <div className="flex flex-wrap gap-2">
                {["Ctrl+Shift+Space", "Ctrl+Alt+Space"].map((accelerator) => (
                  <button
                    key={accelerator}
                    type="button"
                    onMouseDown={(event) => handleMouseDownAction(event, () => handleShortcutFallback(accelerator))}
                    onClick={() => handleShortcutFallback(accelerator)}
                    className="rounded border border-[#c4ad7b] px-2 py-1 font-medium text-[#4b3718] hover:bg-[#f8edcf] dark:border-[#755e35] dark:text-[#f4dfb7] dark:hover:bg-[#302716]"
                  >
                    {accelerator}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#dce5d8] pt-2 dark:border-[#2c3628]">
            <ShortcutHint keys="Esc" label="Close" />
            <ShortcutHint keys="Ctrl N" label="New" />
            <ShortcutHint keys="Ctrl P" label="Pin" />
            {pendingSave ? (
              <span className="text-xs text-[#8a5a2a] dark:text-[#f0c48d]">Local draft</span>
            ) : null}
            <button
              type="button"
              aria-label="Open dashboard"
              onMouseDown={(event) =>
                handleMouseDownAction(event, () => {
                  setSelectedSidebarItem("recent");
                  setViewMode("home");
                })
              }
              onClick={() => {
                setSelectedSidebarItem("recent");
                setViewMode("home");
              }}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dce5d8] bg-transparent text-[#2f6b43] transition hover:bg-[#eef4ec] dark:border-[#2c3628] dark:bg-transparent dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
            >
              <Home size={16} aria-hidden="true" />
            </button>
          </footer>
        </section>
      ) : (
        <section className="grid h-full min-h-0 grid-cols-[180px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-[#dce5d8] bg-[#eef4ec] px-3 py-3 dark:border-[#2c3628] dark:bg-[#182016]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#657064] dark:text-[#aeb9aa]">
                Dashboard
              </div>
              <button
                type="button"
                onMouseDown={(event) =>
                  handleMouseDownAction(event, () => {
                    resetDraft();
                    setViewMode("editor");
                    window.requestAnimationFrame(focusEditor);
                  })
                }
                onClick={() => {
                  resetDraft();
                  setViewMode("editor");
                  window.requestAnimationFrame(focusEditor);
                }}
                aria-label="New note"
                className="inline-flex items-center justify-center rounded-md border border-[#dce5d8] px-2.5 py-1.5 text-sm font-medium text-[#253022] transition hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#e2eadf] dark:hover:bg-[#202a1d]"
              >
                <PenSquare size={15} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              aria-pressed={selectedSidebarItem === "recent"}
              onMouseDown={(event) => handleMouseDownAction(event, () => setSelectedSidebarItem("recent"))}
              onClick={() => setSelectedSidebarItem("recent")}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <NotebookText size={16} aria-hidden="true" />
              Recent
            </button>
          </aside>

          <div className="flex min-h-0 flex-col px-4 py-3">
            {selectedSidebarItem === "recent" ? (
              notes.length > 0 ? (
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                    <NoteHistory
                      selectedNoteId={selectedHistoryNoteId}
                      onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                    />
                  </div>
                  <article className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-4 dark:border-[#2c3628] dark:bg-[#141b12]">
                    {selectedHistoryNote ? (
                      <div className="flex h-full flex-col">
                        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#657064] dark:text-[#aeb9aa]">
                          {selectedHistoryNote.pinned ? <Pin size={13} aria-hidden="true" /> : null}
                          <span>{dayjs(selectedHistoryNote.updated_at).format("MMM D, YYYY h:mm A")}</span>
                        </div>
                        <h2 className="mb-3 text-lg font-semibold text-[#253022] dark:text-[#e2eadf]">
                          {previewContent(selectedHistoryNote.content)}
                        </h2>
                        <div className="flex-1 whitespace-pre-wrap text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                          {selectedHistoryNote.content}
                        </div>
                        <div className="mt-4 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                          <button
                            type="button"
                            onMouseDown={(event) => handleMouseDownAction(event, openNoteInEditor)}
                            onClick={openNoteInEditor}
                            className="inline-flex items-center gap-2 rounded-md bg-[#2f6b43] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                          >
                            <PenSquare size={15} aria-hidden="true" />
                            
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#dce5d8] bg-[#fbfdfb] text-sm text-[#657064] dark:border-[#2c3628] dark:bg-[#141b12] dark:text-[#aeb9aa]">
                  No recent notes yet
                </div>
              )
            ) : null}
          </div>
        </section>
      )}

      {saveError ? <Toast message={saveError} /> : null}
    </main>
  );
}
