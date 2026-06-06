import { useCallback, useEffect } from "react";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";

export function useAutosaveNote(): {
  flushSave: () => Promise<Note | null>;
} {
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const pendingSave = useNoteStore((state) => state.pendingSave);
  const saveDraft = useNoteStore((state) => state.saveDraft);
  const retryPendingSave = useNoteStore((state) => state.retryPendingSave);

  const flushSave = useCallback(async () => {
    let note: Note | null = null;
    if (useNoteStore.getState().pendingSave) {
      note = await retryPendingSave();
    }

    if (useNoteStore.getState().saveStatus === "dirty") {
      note = await saveDraft();
    }

    return note;
  }, [retryPendingSave, saveDraft]);

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
