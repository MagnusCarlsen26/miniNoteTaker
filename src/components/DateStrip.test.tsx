import dayjs from "dayjs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDateRange, todayDateKey } from "../lib/dates";
import { DateStrip } from "./DateStrip";

describe("DateStrip", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
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

  it("scrolls today into view on mount", () => {
    const today = todayDateKey();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <DateStrip
        orientation="vertical"
        selectedDate={today}
        onSelectDate={() => undefined}
        noteCounts={{}}
        onOpenCalendar={() => undefined}
      />
    );

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
