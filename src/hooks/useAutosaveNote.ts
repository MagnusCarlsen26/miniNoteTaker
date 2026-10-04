import { useCallback, useEffect } from "react";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";
export type FlushResult = { ok: true; note: Note | null } | { ok: false; error: string };
export async function flushDraft(): Promise<FlushResult> {
  let note = useNoteStore.getState().activeNote;
  while (true) {
    const state = useNoteStore.getState();
    if (!["dirty", "saving", "error"].includes(state.saveStatus) && !state.pendingSave) return { ok: true, note };
    note = await state.saveDraft();
    const current = useNoteStore.getState();
    if (current.saveStatus === "error") return { ok: false, error: current.saveError ?? "Not saved" };
  }
}
export function useAutosaveNote() {
  const revision = useNoteStore(state => state.revision);
  const status = useNoteStore(state => state.saveStatus);
  const flushSave = useCallback(flushDraft, []);
  useEffect(() => {
    if (status !== "dirty") return;
    const timer = setTimeout(() => { void useNoteStore.getState().saveDraft(); }, 500);
    return () => clearTimeout(timer);
  }, [revision, status]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (["dirty", "saving", "error"].includes(useNoteStore.getState().saveStatus)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  return { flushSave };
}
