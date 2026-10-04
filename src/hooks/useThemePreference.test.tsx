import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "../lib/tauri";
import { useUiStore } from "../store/uiStore";
import { useThemePreference } from "./useThemePreference";
vi.mock("../lib/tauri", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
let dark = false;
let listeners: Set<() => void>;
beforeEach(() => {
  vi.resetAllMocks(); dark = false; listeners = new Set();
  useUiStore.setState({ theme: "system" });
  vi.mocked(getSetting).mockResolvedValue(null);
  vi.mocked(setSetting).mockResolvedValue(undefined);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ get matches() { return dark; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }) });
});
afterEach(cleanup);
it.each(["light", "dark", "system", null, "invalid"])("loads %s with System as fallback", async value => {
  vi.mocked(getSetting).mockResolvedValue(value);
  const { result } = renderHook(useThemePreference);
  await act(async () => {});
  expect(result.current.preference).toBe(value === "light" || value === "dark" ? value : "system");
});
it("follows live system changes only for System", async () => {
  const { result } = renderHook(useThemePreference);
  await act(async () => {});
  act(() => { dark = true; listeners.forEach(fn => fn()); });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  act(() => result.current.choose("light"));
  expect(listeners.size).toBe(0);
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  act(() => result.current.choose("dark"));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  act(() => result.current.choose("system"));
  act(() => { dark = false; listeners.forEach(fn => fn()); });
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
it("does not let delayed loading replace a user choice", async () => {
  let resolve!: (value: string) => void;
  vi.mocked(getSetting).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(useThemePreference);
  act(() => result.current.choose("dark"));
  await act(async () => resolve("light"));
  expect(result.current.preference).toBe("dark");
});
it("reports loading failures", async () => {
  vi.mocked(getSetting).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(useThemePreference);
  await waitFor(() => expect(result.current.error).toBe("Could not load theme."));
  expect(result.current.preference).toBe("system");
});
it("retains appearance on save failure and recovers on the next choice", async () => {
  vi.mocked(setSetting).mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(useThemePreference);
  await act(async () => {});
  act(() => result.current.choose("dark"));
  await waitFor(() => expect(result.current.error).toContain("Could not save"));
  expect(result.current.preference).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await act(async () => result.current.choose("light"));
  expect(result.current.error).toBeNull();
});
it("serializes rapid writes and persists the latest choice after a failed write", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(setSetting).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const { result } = renderHook(useThemePreference);
  await act(async () => {});
  await act(async () => result.current.choose("dark"));
  act(() => { result.current.choose("light"); result.current.choose("system"); });
  expect(setSetting).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("failed")));
  expect(vi.mocked(setSetting).mock.calls).toEqual([["theme.preference", "dark"], ["theme.preference", "light"], ["theme.preference", "system"]]);
  expect(result.current.preference).toBe("system");
  expect(result.current.error).toBeNull();
});
