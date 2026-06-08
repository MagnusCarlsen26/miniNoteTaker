import dayjs, { type Dayjs } from "dayjs";
import type { Note } from "../types/note";

export function toDateKey(date: Dayjs): string {
  return date.format("YYYY-MM-DD");
}

export function todayDateKey(): string {
  return toDateKey(dayjs());
}

export function localDayBounds(dateKey: string): { startIso: string; endIso: string } {
  const start = dayjs(dateKey).startOf("day");
  const end = start.add(1, "day");
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function buildDateRange(centerDate: string, pastDays: number, futureDays: number): string[] {
  const center = dayjs(centerDate);
  const dates: string[] = [];
  for (let offset = -pastDays; offset <= futureDays; offset += 1) {
    dates.push(toDateKey(center.add(offset, "day")));
  }
  return dates;
}

export function noteCountsByDate(notes: Pick<Note, "created_at">[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const note of notes) {
    const key = toDateKey(dayjs(note.created_at));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function formatSelectedDateHeader(dateKey: string): string {
  return dayjs(dateKey).format("ddd, MMM D");
}

export const CALENDAR_WEEK_ROWS = 6;

export function buildMonthWeeks(month: Dayjs, weekRows = CALENDAR_WEEK_ROWS): string[][] {
  const start = month.startOf("month").startOf("week");
  const end = month.endOf("month").endOf("week");
  const days: string[] = [];
  let cursor = start;
  while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
    days.push(toDateKey(cursor));
    cursor = cursor.add(1, "day");
  }

  const rows: string[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    rows.push(days.slice(index, index + 7));
  }

  let lastDay = dayjs(rows[rows.length - 1]?.[6] ?? start);
  while (rows.length < weekRows) {
    const week: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      lastDay = lastDay.add(1, "day");
      week.push(toDateKey(lastDay));
    }
    rows.push(week);
  }

  return rows;
}
