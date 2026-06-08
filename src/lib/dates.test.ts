import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { buildDateRange, localDayBounds, noteCountsByDate, toDateKey } from "./dates";

describe("toDateKey", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toDateKey(dayjs("2026-06-09T15:30:00"))).toBe("2026-06-09");
  });
});

describe("localDayBounds", () => {
  it("returns local start and next-day end as ISO strings", () => {
    const { startIso, endIso } = localDayBounds("2026-06-09");
    expect(dayjs(startIso).format("YYYY-MM-DD")).toBe("2026-06-09");
    expect(dayjs(endIso).diff(dayjs(startIso), "hour")).toBe(24);
  });
});

describe("buildDateRange", () => {
  it("builds a symmetric window around the center date", () => {
    expect(buildDateRange("2026-06-09", 1, 1)).toEqual(["2026-06-08", "2026-06-09", "2026-06-10"]);
  });
});

describe("noteCountsByDate", () => {
  it("aggregates note counts by local created_at day", () => {
    const firstDay = dayjs("2026-06-08T10:00:00").toISOString();
    const sameDay = dayjs("2026-06-08T22:00:00").toISOString();
    const nextDay = dayjs("2026-06-09T01:00:00").toISOString();
    const counts = noteCountsByDate([
      { created_at: firstDay },
      { created_at: sameDay },
      { created_at: nextDay }
    ]);

    expect(counts["2026-06-08"]).toBe(2);
    expect(counts["2026-06-09"]).toBe(1);
  });
});
