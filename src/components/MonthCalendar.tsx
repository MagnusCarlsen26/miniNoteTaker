import dayjs, { type Dayjs } from "dayjs";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { buildMonthWeeks, todayDateKey } from "../lib/dates";

type MonthCalendarProps = {
  selectedDate: string;
  noteCounts: Record<string, number>;
  onSelectDate: (date: string) => void;
};

const MONTH_WINDOW = 24;

function handleMouseDownAction(event: MouseEvent<HTMLElement>, action: () => void) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  action();
}

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
    scrollToMonth(month, "smooth");
  };

  return (
    <div className="flex w-[224px] shrink-0 flex-col" aria-label="Calendar">
      <div
        ref={scrollRef}
        className="max-h-[232px] overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className="snap-start pb-2"
          >
            <div className="mb-1 text-center text-xs font-medium uppercase tracking-[0.12em] text-[#536150] dark:text-[#b8c7b4]">
              {month.format("MMMM YYYY")}
            </div>
            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-[#657064] dark:text-[#aeb9aa]">
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
    <button
      type="button"
      role="gridcell"
      aria-label={date.format("dddd, MMMM D")}
      aria-pressed={isSelected}
      onMouseDown={(event) => handleMouseDownAction(event, () => onSelectDate(dateKey))}
      onClick={(event) => event.preventDefault()}
      className={`group relative flex h-7 w-7 items-center justify-center rounded-md text-xs transition ${
        inMonth
          ? "text-[#253022] hover:bg-[#eef4ec] dark:text-[#e2eadf] dark:hover:bg-[#202a1d]"
          : "text-[#9aa89a] dark:text-[#5f6a5d]"
      } aria-pressed:bg-[#2f6b43] aria-pressed:text-white dark:aria-pressed:bg-[#2f6b43] dark:aria-pressed:text-[#ecf3ea]`}
      style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1px #2f6b43" } : undefined}
    >
      {date.format("D")}
      <span
        className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
          hasNotes && inMonth
            ? "bg-[#2f6b43] group-aria-pressed:bg-white dark:bg-[#8ed081]"
            : "bg-transparent"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
