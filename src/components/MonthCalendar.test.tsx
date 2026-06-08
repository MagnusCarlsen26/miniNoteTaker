import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthCalendar } from "./MonthCalendar";

describe("MonthCalendar", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the selected month tile", () => {
    render(
      <MonthCalendar
        selectedDate="2026-06-09"
        noteCounts={{}}
        onSelectDate={() => undefined}
      />
    );

    const monthTile = screen.getByText("June 2026").parentElement;
    expect(monthTile).toBeTruthy();
    expect(within(monthTile as HTMLElement).getByLabelText("Monday, June 1")).toBeTruthy();
    expect(within(monthTile as HTMLElement).getByLabelText("Tuesday, June 30")).toBeTruthy();
  });

  it("selects a date on click", () => {
    const onSelectDate = vi.fn();

    render(
      <MonthCalendar
        selectedDate="2026-06-09"
        noteCounts={{}}
        onSelectDate={onSelectDate}
      />
    );

    const monthTile = screen.getByText("June 2026").parentElement as HTMLElement;
    fireEvent.mouseDown(within(monthTile).getByLabelText("Friday, June 5"));
    expect(onSelectDate).toHaveBeenCalledWith("2026-06-05");
  });
});
