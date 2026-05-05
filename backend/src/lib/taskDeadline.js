const DEFAULT_TASK_DUE_END_TIME = '23:59';

function toDateOrNull(value) {
  return value ? new Date(value) : null;
}

function resolveDueEndTime(dueDate, dueEndTime) {
  if (!dueDate) return null;
  return dueEndTime || DEFAULT_TASK_DUE_END_TIME;
}

function dateParts(value) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function timeParts(value) {
  const raw = value || DEFAULT_TASK_DUE_END_TIME;
  const match = String(raw).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: 23, minute: 59 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function getTaskDeadlineAt(taskOrDueDate, dueEndTime) {
  const dueDate = taskOrDueDate && typeof taskOrDueDate === 'object' && 'dueDate' in taskOrDueDate
    ? taskOrDueDate.dueDate
    : taskOrDueDate;
  const endTime = taskOrDueDate && typeof taskOrDueDate === 'object' && 'dueEndTime' in taskOrDueDate
    ? taskOrDueDate.dueEndTime
    : dueEndTime;

  const date = dateParts(dueDate);
  if (!date) return null;
  const time = timeParts(endTime);
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 59, 999);
}

module.exports = {
  DEFAULT_TASK_DUE_END_TIME,
  toDateOrNull,
  resolveDueEndTime,
  getTaskDeadlineAt,
};
