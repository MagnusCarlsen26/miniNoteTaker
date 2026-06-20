import type { EditorView } from "@codemirror/view";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import dayjs from "dayjs";
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  Folder,
  Home,
  NotebookText,
  PenSquare,
  Pin,
  Plus,
  RotateCcw,
  Trash2
} from "lucide-react";
import { KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRegisteredShortcut,
  getSetting,
  getShortcutFailure,
  hideOverlay,
  quitApp,
  registerShortcut,
  saveWindowSize
} from "../lib/tauri";
import { formatSelectedDateHeader, noteCountsByDate } from "../lib/dates";
import { previewContent } from "../lib/notePreview";
import { shouldUseDarkTheme } from "../lib/theme";
import { useAppShortcuts } from "../hooks/useAppShortcuts";
import { useAutosaveNote } from "../hooks/useAutosaveNote";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";
import type { Note, SaveStatus, ThemePreference } from "../types/note";
import { focusNoteEditor, getNoteEditorCursorPosition, NoteEditor } from "./NoteEditor";
import { CalendarPicker } from "./CalendarPicker";
import { DateStrip } from "./DateStrip";
import { MonthCalendar } from "./MonthCalendar";
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

function compactFolderName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 6 ? `${trimmed.slice(0, 6)}...` : trimmed;
}

const EDITOR_WINDOW_SIZE = new LogicalSize(660, 400);
const DASHBOARD_WINDOW_SIZE = new LogicalSize(920, 560);

export function OverlayEditor() {
  const editorViewRef = useRef<EditorView | null>(null);
  const folderPanelRef = useRef<HTMLDivElement | null>(null);
  const editorDateRailRef = useRef<HTMLDivElement | null>(null);
  const activeNote = useNoteStore((state) => state.activeNote);
  const draftContent = useNoteStore((state) => state.draftContent);
  const notes = useNoteStore((state) => state.notes);
  const notesByDate = useNoteStore((state) => state.notesByDate);
  const trashedNotes = useNoteStore((state) => state.trashedNotes);
  const archivedNotes = useNoteStore((state) => state.archivedNotes);
  const folders = useNoteStore((state) => state.folders);
  const selectedFolderId = useNoteStore((state) => state.selectedFolderId);
  const folderError = useNoteStore((state) => state.folderError);
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const saveError = useNoteStore((state) => state.saveError);
  const pendingSave = useNoteStore((state) => state.pendingSave);
  const setDraftContent = useNoteStore((state) => state.setDraftContent);
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const loadNotesByDate = useNoteStore((state) => state.loadNotesByDate);
  const clearNotesByDate = useNoteStore((state) => state.clearNotesByDate);
  const loadTrashedNotes = useNoteStore((state) => state.loadTrashedNotes);
  const loadArchivedNotes = useNoteStore((state) => state.loadArchivedNotes);
  const archiveNote = useNoteStore((state) => state.archiveNote);
  const unarchiveNote = useNoteStore((state) => state.unarchiveNote);
  const setActiveNote = useNoteStore((state) => state.setActiveNote);
  const softDeleteNote = useNoteStore((state) => state.softDeleteNote);
  const restoreNote = useNoteStore((state) => state.restoreNote);
  const permanentlyDeleteNote = useNoteStore((state) => state.permanentlyDeleteNote);
  const loadFolders = useNoteStore((state) => state.loadFolders);
  const createFolder = useNoteStore((state) => state.createFolder);
  const deleteFolder = useNoteStore((state) => state.deleteFolder);
  const loadNotesByFolder = useNoteStore((state) => state.loadNotesByFolder);
  const toggleActiveNoteFolder = useNoteStore((state) => state.toggleActiveNoteFolder);
  const resetDraft = useNoteStore((state) => state.resetDraft);
  const persistLastOpenNoteId = useNoteStore((state) => state.persistLastOpenNoteId);
  const restoreLastOpenNote = useNoteStore((state) => state.restoreLastOpenNote);
  const setDraftCreatedDate = useNoteStore((state) => state.setDraftCreatedDate);
  const setOverlayVisible = useUiStore((state) => state.setOverlayVisible);
  const isOverlayVisible = useUiStore((state) => state.isOverlayVisible);
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
  const selectedDate = useUiStore((state) => state.selectedDate);
  const setSelectedDate = useUiStore((state) => state.setSelectedDate);
  const { flushSave } = useAutosaveNote();
  const registeredShortcutRef = useRef("Super+Space");
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dashboardFolderName, setDashboardFolderName] = useState("");
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [confirmSoftDeleteNoteId, setConfirmSoftDeleteNoteId] = useState<string | null>(null);
  const [confirmPermanentDeleteNoteId, setConfirmPermanentDeleteNoteId] = useState<string | null>(null);
  const [confirmArchiveNoteId, setConfirmArchiveNoteId] = useState<string | null>(null);
  const [pendingOpenNote, setPendingOpenNote] = useState<Note | null>(null);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [editorDayNotesOpen, setEditorDayNotesOpen] = useState(false);
  const noteDateCounts = useMemo(() => noteCountsByDate(notes), [notes]);

  const getCursorPosition = useCallback(
    () => getNoteEditorCursorPosition(editorViewRef.current),
    []
  );

  const focusEditor = useCallback(() => {
    focusNoteEditor(editorViewRef.current, useUiStore.getState().lastCursorPosition);
  }, []);

  const closeOverlay = useCallback(async () => {
    setLastCursorPosition(getCursorPosition());
    await flushSave();
    try {
      const { width, height } = await getCurrentWindow().outerSize();
      await saveWindowSize(width, height);
    } catch {
      // Window size persistence should never block closing the overlay.
    }
    await persistLastOpenNoteId();
    resetDraft();
    setSelectedHistoryNoteId(null);
    setEditorDayNotesOpen(false);
    setCalendarPickerOpen(false);
    setViewMode("editor");
    await hideOverlay();
    setOverlayVisible(false);
  }, [flushSave, getCursorPosition, persistLastOpenNoteId, resetDraft, setLastCursorPosition, setOverlayVisible, setSelectedHistoryNoteId, setViewMode]);

  useAppShortcuts({
    getCursorPosition,
    focusEditor,
    closeOverlay,
    beforeCloseOverlay: () => {
      if (editorDayNotesOpen) {
        setEditorDayNotesOpen(false);
        return true;
      }
      if (calendarPickerOpen) {
        setCalendarPickerOpen(false);
        return true;
      }
      return false;
    }
  });

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
    void loadTrashedNotes(1000);
    void loadArchivedNotes(1000);
  }, [loadArchivedNotes, loadFolders, loadNotes, loadTrashedNotes, resetDraft]);

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
      await restoreLastOpenNote();
      window.requestAnimationFrame(focusEditor);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [focusEditor, restoreLastOpenNote, setOverlayVisible, setShortcutFailure]);

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
    if (folderError) {
      setToastMessage(folderError);
    }
  }, [folderError, setToastMessage]);

  useEffect(() => {
    setActiveNoteId(activeNote?.id ?? null);
  }, [activeNote?.id, setActiveNoteId]);

  useEffect(() => {
    const selectableNotes =
      selectedSidebarItem === "trash"
        ? trashedNotes
        : selectedSidebarItem === "archive"
          ? archivedNotes
          : selectedSidebarItem === "calendar"
            ? notesByDate
            : notes;
    if (selectableNotes.length === 0) {
      setSelectedHistoryNoteId(null);
      return;
    }

    if (!selectedHistoryNoteId || !selectableNotes.some((note) => note.id === selectedHistoryNoteId)) {
      setSelectedHistoryNoteId(selectableNotes[0]?.id ?? null);
    }
  }, [archivedNotes, notes, notesByDate, selectedHistoryNoteId, selectedSidebarItem, setSelectedHistoryNoteId, trashedNotes]);

  useEffect(() => {
    if (!folderPanelOpen) {
      return;
    }

    const handleMouseDown = (event: globalThis.MouseEvent) => {
      if (folderPanelRef.current && !folderPanelRef.current.contains(event.target as Node)) {
        setFolderPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [folderPanelOpen]);

  useEffect(() => {
    if (selectedSidebarItem === "folders" && selectedFolderId) {
      void loadNotesByFolder(selectedFolderId, 1000);
    }
  }, [loadNotesByFolder, selectedFolderId, selectedSidebarItem]);

  useEffect(() => {
    if (selectedSidebarItem === "calendar") {
      void loadNotesByDate(selectedDate, 1000);
      return;
    }

    clearNotesByDate();
  }, [clearNotesByDate, loadNotesByDate, selectedDate, selectedSidebarItem]);

  const moveToBodyStart = useCallback(() => {
    if (draftContent.includes("\n") || draftContent.length === 0) {
      return false;
    }

    const nextContent = `${draftContent}\n\n`;
    setDraftContent(nextContent);
    setLastCursorPosition(nextContent.length);
    window.requestAnimationFrame(() => focusNoteEditor(editorViewRef.current, nextContent.length));
    return true;
  }, [draftContent, setDraftContent, setLastCursorPosition]);

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
    setFolderPanelOpen(false);
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
  const selectedCalendarNote = notesByDate.find((note) => note.id === selectedHistoryNoteId) ?? null;
  const selectedArchivedNote = archivedNotes.find((note) => note.id === selectedHistoryNoteId) ?? null;
  const selectedTrashedNote = trashedNotes.find((note) => note.id === selectedHistoryNoteId) ?? null;
  const activeFolders = activeNote?.folders ?? [];
  const activeFolderIds = new Set(activeFolders.map((folder) => folder.id));
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;

  const openNoteInEditor = useCallback(
    (note: Note) => {
      if (saveStatus === "dirty") {
        setPendingOpenNote(note);
        return;
      }

      setActiveNote(note);
      setViewMode("editor");
      window.requestAnimationFrame(focusEditor);
    },
    [focusEditor, saveStatus, setActiveNote, setViewMode]
  );

  const confirmDiscardAndOpen = useCallback(() => {
    if (!pendingOpenNote) {
      return;
    }

    resetDraft();
    setActiveNote(pendingOpenNote);
    setPendingOpenNote(null);
    setViewMode("editor");
    window.requestAnimationFrame(focusEditor);
  }, [focusEditor, pendingOpenNote, resetDraft, setActiveNote, setViewMode]);

  const handleEditorDateSelect = useCallback(
    (date: string) => {
      setSelectedDate(date);
      void loadNotesByDate(date, 1000);
      setEditorDayNotesOpen(true);
    },
    [loadNotesByDate, setSelectedDate]
  );

  const handleCalendarDateSelect = useCallback(
    (date: string) => {
      setSelectedDate(date);
      if (viewMode === "home" && selectedSidebarItem === "calendar") {
        void loadNotesByDate(date, 1000);
      } else if (viewMode === "editor") {
        void loadNotesByDate(date, 1000);
        setEditorDayNotesOpen(true);
      }
      setCalendarPickerOpen(false);
    },
    [loadNotesByDate, selectedSidebarItem, setSelectedDate, viewMode]
  );

  const handleCreateNoteOnSelectedDate = useCallback(() => {
    setDraftCreatedDate(selectedDate);
    resetDraft();
    setViewMode("editor");
    window.requestAnimationFrame(focusEditor);
  }, [focusEditor, resetDraft, selectedDate, setDraftCreatedDate, setViewMode]);

  const moveSelectedNoteToTrash = useCallback(async () => {
    if (!selectedHistoryNote) {
      return;
    }
    await softDeleteNote(selectedHistoryNote.id);
    setConfirmSoftDeleteNoteId(null);
    setSelectedHistoryNoteId(null);
  }, [selectedHistoryNote, setSelectedHistoryNoteId, softDeleteNote]);

  return (
    <main className="relative flex h-full min-h-0 flex-col bg-[#f7faf6] text-[#172116] dark:bg-[#11170f] dark:text-[#ecf3ea]">
      {viewMode === "editor" ? (
        <section className="grid h-full min-h-0 grid-cols-[1fr_44px] grid-rows-[1fr_auto]">
          <div className="col-start-1 row-start-1 flex min-h-0 flex-col gap-3 px-4 py-3">
          <header className="flex shrink-0 items-center justify-between gap-4 text-sm">
            <div className="min-w-0 truncate text-[#536150] dark:text-[#b8c7b4]">{noteTimestamp}</div>
            <div className="shrink-0 text-xs font-medium text-[#2f6b43] dark:text-[#9bd38f]">
              {statusLabel(saveStatus)}
            </div>
          </header>

          <div className="relative min-h-0 flex-1">
            {editorDayNotesOpen ? (
              <div className="flex h-full min-h-0 flex-col rounded-md border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                <div className="mb-2 shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-[#657064] dark:text-[#aeb9aa]">
                  {formatSelectedDateHeader(selectedDate)} · {notesByDate.length}{" "}
                  {notesByDate.length === 1 ? "note" : "notes"}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <NoteHistory
                    selectedNoteId={selectedHistoryNoteId}
                    onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                    onOpenNote={(note) => {
                      setEditorDayNotesOpen(false);
                      openNoteInEditor(note);
                    }}
                    notesOverride={notesByDate}
                    title=""
                    emptyTitle={`No notes created on ${formatSelectedDateHeader(selectedDate)}`}
                    timestampField="created_at"
                    ariaLabel={`Notes created on ${formatSelectedDateHeader(selectedDate)}`}
                  />
                </div>
              </div>
            ) : (
              <NoteEditor
                value={draftContent}
                onChange={setDraftContent}
                onCursorChange={setLastCursorPosition}
                editorViewRef={editorViewRef}
                showTitleUnderline={!draftContent.includes("\n")}
                onEnterAtEndOfTitle={moveToBodyStart}
              />
            )}
            {calendarPickerOpen ? (
              <CalendarPicker
                selectedDate={selectedDate}
                noteCounts={noteDateCounts}
                onSelectDate={handleCalendarDateSelect}
                onClose={() => setCalendarPickerOpen(false)}
                anchor="panel"
              />
            ) : null}
          </div>

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

          {!editorDayNotesOpen ? (
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
              <div ref={folderPanelRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-label="Create folder"
                  onMouseDown={(event) => handleMouseDownAction(event, () => setFolderPanelOpen((open) => !open))}
                  onClick={(event) => event.preventDefault()}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
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
            </div>
          </div>
          ) : null}

          </div>
          <div
            ref={editorDateRailRef}
            data-date-rail
            className="relative col-start-2 row-start-1 min-h-0 border-l border-[#dce5d8] bg-[#f7faf6] dark:border-[#2c3628] dark:bg-[#11170f]"
          >
            <DateStrip
              orientation="vertical"
              selectedDate={selectedDate}
              onSelectDate={handleEditorDateSelect}
              noteCounts={noteDateCounts}
              showCalendarTrigger={false}
              visible={isOverlayVisible}
            />
          </div>
          <footer className="col-span-2 row-start-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#dce5d8] px-4 pt-2 dark:border-[#2c3628]">
            <ShortcutHint keys="Esc" label={editorDayNotesOpen ? "Back" : "Close"} />
            <ShortcutHint keys="Ctrl N" label="New" />
            <ShortcutHint keys="Ctrl P" label="Pin" />
            {pendingSave ? (
              <span className="text-xs text-[#8a5a2a] dark:text-[#f0c48d]">Local draft</span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-calendar-trigger
                aria-label="Open calendar"
                onMouseDown={(event) =>
                  handleMouseDownAction(event, () => setCalendarPickerOpen((open) => !open))
                }
                onClick={(event) => event.preventDefault()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dce5d8] bg-transparent text-[#2f6b43] transition hover:bg-[#eef4ec] dark:border-[#2c3628] dark:bg-transparent dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
              >
                <Calendar size={16} aria-hidden="true" />
              </button>
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dce5d8] bg-transparent text-[#2f6b43] transition hover:bg-[#eef4ec] dark:border-[#2c3628] dark:bg-transparent dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
              >
                <Home size={16} aria-hidden="true" />
              </button>
            </div>
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
                    setViewMode("editor");
                    window.requestAnimationFrame(focusEditor);
                  })
                }
                onClick={() => {
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
              aria-pressed={selectedSidebarItem === "calendar"}
              onMouseDown={(event) =>
                handleMouseDownAction(event, () => {
                  setSelectedSidebarItem("calendar");
                  void loadNotesByDate(selectedDate, 1000);
                })
              }
              onClick={() => {
                setSelectedSidebarItem("calendar");
                void loadNotesByDate(selectedDate, 1000);
              }}
              className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <Calendar size={16} aria-hidden="true" />
              Calendar
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
            <button
              type="button"
              aria-pressed={selectedSidebarItem === "archive"}
              onMouseDown={(event) =>
                handleMouseDownAction(event, () => {
                  setSelectedSidebarItem("archive");
                  void loadArchivedNotes(1000);
                })
              }
              onClick={() => {
                setSelectedSidebarItem("archive");
                void loadArchivedNotes(1000);
              }}
              className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <Archive size={16} aria-hidden="true" />
              Archive
            </button>
            <button
              type="button"
              aria-pressed={selectedSidebarItem === "trash"}
              onMouseDown={(event) =>
                handleMouseDownAction(event, () => {
                  setSelectedSidebarItem("trash");
                  void loadTrashedNotes(1000);
                })
              }
              onClick={() => {
                setSelectedSidebarItem("trash");
                void loadTrashedNotes(1000);
              }}
              className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#253022] transition hover:bg-[#e5eee1] aria-pressed:bg-[#dce8d8] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#263220]"
            >
              <Trash2 size={16} aria-hidden="true" />
              Trash
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
                      onOpenNote={openNoteInEditor}
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
                        <div className="flex-1 text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                          {previewContent(selectedHistoryNote.content)}
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                          <button
                            type="button"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => openNoteInEditor(selectedHistoryNote))
                            }
                            onClick={() => openNoteInEditor(selectedHistoryNote)}
                            aria-label="Edit note"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                          >
                            <PenSquare size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label="Archive note"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => {
                                if (confirmArchiveNoteId === selectedHistoryNote.id) {
                                  void archiveNote(selectedHistoryNote.id).then(() => {
                                    setConfirmArchiveNoteId(null);
                                    setSelectedHistoryNoteId(null);
                                  });
                                } else {
                                  setConfirmArchiveNoteId(selectedHistoryNote.id);
                                }
                              })
                            }
                            onClick={() => {
                              if (confirmArchiveNoteId === selectedHistoryNote.id) {
                                void archiveNote(selectedHistoryNote.id).then(() => {
                                  setConfirmArchiveNoteId(null);
                                  setSelectedHistoryNoteId(null);
                                });
                              } else {
                                setConfirmArchiveNoteId(selectedHistoryNote.id);
                              }
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#536150] transition hover:bg-[#eef4ec] dark:text-[#b8c7b4] dark:hover:bg-[#202a1d]"
                          >
                            {confirmArchiveNoteId === selectedHistoryNote.id ? "Archive?" : <Archive size={15} />}
                          </button>
                          <button
                            type="button"
                            aria-label="Delete note"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => {
                                if (confirmSoftDeleteNoteId === selectedHistoryNote.id) {
                                  void moveSelectedNoteToTrash();
                                } else {
                                  setConfirmSoftDeleteNoteId(selectedHistoryNote.id);
                                }
                              })
                            }
                            onClick={() => {
                              if (confirmSoftDeleteNoteId === selectedHistoryNote.id) {
                                void moveSelectedNoteToTrash();
                              } else {
                                setConfirmSoftDeleteNoteId(selectedHistoryNote.id);
                              }
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#8a3d2b] transition hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                          >
                            {confirmSoftDeleteNoteId === selectedHistoryNote.id ? "Delete?" : <Trash2 size={15} />}
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
            {selectedSidebarItem === "calendar" ? (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_1fr]">
                <div className="self-start rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-2 dark:border-[#2c3628] dark:bg-[#141b12]">
                  <MonthCalendar
                    selectedDate={selectedDate}
                    noteCounts={noteDateCounts}
                    onSelectDate={(date) => {
                      setSelectedDate(date);
                      void loadNotesByDate(date, 1000);
                    }}
                  />
                </div>
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                    <NoteHistory
                      selectedNoteId={selectedHistoryNoteId}
                      onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                      onOpenNote={openNoteInEditor}
                      notesOverride={notesByDate}
                      title={formatSelectedDateHeader(selectedDate)}
                      emptyTitle={`No notes created on ${formatSelectedDateHeader(selectedDate)}`}
                      timestampField="created_at"
                      ariaLabel={`Notes created on ${formatSelectedDateHeader(selectedDate)}`}
                      onCreateNote={handleCreateNoteOnSelectedDate}
                      createNoteLabel={`New note on ${formatSelectedDateHeader(selectedDate)}`}
                    />
                  </div>
                {notesByDate.length > 0 ? (
                  <>
                    <article className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-4 dark:border-[#2c3628] dark:bg-[#141b12]">
                      {selectedCalendarNote ? (
                        <div className="flex h-full flex-col">
                          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#657064] dark:text-[#aeb9aa]">
                            {selectedCalendarNote.pinned ? <Pin size={13} aria-hidden="true" /> : null}
                            <span>
                              {dayjs(selectedCalendarNote.created_at).format("MMM D, YYYY h:mm A")}
                            </span>
                          </div>
                          <h2 className="mb-3 text-lg font-semibold text-[#253022] dark:text-[#e2eadf]">
                            {previewContent(selectedCalendarNote.content)}
                          </h2>
                          <div className="flex-1 text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                            {previewContent(selectedCalendarNote.content)}
                          </div>
                          <div className="mt-4 flex items-center gap-2 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                            <button
                              type="button"
                              onMouseDown={(event) =>
                                handleMouseDownAction(event, () => openNoteInEditor(selectedCalendarNote))
                              }
                              onClick={() => openNoteInEditor(selectedCalendarNote)}
                              aria-label="Edit note"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                            >
                              <PenSquare size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label="Archive note"
                              onMouseDown={(event) =>
                                handleMouseDownAction(event, () => {
                                  if (confirmArchiveNoteId === selectedCalendarNote.id) {
                                    void archiveNote(selectedCalendarNote.id).then(() => {
                                      setConfirmArchiveNoteId(null);
                                      setSelectedHistoryNoteId(null);
                                      void loadNotesByDate(selectedDate, 1000);
                                    });
                                  } else {
                                    setConfirmArchiveNoteId(selectedCalendarNote.id);
                                  }
                                })
                              }
                              onClick={() => {
                                if (confirmArchiveNoteId === selectedCalendarNote.id) {
                                  void archiveNote(selectedCalendarNote.id).then(() => {
                                    setConfirmArchiveNoteId(null);
                                    setSelectedHistoryNoteId(null);
                                    void loadNotesByDate(selectedDate, 1000);
                                  });
                                } else {
                                  setConfirmArchiveNoteId(selectedCalendarNote.id);
                                }
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#536150] transition hover:bg-[#eef4ec] dark:text-[#b8c7b4] dark:hover:bg-[#202a1d]"
                            >
                              {confirmArchiveNoteId === selectedCalendarNote.id ? (
                                "Archive?"
                              ) : (
                                <Archive size={15} />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label="Delete note"
                              onMouseDown={(event) =>
                                handleMouseDownAction(event, async () => {
                                  if (confirmSoftDeleteNoteId === selectedCalendarNote.id) {
                                    await softDeleteNote(selectedCalendarNote.id);
                                    setConfirmSoftDeleteNoteId(null);
                                    setSelectedHistoryNoteId(null);
                                    void loadNotesByDate(selectedDate, 1000);
                                  } else {
                                    setConfirmSoftDeleteNoteId(selectedCalendarNote.id);
                                  }
                                })
                              }
                              onClick={() => {
                                if (confirmSoftDeleteNoteId === selectedCalendarNote.id) {
                                  void softDeleteNote(selectedCalendarNote.id).then(() => {
                                    setConfirmSoftDeleteNoteId(null);
                                    setSelectedHistoryNoteId(null);
                                    void loadNotesByDate(selectedDate, 1000);
                                  });
                                } else {
                                  setConfirmSoftDeleteNoteId(selectedCalendarNote.id);
                                }
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#8a3d2b] transition hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                            >
                              {confirmSoftDeleteNoteId === selectedCalendarNote.id ? (
                                "Delete?"
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </>
                ) : (
                  <div className="flex min-h-0 items-center justify-center rounded-xl border border-dashed border-[#dce5d8] bg-[#fbfdfb] text-sm text-[#657064] dark:border-[#2c3628] dark:bg-[#141b12] dark:text-[#aeb9aa]">
                    Select a note or create one
                  </div>
                )}
                </div>
              </div>
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
                          onOpenNote={openNoteInEditor}
                          notesOverride={notes}
                          title={selectedFolder.name}
                        />
                        {selectedHistoryNote ? (
                          <div className="flex min-w-0 flex-col">
                            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#dce5d8] pb-2 dark:border-[#2c3628]">
                              <span className="truncate text-xs text-[#657064] dark:text-[#aeb9aa]">
                                {dayjs(selectedHistoryNote.updated_at).format("MMM D, h:mm A")}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  aria-label="Edit note"
                                  onMouseDown={(event) =>
                                    handleMouseDownAction(event, () => openNoteInEditor(selectedHistoryNote))
                                  }
                                  onClick={() => openNoteInEditor(selectedHistoryNote)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#2f6b43] text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                                >
                                  <PenSquare size={14} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Archive note"
                                  onMouseDown={(event) =>
                                    handleMouseDownAction(event, () => {
                                      if (confirmArchiveNoteId === selectedHistoryNote.id) {
                                        void archiveNote(selectedHistoryNote.id).then(() => {
                                          setConfirmArchiveNoteId(null);
                                          setSelectedHistoryNoteId(null);
                                        });
                                      } else {
                                        setConfirmArchiveNoteId(selectedHistoryNote.id);
                                      }
                                    })
                                  }
                                  onClick={() => {
                                    if (confirmArchiveNoteId === selectedHistoryNote.id) {
                                      void archiveNote(selectedHistoryNote.id).then(() => {
                                        setConfirmArchiveNoteId(null);
                                        setSelectedHistoryNoteId(null);
                                      });
                                    } else {
                                      setConfirmArchiveNoteId(selectedHistoryNote.id);
                                    }
                                  }}
                                  className="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-[#536150] hover:bg-[#eef4ec] dark:text-[#b8c7b4] dark:hover:bg-[#202a1d]"
                                >
                                  {confirmArchiveNoteId === selectedHistoryNote.id ? "Archive?" : <Archive size={14} />}
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete note"
                                  onMouseDown={(event) =>
                                    handleMouseDownAction(event, () => {
                                      if (confirmSoftDeleteNoteId === selectedHistoryNote.id) {
                                        void moveSelectedNoteToTrash();
                                      } else {
                                        setConfirmSoftDeleteNoteId(selectedHistoryNote.id);
                                      }
                                    })
                                  }
                                  onClick={() => {
                                    if (confirmSoftDeleteNoteId === selectedHistoryNote.id) {
                                      void moveSelectedNoteToTrash();
                                    } else {
                                      setConfirmSoftDeleteNoteId(selectedHistoryNote.id);
                                    }
                                  }}
                                  className="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-[#8a3d2b] hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                                >
                                  {confirmSoftDeleteNoteId === selectedHistoryNote.id ? "Delete?" : <Trash2 size={14} />}
                                </button>
                              </span>
                            </div>
                            <div className="min-w-0 text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                              {previewContent(selectedHistoryNote.content)}
                            </div>
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
            {selectedSidebarItem === "archive" ? (
              archivedNotes.length > 0 ? (
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                    <NoteHistory
                      selectedNoteId={selectedHistoryNoteId}
                      onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                      onOpenNote={openNoteInEditor}
                      notesOverride={archivedNotes}
                      title="Archive"
                      emptyTitle="Archive is empty"
                      ariaLabel="Archived notes"
                    />
                  </div>
                  <article className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-4 dark:border-[#2c3628] dark:bg-[#141b12]">
                    {selectedArchivedNote ? (
                      <div className="flex h-full flex-col">
                        <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[#657064] dark:text-[#aeb9aa]">
                          Archived{" "}
                          {dayjs(selectedArchivedNote.archived_at ?? selectedArchivedNote.updated_at).format(
                            "MMM D, YYYY h:mm A"
                          )}
                        </div>
                        <h2 className="mb-3 text-lg font-semibold text-[#253022] dark:text-[#e2eadf]">
                          {previewContent(selectedArchivedNote.content)}
                        </h2>
                        <div className="flex-1 text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                          {previewContent(selectedArchivedNote.content)}
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                          <button
                            type="button"
                            aria-label="Unarchive note"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () =>
                                void unarchiveNote(selectedArchivedNote.id).then(() => setSelectedHistoryNoteId(null))
                              )
                            }
                            onClick={() =>
                              void unarchiveNote(selectedArchivedNote.id).then(() => setSelectedHistoryNoteId(null))
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                          >
                            <ArchiveRestore size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label="Edit note"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => openNoteInEditor(selectedArchivedNote))
                            }
                            onClick={() => openNoteInEditor(selectedArchivedNote)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dce5d8] text-[#2f6b43] transition hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
                          >
                            <PenSquare size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete note"
                            onMouseDown={(event) =>
                              handleMouseDownAction(event, () => {
                                if (confirmSoftDeleteNoteId === selectedArchivedNote.id) {
                                  void softDeleteNote(selectedArchivedNote.id).then(() =>
                                    setSelectedHistoryNoteId(null)
                                  );
                                  setConfirmSoftDeleteNoteId(null);
                                } else {
                                  setConfirmSoftDeleteNoteId(selectedArchivedNote.id);
                                }
                              })
                            }
                            onClick={() => {
                              if (confirmSoftDeleteNoteId === selectedArchivedNote.id) {
                                void softDeleteNote(selectedArchivedNote.id).then(() => setSelectedHistoryNoteId(null));
                                setConfirmSoftDeleteNoteId(null);
                              } else {
                                setConfirmSoftDeleteNoteId(selectedArchivedNote.id);
                              }
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#8a3d2b] transition hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                          >
                            {confirmSoftDeleteNoteId === selectedArchivedNote.id ? "Delete?" : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#dce5d8] bg-[#fbfdfb] text-sm text-[#657064] dark:border-[#2c3628] dark:bg-[#141b12] dark:text-[#aeb9aa]">
                  Archive is empty
                </div>
              )
            ) : null}
            {selectedSidebarItem === "trash" ? (
              trashedNotes.length > 0 ? (
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-3 dark:border-[#2c3628] dark:bg-[#141b12]">
                    <NoteHistory
                      selectedNoteId={selectedHistoryNoteId}
                      onSelectNote={(note) => setSelectedHistoryNoteId(note.id)}
                      onOpenNote={openNoteInEditor}
                      notesOverride={trashedNotes}
                      title="Trash"
                      emptyTitle="Trash is empty"
                      timestampField="deleted_at"
                      ariaLabel="Trashed notes"
                    />
                  </div>
                  <article className="min-h-0 overflow-y-auto rounded-xl border border-[#dce5d8] bg-[#fbfdfb] p-4 dark:border-[#2c3628] dark:bg-[#141b12]">
                    {selectedTrashedNote ? (
                      <div className="flex h-full flex-col">
                        <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[#657064] dark:text-[#aeb9aa]">
                          Deleted{" "}
                          {dayjs(selectedTrashedNote.deleted_at ?? selectedTrashedNote.updated_at).format(
                            "MMM D, YYYY h:mm A"
                          )}
                        </div>
                        <h2 className="mb-3 text-lg font-semibold text-[#253022] dark:text-[#e2eadf]">
                          {previewContent(selectedTrashedNote.content)}
                        </h2>
                        <div className="flex-1 text-sm leading-6 text-[#334030] dark:text-[#d4ddd1]">
                          {previewContent(selectedTrashedNote.content)}
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]">
                          <button
                            type="button"
                            aria-label="Restore note"
                            onClick={() => void restoreNote(selectedTrashedNote.id).then(() => setSelectedHistoryNoteId(null))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b43] text-white transition hover:bg-[#255736] dark:bg-[#3d8756] dark:hover:bg-[#347349]"
                          >
                            <RotateCcw size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label="Permanently delete note"
                            onClick={() => {
                              if (confirmPermanentDeleteNoteId === selectedTrashedNote.id) {
                                void permanentlyDeleteNote(selectedTrashedNote.id).then(() => {
                                  setConfirmPermanentDeleteNoteId(null);
                                  setSelectedHistoryNoteId(null);
                                });
                              } else {
                                setConfirmPermanentDeleteNoteId(selectedTrashedNote.id);
                              }
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-[#8a3d2b] transition hover:bg-[#fae9e4] dark:text-[#f0a394] dark:hover:bg-[#2a1b18]"
                          >
                            {confirmPermanentDeleteNoteId === selectedTrashedNote.id ? "Delete?" : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#dce5d8] bg-[#fbfdfb] text-sm text-[#657064] dark:border-[#2c3628] dark:bg-[#141b12] dark:text-[#aeb9aa]">
                  Trash is empty
                </div>
              )
            ) : null}
          </div>
        </section>
      )}

      {pendingOpenNote ? (
        <div className="absolute inset-x-4 bottom-4 z-20 rounded-md border border-[#dce5d8] bg-[#fbfdfb] px-3 py-2 text-sm shadow-lg dark:border-[#2c3628] dark:bg-[#141b12]">
          <div className="mb-2 text-[#253022] dark:text-[#e2eadf]">Discard unsaved note?</div>
          <div className="flex gap-2">
            <button
              type="button"
              onMouseDown={(event) => handleMouseDownAction(event, confirmDiscardAndOpen)}
              onClick={confirmDiscardAndOpen}
              className="rounded-md bg-[#2f6b43] px-2.5 py-1 text-xs font-medium text-white"
            >
              Discard
            </button>
            <button
              type="button"
              onMouseDown={(event) => handleMouseDownAction(event, () => setPendingOpenNote(null))}
              onClick={() => setPendingOpenNote(null)}
              className="rounded-md border border-[#dce5d8] px-2.5 py-1 text-xs font-medium dark:border-[#2c3628]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {saveError ? <Toast message={saveError} /> : null}
    </main>
  );
}
