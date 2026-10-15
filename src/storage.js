// Сохранение состояния в localStorage под ключом проекта.
// storage передаётся параметром (в браузере — window.localStorage, в тестах — заглушка).

import { isDateKey } from './dates.js';
import { createEmptyState, normalizeName, normalizeEmoji, MAX_NAME_LENGTH } from './habits.js';
import { normalizeReminder } from './reminders.js';
import { normalizeDays } from './schedule.js';
import { PALETTE, normalizeColor } from './colors.js';

export const STORAGE_KEY = 'habit-tracker:v1';

// index — позиция привычки в загруженном списке (для цвета по порядку).
function sanitizeHabit(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  const name = normalizeName(raw.name);
  if (name === null) return null;
  if (!isDateKey(raw.createdAt)) return null;
  const done = Array.isArray(raw.done)
    ? [...new Set(raw.done.filter(isDateKey))].sort()
    : [];
  return {
    id: raw.id,
    name: name.slice(0, MAX_NAME_LENGTH).trim(),
    emoji: normalizeEmoji(raw.emoji),
    createdAt: raw.createdAt,
    done,
    // Данные первой версии без поля reminder и битые напоминания → null; привычка сохраняется.
    reminder: normalizeReminder(raw.reminder),
    // Старые данные без расписания и битые days → все 7 дней («каждый день»).
    days: normalizeDays(raw.days),
    // Старые данные без цвета и битый цвет → цвет палитры по позиции в списке.
    color: normalizeColor(raw.color) ?? PALETTE[index % PALETTE.length],
  };
}

/** Читает состояние; при отсутствии/битых данных возвращает пустое состояние. */
export function loadState(storage) {
  let text;
  try {
    text = storage?.getItem(STORAGE_KEY);
  } catch {
    return createEmptyState();
  }
  if (typeof text !== 'string') return createEmptyState();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return createEmptyState();
  }
  if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.habits)) {
    return createEmptyState();
  }

  const state = createEmptyState();
  const seen = new Set();
  for (const raw of data.habits) {
    const habit = sanitizeHabit(raw, state.habits.length);
    if (habit && !seen.has(habit.id)) {
      seen.add(habit.id);
      state.habits.push(habit);
    }
  }
  return state;
}

/** Пишет только свой ключ. Возвращает true при успехе; ошибки записи не пробрасываются. */
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
