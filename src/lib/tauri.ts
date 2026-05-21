import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types/note";

export function showOverlay(): Promise<void> {
  return invoke<void>("show_overlay");
}

export function hideOverlay(): Promise<void> {
  return invoke<void>("hide_overlay");
}

export function appReady(): Promise<string> {
  return invoke<string>("app_ready");
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

export function deleteEmptyNote(id: string): Promise<void> {
  return invoke<void>("delete_empty_note", { id });
}

export function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>("get_setting", { key });
}

export function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>("set_setting", { key, value });
}
