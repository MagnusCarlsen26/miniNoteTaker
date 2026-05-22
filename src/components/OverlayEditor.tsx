import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import dayjs from "dayjs";
import { Check, Folder, Home, NotebookText, PenSquare, Pin, Plus, Trash2 } from "lucide-react";
import { ChangeEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { ViewMode } from "../store/uiStore";
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

function compactFolderName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 6 ? `${trimmed.slice(0, 6)}...` : trimmed;
}

const EDITOR_WINDOW_SIZE = { width: 600, height: 400 };
const DASHBOARD_WINDOW_SIZE = { width: 920, height: 560 };

async function resizeOverlayWindow(viewMode: ViewMode): Promise<void> {
  const window = getCurrentWindow();
  const nextSize = viewMode === "home" ? DASHBOARD_WINDOW_SIZE : EDITOR_WINDOW_SIZE;

  try {
    await window.setSize(new LogicalSize(nextSize.width, nextSize.height));
    await window.center();
  } catch {
    // Window resize/center should not interrupt overlay usage.
  }
}

export function OverlayEditor() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeNote = useNoteStore((state) => state.activeNote);
  const draftContent = useNoteStore((state) => state.draftContent);
  const notes = useNoteStore((state) => state.notes);
  const folders = useNoteStore((state) => state.folders);
  const selectedFolderId = useNoteStore((state) => state.selectedFolderId);
  const folderError = useNoteStore((state) => state.folderError);
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const saveError = useNoteStore((state) => state.saveError);
  const pendingSave = useNoteStore((state) => state.pendingSave);
  const setDraftContent = useNoteStore((state) => state.setDraftContent);
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const loadFolders = useNoteStore((state) => state.loadFolders);
  const createFolder = useNoteStore((state) => state.createFolder);
  const deleteFolder = useNoteStore((state) => state.deleteFolder);
  const loadNotesByFolder = useNoteStore((state) => state.loadNotesByFolder);
  const toggleActiveNoteFolder = useNoteStore((state) => state.toggleActiveNoteFolder);
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
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dashboardFolderName, setDashboardFolderName] = useState("");
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

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
    const window = getCurrentWindow();
    try {
      if (viewMode === "home") {
        setViewMode("editor");
        await resizeOverlayWindow("editor");
      } else {
        const physicalSize = await window.innerSize();
        const scaleFactor = await window.scaleFactor();
        const logicalSize = physicalSize.toLogical(scaleFactor);
        await saveWindowSize(logicalSize.width, logicalSize.height);
      }
    } catch {
      // Window size persistence should never block closing the overlay.
    }
    resetDraft();
    setSelectedHistoryNoteId(null);
    setViewMode("editor");
    await hideOverlay();
    setOverlayVisible(false);
  }, [
    flushSave,
    resetDraft,
    setLastCursorPosition,
    setOverlayVisible,
    setSelectedHistoryNoteId,
    setViewMode,
    viewMode
  ]);

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
    void loadFolders();
  }, [loadFolders, loadNotes, resetDraft]);

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
      await resizeOverlayWindow(useUiStore.getState().viewMode);
      window.requestAnimationFrame(focusEditor);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [focusEditor, setOverlayVisible, setShortcutFailure]);

  useEffect(() => {
    void resizeOverlayWindow(viewMode);
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
    if (folderError) {
      setToastMessage(folderError);
    }
  }, [folderError, setToastMessage]);

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

  useEffect(() => {
    if (selectedSidebarItem === "folders" && selectedFolderId) {
      void loadNotesByFolder(selectedFolderId, 1000);
    }
  }, [loadNotesByFolder, selectedFolderId, selectedSidebarItem]);

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

  const createAndAssignFolder = useCallback(async () => {
    const folder = await createFolder(newFolderName);
    if (!folder) {
      return;
    }
    setNewFolderName("");
    await toggleActiveNoteFolder(folder.id);
    window.requestAnimationFrame(focusEditor);
  }, [createFolder, focusEditor, newFolderName, toggleActiveNoteFolder]);

  const createDashboardFolder = useCallback(async () => {
    const folder = await createFolder(dashboardFolderName);
    if (!folder) {
      return;
    }
    setDashboardFolderName("");
    await loadNotesByFolder(folder.id, 1000);
  }, [createFolder, dashboardFolderName, loadNotesByFolder]);

  const selectedHistoryNote = notes.find((note) => note.id === selectedHistoryNoteId) ?? null;
  const activeFolders = activeNote?.folders ?? [];
  const activeFolderIds = new Set(activeFolders.map((folder) => folder.id));
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;

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

          <div className="relative shrink-0">
            <div className="flex min-h-8 items-center gap-1 overflow-x-auto pb-1">
              {folders.map((folder) => {
                const selected = activeFolderIds.has(folder.id);
                return (
                  <button
                    key={folder.id}
                    type="button"
                    aria-pressed={selected}
                    title={folder.name}
                    onMouseDown={(event) => handleMouseDownAction(event, () => void toggleActiveNoteFolder(folder.id))}
                    onClick={(event) => event.preventDefault()}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[#d2ddce] bg-[#fbfdfb] px-2 text-xs font-medium text-[#536150] transition hover:border-[#9fb794] hover:bg-[#eef4ec] aria-pressed:border-[#2f6b43] aria-pressed:bg-[#dfeede] aria-pressed:text-[#255736] dark:border-[#2c3628] dark:bg-[#141b12] dark:text-[#b8c7b4] dark:hover:border-[#4e6846] dark:hover:bg-[#202a1d] dark:aria-pressed:border-[#76b774] dark:aria-pressed:bg-[#24351f] dark:aria-pressed:text-[#b9e8b1]"
                  >
                    <Folder size={12} aria-hidden="true" />
                    <span className="max-w-14">{compactFolderName(folder.name)}</span>
                    {selected ? <Check size={12} aria-hidden="true" /> : null}
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Create folder"
                onMouseDown={(event) => handleMouseDownAction(event, () => setFolderPanelOpen((open) => !open))}
                onClick={(event) => event.preventDefault()}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            {folderPanelOpen ? (
              <div className="absolute bottom-9 left-0 z-10 w-60 rounded-md border border-[#dce5d8] bg-[#fbfdfb] p-2 shadow-lg dark:border-[#2c3628] dark:bg-[#141b12]">
                <div className="flex items-center gap-1">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createAndAssignFolder();
                      }
                      if (event.key === "Escape") {
                        setFolderPanelOpen(false);
                        window.requestAnimationFrame(focusEditor);
                      }
                    }}
                    placeholder="New folder"
                    className="min-w-0 flex-1 rounded border border-[#dce5d8] bg-transparent px-2 py-1 text-sm outline-none dark:border-[#2c3628]"
                  />
                  <button
                    type="button"
                    aria-label="Create folder"
                    onMouseDown={(event) => handleMouseDownAction(event, () => void createAndAssignFolder())}
                    onClick={(event) => event.preventDefault()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#dce5d8] pt-2 dark:border-[#2c3628]">
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
              onMouseDown={(event) =>
                handleMouseDownAction(event, () => {
                  setSelectedSidebarItem("recent");
                  void loadNotes(1000);
                })
              }
              onClick={() => {
                setSelectedSidebarItem("recent");
                void loadNotes(1000);
              }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <NotebookText size={16} aria-hidden="true" />
              Recent
            </button>
            <button
              type="button"
              aria-pressed={selectedSidebarItem === "folders"}
              onMouseDown={(event) => handleMouseDownAction(event, () => setSelectedSidebarItem("folders"))}
              onClick={() => setSelectedSidebarItem("folders")}
              className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <Folder size={16} aria-hidden="true" />
              Folders
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
            {selectedSidebarItem === "folders" ? (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr]">
                <div className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                  <div className="mb-2 text-xs font-medium uppercase text-[#657064] dark:text-[#aeb9aa]">
                    Folders
                  </div>
                  <div className="grid gap-1">
                    {folders.map((folder) => {
                      const confirming = confirmDeleteFolderId === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className="grid h-9 grid-cols-[1fr_auto] items-center gap-1 rounded-md px-2 text-sm hover:bg-[#eef4ec] dark:hover:bg-[#202a1d]"
                        >
                          <button
                            type="button"
                            aria-pressed={selectedFolderId === folder.id}
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => void loadNotesByFolder(folder.id, 1000))
                            }
                            onClick={() => void loadNotesByFolder(folder.id, 1000)}
                            className="min-w-0 text-left"
                          >
                            <span className="block truncate font-medium">{folder.name}</span>
                            <span className="text-xs text-[#657064] dark:text-[#aeb9aa]">{folder.note_count}</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete folder"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => {
                                if (confirming) {
                                  void deleteFolder(folder.id).then(() => {
                                    setConfirmDeleteFolderId(null);
                                  });
                                } else {
                                  setConfirmDeleteFolderId(folder.id);
                                }
                              })
                            }
                            onClick={() => {
                              if (confirming) {
                                void deleteFolder(folder.id).then(() => setConfirmDeleteFolderId(null));
                              } else {
                                setConfirmDeleteFolderId(folder.id);
                              }
                            }}
                            className="inline-flex h-7 items-center justify-center rounded px-1.5 text-xs text-[#8a3d2b] hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                          >
                            {confirming ? (folder.note_count > 0 ? "Delete notes?" : "Delete?") : <Trash2 size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                    <input
                      value={dashboardFolderName}
                      onChange={(event) => setDashboardFolderName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createDashboardFolder();
                        }
                      }}
                      placeholder="New folder"
                      className="min-w-0 flex-1 rounded border border-[#dce5d8] bg-transparent px-2 py-1.5 text-sm outline-none dark:border-[#2c3628]"
                    />
                    <button
                      type="button"
                      aria-label="Create folder"
                      onMouseDown={(event) => handleMouseDownAction(event, () => void createDashboardFolder())}
                      onClick={() => void createDashboardFolder()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <article className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-4 dark:border-[#2c3628] dark:bg-[#141b12]">
                  {selectedFolder ? (
                    notes.length > 0 ? (
                      <div className="grid min-h-0 gap-4 lg:grid-cols-[260px_1fr]">
                        <NoteHistory
                          selectedNoteId={selectedHistoryNoteId}
                          onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                          notesOverride={notes}
                          title={selectedFolder.name}
                        />
                        {selectedHistoryNote ? (
                          <div className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                            {selectedHistoryNote.content}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[#657064] dark:text-[#aeb9aa]">
                        No notes
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#657064] dark:text-[#aeb9aa]">
                      No folders
                    </div>
                  )}
                </article>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {saveError ? <Toast message={saveError} /> : null}
    </main>
  );
}
