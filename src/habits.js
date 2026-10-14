// Чистая логика привычек: без DOM и без new Date(). «Сегодня» передаётся параметром.

import { addDays } from './dates.js';
import { ALL_DAYS, normalizeDays, isScheduled, weekdayOf } from './schedule.js';
import { normalizeColor, nextFreeColor } from './colors.js';

export const EMOJIS = ['💧', '📚', '🏃', '🧘', '🥗', '😴', '✍️', '💊', '🎸', '🧹', '🌱', '⭐'];
export const DEFAULT_EMOJI = '⭐';
export const MAX_NAME_LENGTH = 40;

export function createEmptyState() {
  return { version: 1, habits: [] };
}

/** Обрезает пробелы по краям; пустое/непустое-строковое значение → null. */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name === '' ? null : name;
}

/** Нормализует эмодзи: неизвестный → DEFAULT_EMOJI. */
export function normalizeEmoji(emoji) {
  return EMOJIS.includes(emoji) ? emoji : DEFAULT_EMOJI;
}

/**
 * Добавляет привычку. Невалидное имя → возвращается исходное состояние.
 * Имя обрезается до MAX_NAME_LENGTH символов.
 */
export function addHabit(state, { name, emoji } = {}, { id, todayKey } = {}) {
  const normalized = normalizeName(name);
  if (normalized === null) return state;
  const finalName = normalized.slice(0, MAX_NAME_LENGTH).trim();
  const habit = {
    id,
    name: finalName,
    emoji: normalizeEmoji(emoji),
    createdAt: todayKey,
    done: [],
    reminder: null,
    days: [...ALL_DAYS],
    // Первый свободный цвет палитры (все заняты — по кругу).
    color: nextFreeColor(state.habits),
  };
  return { ...state, habits: [...state.habits, habit] };
}

/** Переключает отметку дня. Будущая дата или неизвестный id → без изменений. */
export function toggleDay(state, id, dateKey, todayKey) {
  if (dateKey > todayKey) return state;
  if (!state.habits.some((h) => h.id === id)) return state;
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== id) return h;
      const done = h.done.includes(dateKey)
        ? h.done.filter((k) => k !== dateKey)
        : [...h.done, dateKey].sort();
      return { ...h, done };
    }),
  };
}

export function removeHabit(state, id) {
  return { ...state, habits: state.habits.filter((h) => h.id !== id) };
}

export function isDone(habit, key) {
  return habit.done.includes(key);
}

// Есть ли среди дней строго между from и to (from < to) день по расписанию.
// Цикл не длиннее 7 шагов: любые 7 дней подряд содержат каждый день недели,
// а в расписании хотя бы один день.
function gapHasScheduledDay(from, to, scheduled) {
  for (let day = addDays(from, 1); day < to; day = addDays(day, 1)) {
    if (scheduled.has(weekdayOf(day))) return true;
  }
  return false;
}

/**
 * Серия по расписанию (AC-4, AC-24): идём назад от сегодня. Отмеченный день — +1;
 * день по расписанию без отметки прерывает серию; выходной без отметки пропускается;
 * сегодня без отметки серию не прерывает. Для «каждый день» — подряд отмеченные дни,
 * заканчивающиеся сегодня (если сегодня не отмечено — вчера).
 */
export function getStreak(habit, todayKey) {
  const scheduled = new Set(normalizeDays(habit.days));
  const marks = [...new Set(habit.done)].filter((k) => k <= todayKey).sort().reverse();
  let streak = 0;
  let prev = todayKey;
  for (const mark of marks) {
    if (mark === todayKey) {
      streak += 1;
      continue;
    }
    if (gapHasScheduledDay(mark, prev, scheduled)) break;
    streak += 1;
    prev = mark;
  }
  return streak;
}

/**
 * Сводка дня (AC-26): total — привычки, назначенные на сегодня, плюс отмеченные
 * сегодня в свой выходной; done — отмеченные сегодня.
 */
export function getTodaySummary(state, todayKey) {
  const total = state.habits.filter((h) => isDone(h, todayKey) || isScheduled(h, todayKey)).length;
  const done = state.habits.filter((h) => isDone(h, todayKey)).length;
  return { done, total };
}

function sameDays(a, b) {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/**
 * Изменяет название, эмодзи и (если переданы) расписание и цвет привычки по правилам addHabit.
 * days нормализуется через normalizeDays (пустой/битый набор → все 7 дней);
 * color — через normalizeColor (ключ не из палитры → цвет не меняется).
 * id, done, createdAt и reminder не трогаются. Невалидное имя, неизвестный id
 * или неизменённые значения → возвращается исходное состояние.
 */
export function updateHabit(state, id, { name, emoji, days, color } = {}) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return state;
  const normalized = normalizeName(name);
  if (normalized === null) return state;
  const finalName = normalized.slice(0, MAX_NAME_LENGTH).trim();
  const finalEmoji = normalizeEmoji(emoji);
  const finalDays = days === undefined ? null : normalizeDays(days);
  const daysChanged = finalDays !== null && !sameDays(finalDays, normalizeDays(habit.days));
  const finalColor = color === undefined ? null : normalizeColor(color);
  const colorChanged = finalColor !== null && finalColor !== habit.color;
  if (finalName === habit.name && finalEmoji === habit.emoji && !daysChanged && !colorChanged) return state;
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== id) return h;
      const next = { ...h, name: finalName, emoji: finalEmoji };
      if (finalDays !== null) next.days = finalDays;
      if (finalColor !== null) next.color = finalColor;
      return next;
    }),
  };
}

/**
 * Рекорд: самая длинная серия за всё время по тем же правилам, что и getStreak
 * (выходной без отметки серию не рвёт). Для «каждый день» — самая длинная цепочка
 * подряд отмеченных дней. Пусто → 0.
 */
export function getBestStreak(habit) {
  const scheduled = new Set(normalizeDays(habit.days));
  const marks = [...new Set(habit.done)].sort();
  let best = 0;
  let current = 0;
  let prev = null;
  for (const mark of marks) {
    current = prev !== null && !gapHasScheduledDay(prev, mark, scheduled) ? current + 1 : 1;
    if (current > best) best = current;
    prev = mark;
  }
  return best;
}
