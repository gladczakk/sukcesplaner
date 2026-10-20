// Dependency-free unit test for the weekday label helper (node:test; types are stripped on the fly).
// Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatWeekdayFrom } from "../src/lib/weekdays.ts";

test("formatWeekdayFrom names the weekday of an ISO date in the genitive", () => {
  assert.equal(formatWeekdayFrom("2026-10-19"), "z poniedziałku");
  assert.equal(formatWeekdayFrom("2026-10-20"), "z wtorku");
  assert.equal(formatWeekdayFrom("2026-10-21"), "ze środy");
  assert.equal(formatWeekdayFrom("2026-10-22"), "z czwartku");
  assert.equal(formatWeekdayFrom("2026-10-23"), "z piątku");
  assert.equal(formatWeekdayFrom("2026-10-24"), "z soboty");
  assert.equal(formatWeekdayFrom("2026-10-25"), "z niedzieli");
});

test("formatWeekdayFrom is stable across month and year boundaries", () => {
  assert.equal(formatWeekdayFrom("2026-10-31"), "z soboty");
  assert.equal(formatWeekdayFrom("2026-11-01"), "z niedzieli");
  assert.equal(formatWeekdayFrom("2026-12-31"), "z czwartku");
  assert.equal(formatWeekdayFrom("2027-01-01"), "z piątku");
});

test("formatWeekdayFrom returns an empty string for input that is not a date", () => {
  assert.equal(formatWeekdayFrom(""), "");
  assert.equal(formatWeekdayFrom("not-a-date"), "");
});
