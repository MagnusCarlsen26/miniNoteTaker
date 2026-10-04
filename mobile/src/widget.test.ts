import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ refresh: vi.fn(), getPendingNavigation: vi.fn() }));
vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: () => native }));
import { pendingWidgetNavigation, refreshWidgets } from "./widget";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("widget refresh bridge", () => {
  it("coalesces rapid commits and retries a failed refresh on the next lifecycle request", async () => {
    vi.useFakeTimers();
    native.refresh.mockRejectedValueOnce(new Error("Launcher unavailable")).mockResolvedValue(undefined);
    refreshWidgets();
    await vi.advanceTimersByTimeAsync(200);
    refreshWidgets(); refreshWidgets();
    await vi.advanceTimersByTimeAsync(349);
    expect(native.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(native.refresh).toHaveBeenCalledTimes(1);
    refreshWidgets();
    await vi.advanceTimersByTimeAsync(350);
    expect(native.refresh).toHaveBeenCalledTimes(2);
  });
  it("exposes pending native navigation", () => {
    native.getPendingNavigation.mockReturnValue("quicknote://todo");
    expect(pendingWidgetNavigation()).toBe("quicknote://todo");
  });
});
