// Чистая логика привычек: без DOM и без new Date(). «Сегодня» передаётся параметром.

import { addDays } from './dates.js';

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

/**
 * Серия: подряд отмеченные дни, заканчивающиеся сегодня
 * (если сегодня не отмечено — заканчивающиеся вчера).
 */
export function getStreak(habit, todayKey) {
  const done = new Set(habit.done);
  let day = done.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (done.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function getTodaySummary(state, todayKey) {
  const total = state.habits.length;
  const done = state.habits.filter((h) => isDone(h, todayKey)).length;
  return { done, total };
}
