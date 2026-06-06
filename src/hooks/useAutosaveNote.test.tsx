import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/noteStore";
import { useAutosaveNote } from "./useAutosaveNote";

function resetStore() {
  useNoteStore.setState({
    activeNote: null,
    draftContent: "",
    notes: [],
    saveStatus: "idle",
    saveError: null,
    pendingSave: null
  });
}

describe("useAutosaveNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("does not auto-save on dirty state", () => {
    const saveDraft = vi.fn().mockResolvedValue(null);
    useNoteStore.setState({ saveDraft });
    renderHook(() => useAutosaveNote());

    act(() => {
      useNoteStore.setState({ draftContent: "dirty", saveStatus: "dirty" });
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("flushSave saves immediately when dirty", async () => {
    const saveDraft = vi.fn().mockImplementation(async () => {
      useNoteStore.setState({ saveStatus: "saved" });
      return null;
    });
    useNoteStore.setState({ saveDraft });
    const { result } = renderHook(() => useAutosaveNote());

    act(() => {
      useNoteStore.setState({ draftContent: "dirty", saveStatus: "dirty" });
    });

    await act(async () => {
      await result.current.flushSave();
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("retries pending save before dirty save during flush", async () => {
    const calls: string[] = [];
    const retryPendingSave = vi.fn().mockImplementation(async () => {
      calls.push("retry");
      useNoteStore.setState({ pendingSave: null, saveStatus: "dirty" });
      return null;
    });
    const saveDraft = vi.fn().mockImplementation(async () => {
      calls.push("save");
      return null;
    });
    useNoteStore.setState({
      draftContent: "dirty",
      pendingSave: { noteId: null, content: "pending" },
      retryPendingSave,
      saveDraft,
      saveStatus: "dirty"
    });
    const { result } = renderHook(() => useAutosaveNote());

    await act(async () => {
      await result.current.flushSave();
    });

    expect(calls).toEqual(["retry", "save"]);
  });
});
