import dayjs from "dayjs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDateRange, todayDateKey } from "../lib/dates";
import { DateStrip } from "./DateStrip";

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}

  disconnect() {
    resizeObserverCallback = null;
  }
}

describe("DateStrip", () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a seven-day window around today in the strip", () => {
    const today = todayDateKey();
    const window = buildDateRange(today, 3, 3);

    render(
      <DateStrip
        orientation="vertical"
        selectedDate={today}
        onSelectDate={() => undefined}
        noteCounts={{}}
        onOpenCalendar={() => undefined}
      />
    );

    for (const dateKey of window) {
      expect(screen.getByLabelText(dayjs(dateKey).format("dddd, MMMM D"))).toBeTruthy();
    }
  });

  it("selects a date on click", () => {
    const today = todayDateKey();
    const onSelectDate = vi.fn();

    render(
      <DateStrip
        orientation="horizontal"
        selectedDate={today}
        onSelectDate={onSelectDate}
        noteCounts={{}}
        onOpenCalendar={() => undefined}
      />
    );

    const tomorrow = buildDateRange(today, 0, 1)[1];
    fireEvent.mouseDown(screen.getByLabelText(dayjs(tomorrow).format("dddd, MMMM D")));

    expect(onSelectDate).toHaveBeenCalledWith(tomorrow);
  });

  it("recenters selected date when the strip is resized", () => {
    const today = todayDateKey();

    render(
      <DateStrip
        orientation="vertical"
        selectedDate={today}
        onSelectDate={() => undefined}
        noteCounts={{}}
        visible
      />
    );

    const listbox = screen.getByRole("listbox");
    const selectedButton = screen.getByLabelText(dayjs(today).format("dddd, MMMM D"));

    Object.defineProperty(listbox, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(listbox, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(selectedButton, "offsetTop", { configurable: true, value: 480 });
    Object.defineProperty(selectedButton, "offsetHeight", { configurable: true, value: 40 });

    resizeObserverCallback?.([], {} as ResizeObserver);

    expect(listbox.scrollTop).toBe(400);
  });

  it("recenters selected date when overlay becomes visible again", () => {
    const today = todayDateKey();

    const { rerender } = render(
      <DateStrip
        orientation="vertical"
        selectedDate={today}
        onSelectDate={() => undefined}
        noteCounts={{}}
        visible={false}
      />
    );

    rerender(
      <DateStrip
        orientation="vertical"
        selectedDate={today}
        onSelectDate={() => undefined}
        noteCounts={{}}
        visible
      />
    );

    const listbox = screen.getByRole("listbox");
    const selectedButton = screen.getByLabelText(dayjs(today).format("dddd, MMMM D"));

    Object.defineProperty(listbox, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(listbox, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(selectedButton, "offsetTop", { configurable: true, value: 480 });
    Object.defineProperty(selectedButton, "offsetHeight", { configurable: true, value: 40 });

    resizeObserverCallback?.([], {} as ResizeObserver);

    expect(listbox.scrollTop).toBe(400);
  });
});
