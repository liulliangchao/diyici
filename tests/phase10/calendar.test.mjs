import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarMonthDates, calendarMonthTitle, shiftCalendarMonth } from '../../src/shared/calendar.ts';

test('month calendar includes every day and aligns leap-year February to weekdays', () => {
  const days = calendarMonthDates('2024-02-12');
  assert.equal(days.length, 35);
  assert.deepEqual(days.slice(0, 4), [null, null, null, null]);
  assert.equal(days[4], '2024-02-01');
  assert.equal(days[32], '2024-02-29');
  assert.equal(days[33], null);
  assert.equal(calendarMonthTitle('2024-02-12'), '2024年2月');
});

test('month navigation clamps long dates and crosses year boundaries correctly', () => {
  assert.equal(shiftCalendarMonth('2024-03-31', -1), '2024-02-29');
  assert.equal(shiftCalendarMonth('2024-02-29', 1), '2024-03-29');
  assert.equal(shiftCalendarMonth('2026-01-31', -1), '2025-12-31');
});
