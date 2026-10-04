import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import { KeyboardEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "./ActionButton";
import { buildDateRange, todayDateKey } from "../lib/dates";
import { centerSelectedDateInStrip } from "../lib/dateStripScroll";

type DateStripProps = {
  orientation: "vertical" | "horizontal";
  selectedDate: string;
  onSelectDate: (date: string) => void;
  noteCounts: Record<string, number>;
  onOpenCalendar?: () => void;
  showCalendarTrigger?: boolean;
  visible?: boolean;
};

export function DateStrip({
  orientation,
  selectedDate,
  onSelectDate,
  noteCounts,
  onOpenCalendar,
  showCalendarTrigger = true,
  visible = true
}: DateStripProps) {
  const today = todayDateKey();
  const [visibleMonth, setVisibleMonth] = useState(dayjs(selectedDate).format("MMM YY"));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectedDateRef = useRef<HTMLButtonElement | null>(null);
  const dates = useMemo(() => buildDateRange(today, 120, 120), [today]);
  const isVertical = orientation === "vertical";
  const showCalendar = showCalendarTrigger && Boolean(onOpenCalendar);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }

    const container = scrollRef.current;
    const selected = selectedDateRef.current;
    if (!container || !selected) {
      return;
    }

    const center = () => {
      const scrollContainer = scrollRef.current;
      const selectedElement = selectedDateRef.current;
      if (!scrollContainer || !selectedElement) {
        return;
      }

      centerSelectedDateInStrip(scrollContainer, selectedElement, orientation);
    };

    center();

    const observer = new ResizeObserver(center);
    observer.observe(container);

    return () => observer.disconnect();
  }, [visible, selectedDate, orientation]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = dates.indexOf(selectedDate);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextDate = dates[Math.min(currentIndex + 1, dates.length - 1)];
      if (nextDate) {
        onSelectDate(nextDate);
      }
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const previousDate = dates[Math.max(currentIndex - 1, 0)];
      if (previousDate) {
        onSelectDate(previousDate);
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSelectDate(selectedDate);
    }
  };

  return (
    <div
      className={
        isVertical
          ? "relative flex h-full min-h-0 w-11 flex-col"
          : "relative flex min-w-0 flex-1 items-center gap-1"
      }
    >
      {isVertical && <div className="text-center text-[9px] py-1" aria-label="Visible month">{visibleMonth}</div>}
      {isVertical ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-gradient-to-b from-[#f7faf6] to-transparent dark:from-[#11170f]" />
          <div
            className={`pointer-events-none absolute inset-x-0 z-10 h-3 bg-gradient-to-t from-[#f7faf6] to-transparent dark:from-[#11170f] ${
              showCalendar ? "bottom-9" : "bottom-0"
            }`}
          />
        </>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-date]"));
          const button = buttons.find(item => item.getBoundingClientRect().bottom > rect.top + 8);
          if (button?.dataset.date) setVisibleMonth(dayjs(button.dataset.date).format("MMM YY"));
        }}
        role="listbox"
        aria-label="Date strip"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={
          isVertical
            ? "min-h-0 flex-1 overflow-y-auto  [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "min-w-0 flex-1 overflow-x-auto  [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        }
      >
        <div
          className={
            isVertical
              ? "flex flex-col items-center gap-1 px-1 py-1"
              : "flex w-max items-center gap-1 px-1 py-1"
          }
        >
          {dates.map((dateKey) => {
            const date = dayjs(dateKey);
            const isToday = dateKey === today;
            const isSelected = dateKey === selectedDate;
            const hasNotes = (noteCounts[dateKey] ?? 0) > 0;

            return (
              <ActionButton
                key={dateKey}
                data-date={dateKey}
                ref={isSelected ? selectedDateRef : undefined}
                type="button"
                role="option"
                aria-pressed={isSelected}
                aria-label={date.format("dddd, MMMM D")}
                onAction={() => onSelectDate(dateKey)}
                className={
                  isVertical
                    ? "group flex w-8 shrink-0  flex-col items-center justify-center rounded-md py-1 text-[10px] font-medium text-[#536150] transition hover:bg-[#eef4ec] aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:text-[#b8c7b4] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]"
                    : "group flex h-10 w-10 shrink-0  flex-col items-center justify-center rounded-md text-[10px] font-medium text-[#536150] transition hover:bg-[#eef4ec] aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:text-[#b8c7b4] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]"
                }
                style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1px #2f6b43" } : undefined}
              >
                <span className="text-[9px] uppercase leading-none opacity-80">{date.format("dd").charAt(0)}</span>
                <span className="leading-none">{date.format("D")}</span>
                {hasNotes ? (
                  <span
                    className="mt-0.5 h-1 w-1 rounded-full bg-[#2f6b43] group-aria-pressed:bg-white dark:bg-[#8ed081]"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="mt-0.5 h-1 w-1" aria-hidden="true" />
                )}
              </ActionButton>
            );
          })}
        </div>
      </div>
      {isVertical && <ActionButton className="!px-0 !text-[9px]" onAction={() => onSelectDate(today)}>Today</ActionButton>}
      {showCalendar ? (
        <ActionButton
          type="button"
          data-calendar-trigger
          aria-label="Open calendar"
          onAction={() => onOpenCalendar?.()}
          className={
            isVertical
              ? "inline-flex h-8 w-full shrink-0 items-center justify-center border-t border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
              : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
          }
        >
          <Calendar size={14} aria-hidden="true" />
        </ActionButton>
      ) : null}
    </div>
  );
}
