import { invoke } from "@tauri-apps/api/core";
import type { Folder, Note } from "../types/note";

export function showOverlay(): Promise<void> {
  return invoke<void>("show_overlay");
}

export function hideOverlay(): Promise<void> {
  return invoke<void>("hide_overlay");
}

export function centerOverlay(): Promise<void> {
  return invoke<void>("center_overlay");
}

export function saveWindowSize(width: number, height: number): Promise<void> {
  return invoke<void>("save_window_size", { width, height });
}

export function appReady(): Promise<string> {
  return invoke<string>("app_ready");
}

export function registerShortcut(accelerator: string): Promise<void> {
  return invoke<void>("register_shortcut", { accelerator });
}

export function getRegisteredShortcut(): Promise<string> {
  return invoke<string>("get_registered_shortcut");
}

export function getShortcutFailure(): Promise<string | null> {
  return invoke<string | null>("get_shortcut_failure");
}

export function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

export function createNote(content: string): Promise<Note> {
  return invoke<Note>("create_note", { content });
}

export function updateNote(id: string, content: string): Promise<Note> {
  return invoke<Note>("update_note", { id, content });
}

export function listNotes(limit?: number): Promise<Note[]> {
  return invoke<Note[]>("list_notes", { limit });
}

export function getNote(id: string): Promise<Note | null> {
  return invoke<Note | null>("get_note", { id });
}

export function setPinned(id: string, pinned: boolean): Promise<Note> {
  return invoke<Note>("set_pinned", { id, pinned });
}

export function softDeleteNote(id: string): Promise<void> {
  return invoke<void>("soft_delete_note", { id });
}

export function restoreNote(id: string): Promise<Note> {
  return invoke<Note>("restore_note", { id });
}

export function permanentlyDeleteNote(id: string): Promise<void> {
  return invoke<void>("permanently_delete_note", { id });
}

export function listTrashedNotes(limit?: number): Promise<Note[]> {
  return invoke<Note[]>("list_trashed_notes", { limit });
}

export function archiveNote(id: string): Promise<Note> {
  return invoke<Note>("archive_note", { id });
}

export function unarchiveNote(id: string): Promise<Note> {
  return invoke<Note>("unarchive_note", { id });
}

export function listArchivedNotes(limit?: number): Promise<Note[]> {
  return invoke<Note[]>("list_archived_notes", { limit });
}

export function getTrashedNote(id: string): Promise<Note | null> {
  return invoke<Note | null>("get_trashed_note", { id });
}

export function deleteEmptyNote(id: string): Promise<void> {
  return invoke<void>("delete_empty_note", { id });
}

export function createFolder(name: string): Promise<Folder> {
  return invoke<Folder>("create_folder", { name });
}

export function listFolders(): Promise<Folder[]> {
  return invoke<Folder[]>("list_folders");
}

export function deleteFolder(id: string): Promise<void> {
  return invoke<void>("delete_folder", { id });
}

export function listNotesByFolder(folderId: string, limit?: number): Promise<Note[]> {
  return invoke<Note[]>("list_notes_by_folder", { folderId, limit });
}

export function listNotesByCreatedDate(
  startIso: string,
  endIso: string,
  limit?: number
): Promise<Note[]> {
  return invoke<Note[]>("list_notes_by_created_date", { startIso, endIso, limit });
}

export function setNoteFolders(noteId: string, folderIds: string[]): Promise<Note> {
  return invoke<Note>("set_note_folders", { noteId, folderIds });
}

export function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>("get_setting", { key });
}

export function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>("set_setting", { key, value });
}
