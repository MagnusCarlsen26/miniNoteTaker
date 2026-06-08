import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import { KeyboardEvent, MouseEvent, useEffect, useMemo, useRef } from "react";
import { buildDateRange, todayDateKey } from "../lib/dates";

type DateStripProps = {
  orientation: "vertical" | "horizontal";
  selectedDate: string;
  onSelectDate: (date: string) => void;
  noteCounts: Record<string, number>;
  onOpenCalendar?: () => void;
  showCalendarTrigger?: boolean;
};

function handleMouseDownAction(event: MouseEvent<HTMLElement>, action: () => void) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  action();
}

export function DateStrip({
  orientation,
  selectedDate,
  onSelectDate,
  noteCounts,
  onOpenCalendar,
  showCalendarTrigger = true
}: DateStripProps) {
  const today = todayDateKey();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayRef = useRef<HTMLButtonElement | null>(null);
  const dates = useMemo(() => buildDateRange(today, 120, 120), [today]);
  const isVertical = orientation === "vertical";
  const showCalendar = showCalendarTrigger && Boolean(onOpenCalendar);

  useEffect(() => {
    todayRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);

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
        role="listbox"
        aria-label="Date strip"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={
          isVertical
            ? "min-h-0 flex-1 overflow-y-auto scroll-smooth [scroll-snap-type:y_mandatory] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "min-w-0 flex-1 overflow-x-auto scroll-smooth [scroll-snap-type:x_mandatory] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              <button
                key={dateKey}
                ref={isToday ? todayRef : undefined}
                type="button"
                role="option"
                aria-pressed={isSelected}
                aria-label={date.format("dddd, MMMM D")}
                onMouseDown={(event) => handleMouseDownAction(event, () => onSelectDate(dateKey))}
                onClick={(event) => event.preventDefault()}
                className={
                  isVertical
                    ? "group flex w-8 shrink-0 snap-center flex-col items-center justify-center rounded-md py-1 text-[10px] font-medium text-[#536150] transition hover:bg-[#eef4ec] aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:text-[#b8c7b4] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]"
                    : "group flex h-10 w-10 shrink-0 snap-center flex-col items-center justify-center rounded-md text-[10px] font-medium text-[#536150] transition hover:bg-[#eef4ec] aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:text-[#b8c7b4] dark:hover:bg-[#202a1d] dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]"
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
              </button>
            );
          })}
        </div>
      </div>
      {showCalendar ? (
        <button
          type="button"
          data-calendar-trigger
          aria-label="Open calendar"
          onMouseDown={(event) => {
            event.stopPropagation();
            handleMouseDownAction(event, onOpenCalendar!);
          }}
          onClick={(event) => event.preventDefault()}
          className={
            isVertical
              ? "inline-flex h-8 w-full shrink-0 items-center justify-center border-t border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
              : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#dce5d8] text-[#2f6b43] hover:bg-[#eef4ec] dark:border-[#2c3628] dark:text-[#9bd38f] dark:hover:bg-[#202a1d]"
          }
        >
          <Calendar size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
