// Чистая логика напоминаний: без DOM и без Date.now() / new Date() без аргументов.
// Текущее время передаётся параметром (миллисекунды epoch); местное время
// вычисляется через new Date(ms) и локальные геттеры (не UTC).

import { toDateKey, addDays, fromDateKey } from './dates.js';
import { isDone } from './habits.js';

export const INTERVALS = [30, 60, 120, 180];
export const MAX_TIMES = 5;
export const DEFAULT_START = '09:00';
export const DEFAULT_END = '21:00';
export const DEFAULT_GRACE_MS = 5 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
// Предохранитель от слишком длинных циклов при огромном окне проверки.
const MAX_STEPS = 10000;

/** Строка 'HH:MM' в 24-часовом формате. */
export function isTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Приводит сырое значение к валидному напоминанию или null.
 * interval: { mode, intervalMin ∈ INTERVALS, start < end ('HH:MM'), anchor — конечное число }
 * times:    { mode, times — 1..MAX_TIMES валидных 'HH:MM', без повторов, по возрастанию }
 */
export function normalizeReminder(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.mode === 'interval') {
    const intervalMin = raw.intervalMin;
    if (!INTERVALS.includes(intervalMin)) return null;
    if (!isTime(raw.start) || !isTime(raw.end)) return null;
    if (raw.start >= raw.end) return null;
    if (typeof raw.anchor !== 'number' || !Number.isFinite(raw.anchor)) return null;
    return { mode: 'interval', intervalMin, start: raw.start, end: raw.end, anchor: raw.anchor };
  }

  if (raw.mode === 'times') {
    if (!Array.isArray(raw.times)) return null;
    if (!raw.times.every(isTime)) return null;
    const times = [...new Set(raw.times)].sort();
    if (times.length < 1 || times.length > MAX_TIMES) return null;
    return { mode: 'times', times };
  }

  return null;
}

/**
 * Включает/меняет напоминание привычки. Для interval отсчёт (anchor) = nowMs.
 * Невалидный ввод или неизвестный id → исходное состояние без изменений.
 */
export function setReminder(state, id, input, nowMs) {
  if (!state.habits.some((h) => h.id === id)) return state;
  if (!input || typeof input !== 'object') return state;
  const candidate = input.mode === 'interval' ? { ...input, anchor: nowMs } : input;
  const reminder = normalizeReminder(candidate);
  if (reminder === null) return state;
  return {
    ...state,
    habits: state.habits.map((h) => (h.id === id ? { ...h, reminder } : h)),
  };
}

/** Выключает напоминание привычки. Неизвестный id или уже выключено → без изменений. */
export function clearReminder(state, id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit || habit.reminder == null) return state;
  return {
    ...state,
    habits: state.habits.map((h) => (h.id === id ? { ...h, reminder: null } : h)),
  };
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function describeInterval(min) {
  if (min % 60 === 0) {
    const h = min / 60;
    if (h === 1) return 'каждый час';
    return `каждые ${h} ${plural(h, 'час', 'часа', 'часов')}`;
  }
  return `каждые ${min} ${plural(min, 'минуту', 'минуты', 'минут')}`;
}

// '09:00' → '9:00' (часы без ведущего нуля).
function shortTime(value) {
  const [h, m] = value.split(':');
  return `${Number(h)}:${m}`;
}

/** Текст напоминания: «каждый час, 9:00–21:00» / «08:00, 20:00»; без напоминания — ''. */
export function describeReminder(reminder) {
  const r = normalizeReminder(reminder);
  if (!r) return '';
  if (r.mode === 'interval') {
    return `${describeInterval(r.intervalMin)}, ${shortTime(r.start)}–${shortTime(r.end)}`;
  }
  return r.times.join(', ');
}

function localMinutes(ms) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

// Последний момент interval-напоминания в (lower, upper] внутри активных часов, иначе null.
function latestIntervalMoment(r, lower, upper) {
  const step = r.intervalMin * MINUTE_MS;
  const startMin = timeToMinutes(r.start);
  const endMin = timeToMinutes(r.end);
  let k = Math.floor((upper - r.anchor) / step);
  for (let i = 0; k >= 1 && i < MAX_STEPS; i += 1, k -= 1) {
    const at = r.anchor + k * step;
    if (at <= lower) break;
    const m = localMinutes(at);
    if (m >= startMin && m < endMin) return at;
  }
  return null;
}

// Последний момент times-напоминания в (lower, upper] в день без отметки, иначе null.
function latestTimesMoment(habit, r, lower, upper) {
  const firstDay = toDateKey(new Date(lower));
  let day = toDateKey(new Date(upper));
  for (let i = 0; day >= firstDay && i < MAX_STEPS; i += 1, day = addDays(day, -1)) {
    if (isDone(habit, day)) continue;
    const base = fromDateKey(day);
    for (let j = r.times.length - 1; j >= 0; j -= 1) {
      const [h, m] = r.times[j].split(':').map(Number);
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).getTime();
      if (at > lower && at <= upper) return at;
    }
  }
  return null;
}

/**
 * Напоминания, сработавшие в интервале (fromMs, toMs] и не старше graceMs относительно toMs.
 * Не более одного на привычку (самый поздний момент). Результат: [{ habitId, at }].
 */
export function findDueReminders(state, fromMs, toMs, { graceMs = DEFAULT_GRACE_MS } = {}) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  const lower = Math.max(fromMs, toMs - graceMs - 1);
  const due = [];
  for (const habit of state.habits) {
    const r = normalizeReminder(habit.reminder);
    if (!r) continue;
    const at = r.mode === 'interval'
      ? latestIntervalMoment(r, lower, toMs)
      : latestTimesMoment(habit, r, lower, toMs);
    if (at !== null) due.push({ habitId: habit.id, at });
  }
  return due;
}
