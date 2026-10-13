// Расписание привычки по дням недели (ISO: 1 = пн … 7 = вс).
// Чистая логика: без DOM и без текущего времени; даты — локальные 'YYYY-MM-DD'.

import { fromDateKey } from './dates.js';

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const WEEKDAY_FULL = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
];

/** ISO-день недели локальной даты 'YYYY-MM-DD': 1 = пн … 7 = вс. */
export function weekdayOf(key) {
  const day = fromDateKey(key).getDay();
  return day === 0 ? 7 : day;
}

/**
 * Приводит сырое значение к отсортированному массиву дней 1..7 без повторов.
 * Отсутствует, битое или пустое → все 7 дней («каждый день»).
 */
export function normalizeDays(raw) {
  if (!Array.isArray(raw)) return [...ALL_DAYS];
  const days = ALL_DAYS.filter((d) => raw.includes(d));
  return days.length === 0 ? [...ALL_DAYS] : days;
}

/** Назначена ли привычка на день key по своему расписанию. */
export function isScheduled(habit, key) {
  return normalizeDays(habit?.days).includes(weekdayOf(key));
}

/** Подпись расписания: '' для «каждый день», иначе «пн, ср, пт». */
export function describeDays(days) {
  const list = normalizeDays(days);
  if (list.length === ALL_DAYS.length) return '';
  return list.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
}
