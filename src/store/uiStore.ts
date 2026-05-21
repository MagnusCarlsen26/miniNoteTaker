import { create } from "zustand";

type UiState = {
  isOverlayVisible: boolean;
  lastCommandResult: string | null;
  setOverlayVisible: (isOverlayVisible: boolean) => void;
  setLastCommandResult: (lastCommandResult: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isOverlayVisible: false,
  lastCommandResult: null,
  setOverlayVisible: (isOverlayVisible) => set({ isOverlayVisible }),
  setLastCommandResult: (lastCommandResult) => set({ lastCommandResult })
}));

