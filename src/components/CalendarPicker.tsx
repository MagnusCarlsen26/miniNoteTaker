import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { buildMonthWeeks, todayDateKey } from "../lib/dates";

type CalendarPickerProps = {
  selectedDate: string;
  noteCounts: Record<string, number>;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  anchor?: "left" | "right" | "below" | "panel";
};

function handleMouseDownAction(event: MouseEvent<HTMLElement>, action: () => void) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  action();
}

export function CalendarPicker({
  selectedDate,
  noteCounts,
  onSelectDate,
  onClose,
  anchor = "left"
}: CalendarPickerProps) {
  const today = todayDateKey();
  const [visibleMonth, setVisibleMonth] = useState(() => dayjs(selectedDate).startOf("month"));

  useEffect(() => {
    let removeListener: (() => void) | undefined;
    const frame = window.requestAnimationFrame(() => {
      const handleMouseDown = (event: globalThis.MouseEvent) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("[data-calendar-picker]") ||
          target.closest("[data-date-rail]") ||
          target.closest("[data-calendar-trigger]")
        ) {
          return;
        }
        onClose();
      };

      document.addEventListener("mousedown", handleMouseDown);
      removeListener = () => document.removeEventListener("mousedown", handleMouseDown);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      removeListener?.();
    };
  }, [onClose]);

  const weeks = useMemo(() => buildMonthWeeks(visibleMonth), [visibleMonth]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      data-calendar-picker
      role="grid"
      aria-label="Calendar"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`absolute z-30 w-56 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg transition-opacity ${
        anchor === "right"
          ? "bottom-0 right-full mr-2"
          : anchor === "below"
            ? "left-0 top-full mt-1"
            : anchor === "panel"
              ? "right-0 top-0"
              : "bottom-0 left-full ml-2"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onMouseDown={(event) =>
            handleMouseDownAction(event, () => setVisibleMonth((month) => month.subtract(1, "month")))
          }
          onClick={(event) => event.preventDefault()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--hover)]"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {visibleMonth.format("MMM YYYY")}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onMouseDown={(event) =>
            handleMouseDownAction(event, () => setVisibleMonth((month) => month.add(1, "month")))
          }
          onClick={(event) => event.preventDefault()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--hover)]"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-[var(--text-secondary)]">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid gap-0.5">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-0.5">
            {week.map((dateKey) => {
              const date = dayjs(dateKey);
              const inMonth = date.month() === visibleMonth.month();
              const isToday = dateKey === today;
              const isSelected = dateKey === selectedDate;
              const hasNotes = (noteCounts[dateKey] ?? 0) > 0;

              return (
                <button
                  key={dateKey}
                  type="button"
                  role="gridcell"
                  aria-label={date.format("dddd, MMMM D")}
                  aria-pressed={isSelected}
                  onMouseDown={(event) =>
                    handleMouseDownAction(event, () => {
                      onSelectDate(dateKey);
                      onClose();
                    })
                  }
                  onClick={(event) => event.preventDefault()}
                  className={`calendar-date group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs transition ${
                    inMonth
                      ? "text-[var(--text)] hover:bg-[var(--hover)]"
                      : "text-[var(--text-secondary)]"
                  } aria-pressed:bg-[var(--active)] aria-pressed:text-[var(--on-active)]`}
                  style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
                >
                  {date.format("D")}
                  <span
                    className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                      hasNotes
                        ? "bg-[var(--accent)] group-aria-pressed:bg-[var(--on-active)]"
                        : "bg-transparent"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
