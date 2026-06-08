import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarPicker } from "./CalendarPicker";

describe("CalendarPicker", () => {
  it("navigates to the previous month", () => {
    render(
      <CalendarPicker
        selectedDate="2026-06-09"
        noteCounts={{}}
        onSelectDate={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText("Jun 2026")).toBeTruthy();
    fireEvent.mouseDown(screen.getByLabelText("Previous month"));
    expect(screen.getByText("May 2026")).toBeTruthy();
  });

  it("selects a date and closes", () => {
    const onSelectDate = vi.fn();
    const onClose = vi.fn();

    render(
      <CalendarPicker
        selectedDate="2026-06-09"
        noteCounts={{}}
        onSelectDate={onSelectDate}
        onClose={onClose}
      />
    );

    fireEvent.mouseDown(screen.getByLabelText("Tuesday, June 9"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-06-09");
    expect(onClose).toHaveBeenCalled();
  });
});
