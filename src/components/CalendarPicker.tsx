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
      className={`absolute z-30 w-56 rounded-md border border-[#dce5d8] bg-[#fbfdfb] p-2 shadow-lg transition-opacity dark:border-[#2c3628] dark:bg-[#141b12] ${
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
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#536150] hover:bg-[#eef4ec] dark:text-[#b8c7b4] dark:hover:bg-[#202a1d]"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#536150] dark:text-[#b8c7b4]">
          {visibleMonth.format("MMM YYYY")}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onMouseDown={(event) =>
            handleMouseDownAction(event, () => setVisibleMonth((month) => month.add(1, "month")))
          }
          onClick={(event) => event.preventDefault()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#536150] hover:bg-[#eef4ec] dark:text-[#b8c7b4] dark:hover:bg-[#202a1d]"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-[#657064] dark:text-[#aeb9aa]">
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
                  className={`group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs transition ${
                    inMonth
                      ? "text-[#253022] hover:bg-[#eef4ec] dark:text-[#e2eadf] dark:hover:bg-[#202a1d]"
                      : "text-[#9aa89a] dark:text-[#5f6a5d]"
                  } aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]`}
                  style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1px #2f6b43" } : undefined}
                >
                  {date.format("D")}
                  <span
                    className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                      hasNotes
                        ? "bg-[#2f6b43] group-aria-pressed:bg-white dark:bg-[#8ed081]"
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
