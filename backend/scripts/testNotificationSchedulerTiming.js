#!/usr/bin/env node
const assert = require('assert');
const { __testing } = require('../src/services/notificationScheduler');

const { findNextProgressReminderRunAtForSettings } = __testing;

function iso(date) {
  return date ? date.toISOString() : null;
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

const baseSettings = {
  dailyProgressReminder: true,
  dailyProgressReminderTime: '10:00',
  dailyProgressReminderDays: [1, 2, 3, 4, 5, 6, 0],
  pushNotifications: true,
  emailNotifications: false,
};

run('schedules exact 10:00 Taipei reminder before due time', () => {
  const next = findNextProgressReminderRunAtForSettings(
    baseSettings,
    new Date('2026-05-12T01:59:30.000Z'),
  );
  assert.strictEqual(iso(next), '2026-05-12T02:00:00.000Z');
});

run('moves to next selected day after due time has passed', () => {
  const next = findNextProgressReminderRunAtForSettings(
    baseSettings,
    new Date('2026-05-12T02:00:30.000Z'),
  );
  assert.strictEqual(iso(next), '2026-05-13T02:00:00.000Z');
});

run('respects selected weekdays', () => {
  const next = findNextProgressReminderRunAtForSettings(
    { ...baseSettings, dailyProgressReminderDays: [1] },
    new Date('2026-05-12T02:01:00.000Z'),
  );
  assert.strictEqual(iso(next), '2026-05-18T02:00:00.000Z');
});

run('returns null when daily reminder is disabled', () => {
  const next = findNextProgressReminderRunAtForSettings(
    { ...baseSettings, dailyProgressReminder: false },
    new Date('2026-05-12T01:59:30.000Z'),
  );
  assert.strictEqual(next, null);
});

run('returns null when all notification channels are disabled', () => {
  const next = findNextProgressReminderRunAtForSettings(
    { ...baseSettings, pushNotifications: false, emailNotifications: false },
    new Date('2026-05-12T01:59:30.000Z'),
  );
  assert.strictEqual(next, null);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('Notification scheduler timing tests passed.');
