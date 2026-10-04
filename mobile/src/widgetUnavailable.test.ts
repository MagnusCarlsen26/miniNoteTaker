import { expect, it, vi } from "vitest";
vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: () => null }));
import { pendingWidgetNavigation, refreshWidgets, widgetsAvailable } from "./widget";
it("keeps Expo Go functional without the Android native widget module", async () => {
  vi.useFakeTimers();
  expect(widgetsAvailable).toBe(false);
  expect(pendingWidgetNavigation()).toBeNull();
  expect(() => refreshWidgets()).not.toThrow();
  await vi.advanceTimersByTimeAsync(350);
  vi.useRealTimers();
});
