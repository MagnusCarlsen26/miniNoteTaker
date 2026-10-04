import type { EditorView } from "@codemirror/view";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import dayjs from "dayjs";
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, NotebookText, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hideOverlay, quitApp } from "../lib/tauri";
import { noteCountsByDate, formatSelectedDateHeader } from "../lib/dates";
import { applyWindowSize, persistCurrentWindowSizeForMode } from "../lib/windowSize";
import { useThemePreference } from "../hooks/useThemePreference";
import { ThemeControl } from "./ThemeControl";
import { Toast } from "./Toast";
import { useAutosaveNote } from "../hooks/useAutosaveNote";
import { useAppShortcuts } from "../hooks/useAppShortcuts";
import { useZoomShortcuts } from "../hooks/useZoomShortcuts";
import { useNoteStore } from "../store/noteStore";
import { useUiStore, type SidebarItem } from "../store/uiStore";
import type { Note } from "../types/note";
import { NoteEditor, focusNoteEditor, getNoteEditorCursorPosition } from "./NoteEditor";
import { NoteHistory } from "./NoteHistory";
import { NoteReading } from "./NoteReading";
import { ActionButton } from "./ActionButton";
import { Confirmation } from "./Confirmation";
import { DateStrip } from "./DateStrip";
import { MonthCalendar } from "./MonthCalendar";

const sections: SidebarItem[] = ["recent", "folders", "archive", "trash"];
export function OverlayEditor() {
  const state = useNoteStore();
  const ui = useUiStore();
  const theme = useThemePreference();
  const { flushSave } = useAutosaveNote();
  const editor = useRef<EditorView | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [confirmation, setConfirmation] = useState<{ message: string; label: string; action: () => Promise<void> } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const retryAction = useRef<(() => Promise<void> | void) | null>(null);
  const transitioning = useRef(false);
  const folderTrigger = useRef<HTMLButtonElement>(null);
  const folderPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!folderOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (folderPanel.current?.contains(target) || folderTrigger.current?.contains(target)) return;
      setFolderOpen(false);
      folderTrigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [folderOpen]);
  const focusEditor = useCallback(() => { window.requestAnimationFrame(() => focusNoteEditor(editor.current, useUiStore.getState().lastCursorPosition)); }, []);
  const transition = useCallback(async (action: () => Promise<void> | void) => {
    if (transitioning.current) return;
    transitioning.current = true;
    try {
      const result = await flushSave();
      if (!result.ok) { retryAction.current = action; setBlocked(true); return; }
      setBlocked(false); retryAction.current = null; await action();
    } finally { transitioning.current = false; }
  }, [flushSave]);
  const closeOverlay = useCallback(async () => {
    await transition(async () => {
      useUiStore.getState().setLastCursorPosition(getNoteEditorCursorPosition(editor.current));
      await persistCurrentWindowSizeForMode(useUiStore.getState().viewMode);
      await useNoteStore.getState().persistLastOpenNoteId();
      await hideOverlay(); useUiStore.getState().setOverlayVisible(false);
    });
  }, [transition]);
  useAppShortcuts({ getCursorPosition: () => getNoteEditorCursorPosition(editor.current), focusEditor, closeOverlay, createNote: () => newNote(), beforeCloseOverlay: () => {
    if (folderOpen) { setFolderOpen(false); folderTrigger.current?.focus(); return true; }
    if (dayOpen) { setDayOpen(false); focusEditor(); return true; }
    return false;
  } });
  useZoomShortcuts();
  useEffect(() => {
    void Promise.all([state.loadNotes(1000), state.loadFolders(), state.loadArchivedNotes(1000), state.loadTrashedNotes(1000)]).catch(error => useUiStore.getState().setToastMessage(String(error)));
  }, []);
  useEffect(() => {
    const listeners = [listen("overlay:shown", async () => { ui.setOverlayVisible(true); await state.restoreLastOpenNote(); focusEditor(); }), listen("overlay:close-requested", () => { void closeOverlay(); }), listen("app:quit-requested", () => { void transition(quitApp); })];
    return () => { listeners.forEach(listener => { void listener.then(cleanup => cleanup()); }); };
  }, [closeOverlay, focusEditor, transition]);
  useEffect(() => { if (ui.isOverlayVisible) void applyWindowSize(ui.viewMode); }, [ui.isOverlayVisible, ui.viewMode]);
  useEffect(() => {
    if (!ui.isOverlayVisible) return;
    let timer: ReturnType<typeof setTimeout>;
    const listener = getCurrentWindow().onResized(() => { clearTimeout(timer); timer = setTimeout(() => { void persistCurrentWindowSizeForMode(useUiStore.getState().viewMode); }, 300); });
    return () => { clearTimeout(timer); void listener.then(cleanup => cleanup()); };
  }, [ui.isOverlayVisible]);
  useEffect(() => { ui.setActiveNoteId(state.activeNote?.id ?? null); }, [state.activeNote?.id]);
  const newNote = (date?: string) => { void transition(() => {
    state.resetDraft(); state.setDraftCreatedDate(date ?? null); ui.setLastCursorPosition(0);
    ui.setViewMode("editor"); setDayOpen(false); focusEditor();
  }); };
  const browse = (section: SidebarItem) => { void transition(() => { ui.setSelectedSidebarItem(section); ui.setReadingOpen(false); ui.setViewMode("home"); }); };
  const selectDate = (date: string) => { ui.setSelectedDate(date); setDayOpen(true); ui.setReadingOpen(false); };
  const edit = (note: Note) => { void transition(() => { state.setActiveNote(note); ui.setLastCursorPosition(0); ui.setViewMode("editor"); setDayOpen(false); focusEditor(); }); };
  const calendar = ui.selectedSidebarItem === "calendar";
  const visibleNotes = ui.selectedSidebarItem === "trash" ? state.trashedNotes : ui.selectedSidebarItem === "archive" ? state.archivedNotes : state.notes.filter(note => calendar || dayOpen ? dayjs(note.created_at).format("YYYY-MM-DD") === ui.selectedDate : ui.selectedSidebarItem === "folders" ? note.folders.some(folder => folder.id === state.selectedFolderId) : true);
  const selected = visibleNotes.find(note => note.id === ui.selectedHistoryNoteId) ?? null;
  const selectNote = (note: Note) => { ui.setSelectedHistoryNoteId(note.id); ui.setReadingOpen(true); };
  const back = () => { ui.setReadingOpen(false); window.requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-note-id]')).find(element => element.dataset.noteId === ui.selectedHistoryNoteId); row?.focus();
  }); };
  const request = (message: string, label: string, action: () => Promise<void>) => setConfirmation({ message, label, action });
  const closeFolder = () => { setFolderOpen(false); folderTrigger.current?.focus(); };
  const createFolder = async () => { if (!folderName.trim()) return; const folder = await state.createFolder(folderName.trim()); if (folder) { setFolderName(""); if (ui.viewMode === "editor") await transition(async () => { await state.toggleActiveNoteFolder(folder.id); }); } };
  const list = <NoteHistory title={calendar || dayOpen ? formatSelectedDateHeader(ui.selectedDate) : ui.selectedSidebarItem} selectedNoteId={ui.selectedHistoryNoteId} onSelectNote={selectNote} onOpenNote={note => { if (!note.deleted_at) edit(note); }} notesOverride={visibleNotes} onCreateNote={() => newNote(calendar || dayOpen ? ui.selectedDate : undefined)} createNoteLabel={calendar || dayOpen ? "New on this date" : "+ New"} emptyTitle={calendar || dayOpen ? "No notes on this date. Choose another date or create a note." : "No notes here yet."} />;
  const readingActions = selected && ui.readingOpen ? <div className="reading-actions" role="group" aria-label="Note actions">
    {!selected.deleted_at && <ActionButton aria-label="Edit" title="Edit" onAction={() => edit(selected)}><PenLine size={18} aria-hidden="true" /></ActionButton>}
    {selected.deleted_at ? <><ActionButton aria-label="Restore" title="Restore" onAction={() => { void transition(() => state.restoreNote(selected.id)); }}><RotateCcw size={18} aria-hidden="true" /></ActionButton><ActionButton aria-label="Permanently delete" title="Permanently delete" onAction={() => request("This permanently deletes the note and cannot be undone.", "Permanently delete", () => state.permanentlyDeleteNote(selected.id))}><Trash2 size={18} aria-hidden="true" /></ActionButton></> : <><ActionButton aria-label={selected.archived_at ? "Unarchive" : "Archive"} title={selected.archived_at ? "Unarchive" : "Archive"} onAction={() => { void transition(() => selected.archived_at ? state.unarchiveNote(selected.id) : state.archiveNote(selected.id)); }}>{selected.archived_at ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}</ActionButton><ActionButton aria-label="Trash" title="Trash" onAction={() => request("Move this note to Trash? You can restore it later.", "Move to Trash", () => state.softDeleteNote(selected.id))}><Trash2 size={18} aria-hidden="true" /></ActionButton></>}
  </div> : null;
  const reading = selected ? <NoteReading note={selected} /> : <div className="empty reading-placeholder">Select a note to read it.</div>;
  return <main className="quicknote">
    {ui.viewMode === "editor" ? <section className="editor-screen"><header className="toolbar editor-header">{dayOpen ? <ActionButton aria-label={ui.readingOpen ? "Back" : "Back to note"} title={ui.readingOpen ? "Back" : "Back to note"} onAction={() => { if (ui.readingOpen) back(); else { setDayOpen(false); focusEditor(); } }}><ArrowLeft size={18} aria-hidden="true" /></ActionButton> : <ActionButton aria-label="New note" onAction={() => newNote()}><Plus size={18} aria-hidden="true" /></ActionButton>}<span className="metadata timestamp">{state.activeNote ? `Updated ${dayjs(state.activeNote.updated_at).format("MMM D, HH:mm")}` : "New note"}</span>{dayOpen && readingActions}<ThemeControl preference={theme.preference} onChoose={theme.choose} /></header>
      <div className="editor-layout"><aside className="date-rail"><DateStrip orientation="vertical" selectedDate={ui.selectedDate} noteCounts={noteCountsByDate(state.notes)} onSelectDate={selectDate} onOpenCalendar={() => browse("calendar")} /></aside><div className="editor-pane">
        {dayOpen ? <><div className={`day-browser ${ui.readingOpen ? "is-reading" : ""}`}><div className="list-pane">{list}</div>{reading}</div></> : <NoteEditor value={state.draftContent} onChange={state.setDraftContent} onCursorChange={ui.setLastCursorPosition} editorViewRef={editor} placeholderText="Title" />}
      </div></div><footer className="toolbar editor-footer"><ActionButton ref={folderTrigger} onAction={() => setFolderOpen(!folderOpen)} aria-expanded={folderOpen} className="folder-summary"><span>{state.activeNote?.folders[0]?.name ?? "Folders"}</span>{(state.activeNote?.folders.length ?? 0) > 1 && <span>+{state.activeNote!.folders.length - 1}</span>}</ActionButton><span className="metadata save-status">{{ idle: "Ready", dirty: "Unsaved", saving: "Saving…", saved: "Saved", error: "Not saved" }[state.saveStatus]}</span>{state.saveStatus === "error" && <ActionButton onAction={() => { void transition(retryAction.current ?? (() => {})); }}>Retry</ActionButton>}</footer>
    </section> : <section className="browser-screen"><aside className="sidebar"><ActionButton onAction={() => { ui.setViewMode("editor"); focusEditor(); }}>Editor</ActionButton>{[...sections, "calendar" as const].map(section => <ActionButton key={section} aria-pressed={ui.selectedSidebarItem === section} onAction={() => browse(section)}>{section === "recent" ? "Recent" : section[0].toUpperCase() + section.slice(1)}</ActionButton>)}</aside><div className={`browse-content ${ui.readingOpen ? "is-reading" : ""}`}>
      <header className="toolbar browse-header">{ui.readingOpen && selected && <ActionButton className="reading-back" aria-label="Back" title="Back" onAction={back}><ArrowLeft size={18} aria-hidden="true" /></ActionButton>}<h1>{calendar ? "Calendar" : "Notes"}</h1>{!calendar && !ui.readingOpen && <select aria-label="Notes section" value={ui.selectedSidebarItem} onChange={event => browse(event.target.value as SidebarItem)}>{sections.map(section => <option key={section} value={section}>{section[0].toUpperCase() + section.slice(1)}</option>)}</select>}{readingActions}<ThemeControl preference={theme.preference} onChoose={theme.choose} /></header>
      {ui.selectedSidebarItem === "folders" && <div className="toolbar folder-controls"><select aria-label="Folder" value={state.selectedFolderId ?? ""} onChange={event => useNoteStore.setState({ selectedFolderId: event.target.value })}><option value="">Choose a folder</option>{state.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><ActionButton aria-label="Create folder" onAction={() => setFolderOpen(true)}><Plus size={18} aria-hidden="true" /></ActionButton>{state.selectedFolderId && <ActionButton onAction={() => request("Deleting this folder moves all its active notes to Trash, including notes assigned to other folders. Archived notes stay archived.", "Delete folder", () => state.deleteFolder(state.selectedFolderId!))}>Delete folder</ActionButton>}</div>}
      <div className={`browse-panes ${calendar ? "calendar-panes" : ""}`}>{calendar && <div className="calendar-pane"><MonthCalendar selectedDate={ui.selectedDate} noteCounts={noteCountsByDate(state.notes)} onSelectDate={selectDate} /></div>}<div className="list-pane">{list}</div>{reading}</div>
    </div></section>}
    <nav className="bottom-nav" aria-label="Main navigation"><ActionButton aria-label="Editor" title="Editor" aria-pressed={ui.viewMode === "editor"} onAction={() => { ui.setViewMode("editor"); setDayOpen(false); focusEditor(); }}><PenLine size={20} aria-hidden="true" /></ActionButton><ActionButton aria-label="Notes" title="Notes" aria-pressed={ui.viewMode === "home" && !calendar} onAction={() => browse("recent")}><NotebookText size={20} aria-hidden="true" /></ActionButton><ActionButton aria-label="Calendar" title="Calendar" aria-pressed={ui.viewMode === "home" && calendar} onAction={() => browse("calendar")}><CalendarDays size={20} aria-hidden="true" /></ActionButton></nav>
    {folderOpen && <div ref={folderPanel} className="folder-popover" role="dialog" aria-label="Folders" onKeyDown={event => { if (event.key === "Escape") closeFolder(); }}><div className="toolbar"><strong>Folders</strong><ActionButton aria-label="Close folders" onAction={closeFolder}><X size={18} aria-hidden="true" /></ActionButton></div><input aria-label="Filter folders" placeholder="Filter folders" value={folderFilter} onChange={event => setFolderFilter(event.target.value)} /><div className="folder-options">{state.folders.filter(folder => folder.name.toLowerCase().includes(folderFilter.toLowerCase())).map(folder => <div className="toolbar" key={folder.id}><ActionButton className="folder-name" aria-pressed={state.activeNote?.folders.some(item => item.id === folder.id) ?? false} onAction={() => { void transition(async () => { await state.toggleActiveNoteFolder(folder.id); }); }}>{state.activeNote?.folders.some(item => item.id === folder.id) ? "✓ " : ""}{folder.name}</ActionButton><ActionButton onAction={() => { useNoteStore.setState({ selectedFolderId: folder.id }); browse("folders"); closeFolder(); }}>View</ActionButton></div>)}</div><div className="toolbar"><input aria-label="New folder name" placeholder="New folder" value={folderName} onChange={event => setFolderName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void createFolder(); }} /><ActionButton aria-label="Create folder" onAction={() => { void createFolder(); }}><Plus size={18} aria-hidden="true" /></ActionButton></div>{state.folderError && <p role="alert">{state.folderError}</p>}</div>}
    {confirmation && <Confirmation message={confirmation.message} label={confirmation.label} onClose={() => setConfirmation(null)} onConfirm={() => { void transition(async () => { await confirmation.action(); setConfirmation(null); ui.setReadingOpen(false); }); }} />}
    {theme.error && <Toast message={theme.error} />}
    {blocked && <div className="save-failure" role="alert"><span>Not saved — Retry</span><ActionButton onAction={() => { void transition(retryAction.current ?? (() => {})); }}>Retry</ActionButton><ActionButton onAction={() => { setBlocked(false); retryAction.current = null; focusEditor(); }}>Keep editing</ActionButton></div>}
  </main>;
}
