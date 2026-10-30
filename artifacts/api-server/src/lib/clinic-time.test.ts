import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clinicDate,
  clinicDateTime,
  dateOnlyToClinicNoon,
  lastDaysWindow,
} from "./clinic-time";

describe("clinic-time", () => {
  it("reads instants on the Bogotá clock, not UTC", () => {
    const eveningInBogota = new Date("2026-10-31T01:30:00.000Z");
    assert.equal(clinicDate(eveningInBogota), "2026-10-30");
    assert.equal(clinicDateTime(eveningInBogota), "2026-10-30 20:30");
  });

  it("covers the last N calendar days with today included", () => {
    const now = new Date("2026-10-30T15:00:00.000Z");
    const { from, to } = lastDaysWindow(30, now);
    assert.equal(from.toISOString(), "2026-10-01T05:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-31T05:00:00.000Z");
  });

  it("makes a one-day window equal to today on the clinic clock", () => {
    const { from, to } = lastDaysWindow(1, new Date("2026-10-31T01:30:00.000Z"));
    assert.equal(from.toISOString(), "2026-10-30T05:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-31T05:00:00.000Z");
  });

  it("reads a date-only value as midday on the clinic clock", () => {
    assert.equal(dateOnlyToClinicNoon("2026-10-30"), "2026-10-30T12:00:00-05:00");
    assert.equal(dateOnlyToClinicNoon("2026-10-30T08:00:00Z"), "2026-10-30T08:00:00Z");
    assert.equal(dateOnlyToClinicNoon(undefined), undefined);
  });
});
