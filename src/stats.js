// Статистика выполнения привычек за период с учётом расписания (AC-28…AC-30).
// Чистая логика: без DOM и без текущего времени — «сегодня» передаётся параметром.

import { addDays, isDateKey } from './dates.js';
import { normalizeDays, weekdayOf } from './schedule.js';
import { getStreak, getBestStreak } from './habits.js';

export const PERIODS = [7, 30, 'all'];
export const DEFAULT_PERIOD = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// Число календарных дней от a до b включительно (a <= b). Через UTC-полночь
// календарных чисел, чтобы переход на летнее/зимнее время не влиял на счёт.
function daysInclusive(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS) + 1;
}

/** Процент 0…100 (целое), при отсутствии дней по расписанию — null. */
function toPercent(done, scheduled) {
  return scheduled > 0 ? Math.round((done * 100) / scheduled) : null;
}

/** Первый день окна периода или null для «Всё время». Неизвестный период → 30 дней. */
function windowStart(todayKey, period) {
  if (period === 'all') return null;
  const n = period === 7 ? 7 : DEFAULT_PERIOD;
  return addDays(todayKey, -(n - 1));
}

// Счёт по одной привычке: дни по расписанию и отмеченные из них — по дням недели
// (индексы 1..7), а также все отметки в окне.
function habitCounts(habit, todayKey, from) {
  const scheduledByDay = new Array(8).fill(0);
  const doneByDay = new Array(8).fill(0);
  const days = new Set(normalizeDays(habit.days));
  const marks = [...new Set(habit.done)].filter((k) => isDateKey(k) && k <= todayKey);

  // Начало истории — дата создания или первая отметка, что раньше.
  let history = isDateKey(habit.createdAt) ? habit.createdAt : null;
  for (const mark of marks) {
    if (history === null || mark < history) history = mark;
  }
  if (history === null) return { scheduledByDay, doneByDay, totalMarks: 0 };
  const start = from !== null && from > history ? from : history;

  // Дни с начала по вчера: число дней каждого дня недели считается арифметически,
  // без перебора дней (окно «Всё время» может быть длинным).
  const yesterday = addDays(todayKey, -1);
  if (start <= yesterday) {
    const total = daysInclusive(start, yesterday);
    const first = weekdayOf(start);
    for (let i = 0; i < 7; i += 1) {
      const weekday = ((first - 1 + i) % 7) + 1;
      const count = Math.floor(total / 7) + (i < total % 7 ? 1 : 0);
      if (days.has(weekday)) scheduledByDay[weekday] += count;
    }
  }

  let totalMarks = 0;
  for (const mark of marks) {
    if (mark < start) continue;
    totalMarks += 1;
    const weekday = weekdayOf(mark);
    if (!days.has(weekday)) continue;
    doneByDay[weekday] += 1;
    // Сегодня учитывается, только если отмечено.
    if (mark === todayKey) scheduledByDay[weekday] += 1;
  }
  return { scheduledByDay, doneByDay, totalMarks };
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

/**
 * Статистика за период (7 | 30 | 'all') на дату todayKey.
 * → { percent, done, scheduled, totalMarks, bestWeekday, rows }
 *   percent — целый процент 0…100 или null, если дней по расписанию нет;
 *   bestWeekday — ISO-день (1 = пн … 7 = вс) с наибольшей долей выполнения
 *   (ничья → более ранний день); нет дней по расписанию или ни одной
 *   отметки в них → null;
 *   rows — { habitId, emoji, name, done, scheduled, percent, streak, best },
 *   по убыванию процента (null в конце), при равенстве — исходный порядок.
 */
export function computeStats(state, todayKey, period = DEFAULT_PERIOD) {
  const from = windowStart(todayKey, period);
  const scheduledByDay = new Array(8).fill(0);
  const doneByDay = new Array(8).fill(0);
  let totalMarks = 0;

  const rows = state.habits.map((habit, index) => {
    const counts = habitCounts(habit, todayKey, from);
    for (let d = 1; d <= 7; d += 1) {
      scheduledByDay[d] += counts.scheduledByDay[d];
      doneByDay[d] += counts.doneByDay[d];
    }
    totalMarks += counts.totalMarks;
    const done = sum(counts.doneByDay);
    const scheduled = sum(counts.scheduledByDay);
    return {
      index,
      row: {
        habitId: habit.id,
        emoji: habit.emoji,
        name: habit.name,
        done,
        scheduled,
        percent: toPercent(done, scheduled),
        streak: getStreak(habit, todayKey),
        best: getBestStreak(habit),
      },
    };
  });

  rows.sort((a, b) => {
    const pa = a.row.percent;
    const pb = b.row.percent;
    if (pa !== pb) {
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pb - pa;
    }
    return a.index - b.index;
  });

  // Нет ни одной отметки в дни по расписанию — лучшего дня нет (AC-30, «—»).
  let bestWeekday = null;
  const hasDone = sum(doneByDay) > 0;
  for (let d = 1; hasDone && d <= 7; d += 1) {
    if (scheduledByDay[d] === 0) continue;
    // Строго больше — при ничьей остаётся более ранний день.
    if (
      bestWeekday === null
      || doneByDay[d] * scheduledByDay[bestWeekday] > doneByDay[bestWeekday] * scheduledByDay[d]
    ) {
      bestWeekday = d;
    }
  }

  const done = sum(doneByDay);
  const scheduled = sum(scheduledByDay);
  return {
    percent: toPercent(done, scheduled),
    done,
    scheduled,
    totalMarks,
    bestWeekday,
    rows: rows.map((r) => r.row),
  };
}
