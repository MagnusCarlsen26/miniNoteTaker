import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/noteStore";
import { useAutosaveNote } from "./useAutosaveNote";
const original = useNoteStore.getState().saveDraft;
describe("useAutosaveNote", () => {
  beforeEach(() => { vi.useFakeTimers(); useNoteStore.setState({ activeNote: null, draftContent: "", revision: 0, saveStatus: "idle", saveError: null, pendingSave: null }); });
  afterEach(() => { vi.useRealTimers(); useNoteStore.setState({ saveDraft: original }); });
  it("debounces typing for 500ms and restarts on edits", async () => {
    const save = vi.fn(async () => { useNoteStore.setState({ saveStatus: "saved" }); return null; });
    useNoteStore.setState({ saveDraft: save }); renderHook(() => useAutosaveNote());
    act(() => useNoteStore.getState().setDraftContent("first"));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    act(() => useNoteStore.getState().setDraftContent("second"));
    await act(async () => { await vi.advanceTimersByTimeAsync(499); }); expect(save).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(save).toHaveBeenCalledTimes(1);
  });
  it("flushes immediately and returns explicit success", async () => {
    const save = vi.fn(async () => { useNoteStore.setState({ saveStatus: "saved" }); return null; });
    useNoteStore.setState({ saveDraft: save, saveStatus: "dirty" }); const { result } = renderHook(() => useAutosaveNote());
    let outcome; await act(async () => { outcome = await result.current.flushSave(); });
    expect(outcome).toEqual({ ok: true, note: null }); expect(save).toHaveBeenCalledTimes(1);
  });
  it("returns failure and retains draft, then allows retry", async () => {
    const save = vi.fn(async () => { useNoteStore.setState({ saveStatus: "error", saveError: "Not saved" }); return null; });
    useNoteStore.setState({ saveDraft: save, draftContent: "retain me", saveStatus: "dirty" }); const { result } = renderHook(() => useAutosaveNote());
    let outcome; await act(async () => { outcome = await result.current.flushSave(); }); expect(outcome).toEqual({ ok: false, error: "Not saved" }); expect(useNoteStore.getState().draftContent).toBe("retain me");
    save.mockImplementation(async () => { useNoteStore.setState({ saveStatus: "saved" }); return null; });
    await act(async () => { outcome = await result.current.flushSave(); }); expect(outcome).toEqual({ ok: true, note: null });
  });
});
