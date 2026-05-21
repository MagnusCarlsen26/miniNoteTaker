import { create } from "zustand";
import type { ThemePreference } from "../types/note";

export type ViewMode = "editor" | "home";
export type SidebarItem = "recent";

type UiState = {
  isOverlayVisible: boolean;
  lastCommandResult: string | null;
  theme: ThemePreference;
  toastMessage: string | null;
  lastCursorPosition: number;
  activeNoteId: string | null;
  historyLimit: 1000;
  shortcutFailure: string | null;
  viewMode: ViewMode;
  selectedSidebarItem: SidebarItem;
  selectedHistoryNoteId: string | null;
  setOverlayVisible: (isOverlayVisible: boolean) => void;
  setLastCommandResult: (lastCommandResult: string | null) => void;
  setTheme: (theme: ThemePreference) => void;
  setToastMessage: (toastMessage: string | null) => void;
  setLastCursorPosition: (lastCursorPosition: number) => void;
  setActiveNoteId: (activeNoteId: string | null) => void;
  setShortcutFailure: (shortcutFailure: string | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSelectedSidebarItem: (selectedSidebarItem: SidebarItem) => void;
  setSelectedHistoryNoteId: (selectedHistoryNoteId: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isOverlayVisible: false,
  lastCommandResult: null,
  theme: "system",
  toastMessage: null,
  lastCursorPosition: 0,
  activeNoteId: null,
  historyLimit: 1000,
  shortcutFailure: null,
  viewMode: "editor",
  selectedSidebarItem: "recent",
  selectedHistoryNoteId: null,
  setOverlayVisible: (isOverlayVisible) => set({ isOverlayVisible }),
  setLastCommandResult: (lastCommandResult) => set({ lastCommandResult }),
  setTheme: (theme) => set({ theme }),
  setToastMessage: (toastMessage) => set({ toastMessage }),
  setLastCursorPosition: (lastCursorPosition) => set({ lastCursorPosition }),
  setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
  setShortcutFailure: (shortcutFailure) => set({ shortcutFailure }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedSidebarItem: (selectedSidebarItem) => set({ selectedSidebarItem }),
  setSelectedHistoryNoteId: (selectedHistoryNoteId) => set({ selectedHistoryNoteId })
}));
