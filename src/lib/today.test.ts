import { describe, expect, it } from "vitest";

import { daysFromToday, dueChip, todayInWarsaw, tomorrowInWarsaw, type DueTone } from "@/lib/today";

describe("todayInWarsaw", () => {
  // Warsaw is UTC+2 (CEST) until 2026-10-25, so local midnight is 22:00Z the previous day.
  it.each([
    { instant: "2026-10-14T21:59:59Z", expected: "2026-10-14" },
    { instant: "2026-10-14T22:00:00Z", expected: "2026-10-15" },
    // Autumn change: 2026-10-25 ends CEST at 01:00Z, so the day lasts 25 h (22:00Z -> 23:00Z the next day).
    { instant: "2026-10-24T22:00:00Z", expected: "2026-10-25" },
    { instant: "2026-10-25T22:59:59Z", expected: "2026-10-25" },
    { instant: "2026-10-25T23:00:00Z", expected: "2026-10-26" },
    // Spring change: 2026-03-29 starts CEST at 01:00Z, so the day lasts 23 h (23:00Z -> 22:00Z).
    { instant: "2026-03-28T22:59:59Z", expected: "2026-03-28" },
    { instant: "2026-03-28T23:00:00Z", expected: "2026-03-29" },
    { instant: "2026-03-29T21:59:59Z", expected: "2026-03-29" },
    { instant: "2026-03-29T22:00:00Z", expected: "2026-03-30" },
    // Winter time (UTC+1) at the year boundary.
    { instant: "2026-12-31T22:59:59Z", expected: "2026-12-31" },
    { instant: "2026-12-31T23:00:00Z", expected: "2027-01-01" },
  ])("returns $expected for the instant $instant", ({ instant, expected }) => {
    expect(todayInWarsaw(new Date(instant))).toBe(expected);
  });
});

describe("tomorrowInWarsaw", () => {
  it.each([
    { instant: "2026-10-24T22:00:00Z", expected: "2026-10-26" }, // Warsaw day is 25 Oct (DST change day)
    { instant: "2026-12-31T23:00:00Z", expected: "2027-01-02" }, // Warsaw day is 1 Jan, year end carries over
    { instant: "2028-02-28T12:00:00Z", expected: "2028-02-29" }, // leap day
    { instant: "2026-10-31T12:00:00Z", expected: "2026-11-01" }, // month end
  ])("returns $expected for the instant $instant", ({ instant, expected }) => {
    expect(tomorrowInWarsaw(new Date(instant))).toBe(expected);
  });
});

describe("daysFromToday", () => {
  it.each([
    { isoDate: "2026-10-16", today: "2026-10-15", expected: 1 },
    { isoDate: "2026-10-14", today: "2026-10-15", expected: -1 },
    { isoDate: "2026-10-26", today: "2026-10-25", expected: 1 }, // DST-change day still counts as one calendar day
    { isoDate: "2026-11-01", today: "2026-10-31", expected: 1 },
  ])("returns $expected for $isoDate relative to $today", ({ isoDate, today, expected }) => {
    expect(daysFromToday(isoDate, today)).toBe(expected);
  });
});

describe("dueChip", () => {
  const today = "2026-10-15";

  // The 7-day "soon" threshold is the current implementation decision, not a PRD requirement
  // (the PRD only requires signalling ahead of time).
  it.each<{ due: string | null; tone: DueTone; label: string }>([
    { due: null, tone: "none", label: "bez terminu" },
    { due: "2026-10-13", tone: "overdue", label: "2 dni po terminie" },
    { due: "2026-10-14", tone: "overdue", label: "wczoraj" },
    { due: "2026-10-15", tone: "today", label: "dziś" },
    { due: "2026-10-16", tone: "tomorrow", label: "jutro" },
    { due: "2026-10-17", tone: "soon", label: "za 2 dni" },
    { due: "2026-10-22", tone: "soon", label: "za 7 dni" },
  ])("returns tone $tone and label $label for due $due", ({ due, tone, label }) => {
    expect(dueChip(due, today)).toEqual({ tone, label });
  });

  it("switches to a plain date tone 8 days ahead", () => {
    expect(dueChip("2026-10-23", today).tone).toBe("date");
  });
});
