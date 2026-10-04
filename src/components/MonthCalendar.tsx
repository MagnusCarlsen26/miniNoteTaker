import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "./ActionButton";
import { buildMonthWeeks, todayDateKey } from "../lib/dates";

type MonthCalendarProps = {
  selectedDate: string;
  noteCounts: Record<string, number>;
  onSelectDate: (date: string) => void;
};

const MONTH_WINDOW = 24;

function monthKey(month: Dayjs) {
  return month.format("YYYY-MM");
}

export function MonthCalendar({ selectedDate, noteCounts, onSelectDate }: MonthCalendarProps) {
  const today = todayDateKey();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const monthTileRefs = useRef(new Map<string, HTMLDivElement>());
  const syncingScroll = useRef(false);
  const [anchorMonth] = useState(() => dayjs(selectedDate).startOf("month"));
  const [visibleMonth, setVisibleMonth] = useState(() => dayjs(selectedDate).startOf("month"));

  const months = useMemo(
    () =>
      Array.from({ length: MONTH_WINDOW * 2 + 1 }, (_, index) =>
        anchorMonth.add(index - MONTH_WINDOW, "month")
      ),
    [anchorMonth]
  );

  const scrollToMonth = (month: Dayjs, behavior: ScrollBehavior = "auto") => {
    const tile = monthTileRefs.current.get(monthKey(month));
    if (!tile || !scrollRef.current) {
      return;
    }

    syncingScroll.current = true;
    tile.scrollIntoView({ block: "nearest", behavior });
    window.requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  useEffect(() => {
    scrollToMonth(dayjs(selectedDate).startOf("month"));
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (syncingScroll.current) {
        return;
      }

      const top = container.scrollTop;
      let closestMonth = visibleMonth;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const month of months) {
        const tile = monthTileRefs.current.get(monthKey(month));
        if (!tile) {
          continue;
        }

        const distance = Math.abs(tile.offsetTop - top);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestMonth = month;
        }
      }

      if (!closestMonth.isSame(visibleMonth, "month")) {
        setVisibleMonth(closestMonth);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [months, visibleMonth]);

  const handleSelectDate = (dateKey: string) => {
    onSelectDate(dateKey);
    const month = dayjs(dateKey).startOf("month");
    setVisibleMonth(month);
    scrollToMonth(month);
  };

  return (
    <div className="flex w-[224px] shrink-0 flex-col" aria-label="Calendar">
      <div
        ref={scrollRef}
        className="max-h-[232px] overflow-y-auto [-ms-overflow-style:none]  [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {months.map((month) => (
          <div
            key={monthKey(month)}
            ref={(node) => {
              if (node) {
                monthTileRefs.current.set(monthKey(month), node);
              } else {
                monthTileRefs.current.delete(monthKey(month));
              }
            }}
            className=" pb-2"
          >
            <div className="mb-1 text-center text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              {month.format("MMMM YYYY")}
            </div>
            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-[var(--text-secondary)]">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
                <div key={label} className="h-4 leading-4">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid gap-0.5">
              {buildMonthWeeks(month).map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-0.5">
                  {week.map((dateKey) => (
                    <MonthDayCell
                      key={dateKey}
                      dateKey={dateKey}
                      visibleMonth={month}
                      today={today}
                      selectedDate={selectedDate}
                      hasNotes={(noteCounts[dateKey] ?? 0) > 0}
                      onSelectDate={handleSelectDate}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MonthDayCellProps = {
  dateKey: string;
  visibleMonth: Dayjs;
  today: string;
  selectedDate: string;
  hasNotes: boolean;
  onSelectDate: (date: string) => void;
};

function MonthDayCell({
  dateKey,
  visibleMonth,
  today,
  selectedDate,
  hasNotes,
  onSelectDate
}: MonthDayCellProps) {
  const date = dayjs(dateKey);
  const inMonth = date.month() === visibleMonth.month() && date.year() === visibleMonth.year();
  const isToday = dateKey === today;
  const isSelected = dateKey === selectedDate;

  return (
    <ActionButton
      type="button"
      role="gridcell"
      aria-label={date.format("dddd, MMMM D")}
      aria-pressed={isSelected}
      onAction={() => onSelectDate(dateKey)}
      className={`calendar-date group relative flex h-7 w-7 items-center justify-center rounded-md text-xs transition ${
        inMonth
          ? "text-[var(--text)] hover:bg-[var(--hover)]"
          : "text-[var(--text-secondary)]"
      } aria-pressed:bg-[var(--active)] aria-pressed:text-[var(--on-active)]`}
      style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
    >
      {date.format("D")}
      <span
        className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
          hasNotes && inMonth
            ? "bg-[var(--accent)] group-aria-pressed:bg-[var(--on-active)]"
            : "bg-transparent"
        }`}
        aria-hidden="true"
      />
    </ActionButton>
  );
}
