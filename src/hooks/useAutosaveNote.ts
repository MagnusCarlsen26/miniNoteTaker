import { useCallback, useEffect, useRef } from "react";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";

export function useAutosaveNote(options?: { debounceMs?: number }): {
  flushSave: () => Promise<Note | null>;
} {
  const debounceMs = options?.debounceMs ?? 300;
  const draftContent = useNoteStore((state) => state.draftContent);
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const pendingSave = useNoteStore((state) => state.pendingSave);
  const saveDraft = useNoteStore((state) => state.saveDraft);
  const retryPendingSave = useNoteStore((state) => state.retryPendingSave);
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearSaveTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushSave = useCallback(async () => {
    clearSaveTimer();

    let note: Note | null = null;
    if (useNoteStore.getState().pendingSave) {
      note = await retryPendingSave();
    }

    if (useNoteStore.getState().saveStatus === "dirty") {
      note = await saveDraft();
    }

    return note;
  }, [clearSaveTimer, retryPendingSave, saveDraft]);

  useEffect(() => {
    clearSaveTimer();

    if (saveStatus === "dirty") {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void saveDraft();
      }, debounceMs);
    }

    return clearSaveTimer;
  }, [clearSaveTimer, debounceMs, draftContent, saveDraft, saveStatus]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSave();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushSave, pendingSave]);

  return { flushSave };
}
