import { describe, expect, it } from "vitest";

import { todayInWarsaw } from "@/lib/today";

describe("todayInWarsaw", () => {
  // Warsaw is UTC+2 (CEST) until 2026-10-25, so local midnight is 22:00Z the previous day.
  it.each([
    { instant: "2026-10-14T21:59:59Z", expected: "2026-10-14" },
    { instant: "2026-10-14T22:00:00Z", expected: "2026-10-15" },
  ])("returns $expected for the instant $instant", ({ instant, expected }) => {
    expect(todayInWarsaw(new Date(instant))).toBe(expected);
  });
});
