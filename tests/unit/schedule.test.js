import { describe, it, expect } from 'vitest';
import {
  ALL_DAYS,
  WEEKDAY_SHORT,
  WEEKDAY_FULL,
  weekdayOf,
  normalizeDays,
  isScheduled,
  describeDays,
} from '../../src/schedule.js';

// Итерация 004: расписание по дням недели (ISO: 1 = пн … 7 = вс).
// 2026-10-13 — вторник.

describe('константы', () => {
  it('все 7 дней и подписи на русском', () => {
    expect(ALL_DAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(WEEKDAY_SHORT).toEqual(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']);
    expect(WEEKDAY_FULL).toEqual([
      'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
    ]);
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-10-12', 1],
    ['2026-10-13', 2],
    ['2026-10-14', 3],
    ['2026-10-16', 5],
    ['2026-10-17', 6],
    ['2026-10-18', 7],
  ])('%s → %i', (key, day) => {
    expect(weekdayOf(key)).toBe(day);
  });

  it('воскресенье — 7, а не 0', () => {
    expect(weekdayOf('2026-11-01')).toBe(7);
  });

  it('29 февраля високосного года', () => {
    expect(weekdayOf('2028-02-29')).toBe(2);
    expect(weekdayOf('2024-02-29')).toBe(4);
  });

  it('смена месяца и года', () => {
    expect(weekdayOf('2026-10-31')).toBe(6);
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(weekdayOf('2026-12-31')).toBe(4);
    expect(weekdayOf('2027-01-01')).toBe(5);
  });
});

describe('normalizeDays', () => {
  it.each([
    ['нет поля', undefined],
    ['null', null],
    ['строка', 'пн, ср'],
    ['число', 5],
    ['объект', { 1: true }],
    ['пустой массив', []],
    ['только недопустимые значения', [0, 8, -1, 2.5]],
  ])('%s → все 7 дней («каждый день»)', (_title, raw) => {
    expect(normalizeDays(raw)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('сортирует и убирает повторы', () => {
    expect(normalizeDays([5, 1, 3, 1, 5])).toEqual([1, 3, 5]);
  });

  it('корректный набор сохраняется', () => {
    expect(normalizeDays([1, 3, 5])).toEqual([1, 3, 5]);
    expect(normalizeDays([7])).toEqual([7]);
  });

  it('не изменяет входной массив и не отдаёт общий ALL_DAYS', () => {
    const raw = [5, 3, 1];
    normalizeDays(raw);
    expect(raw).toEqual([5, 3, 1]);
    const all = normalizeDays(undefined);
    all.pop();
    expect(ALL_DAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(normalizeDays(undefined)).toHaveLength(7);
  });
});

describe('isScheduled', () => {
  const mwf = { days: [1, 3, 5] };

  it('«пн, ср, пт»: понедельник, среда, пятница — да; вторник и выходные — нет', () => {
    expect(isScheduled(mwf, '2026-10-12')).toBe(true);
    expect(isScheduled(mwf, '2026-10-14')).toBe(true);
    expect(isScheduled(mwf, '2026-10-16')).toBe(true);
    expect(isScheduled(mwf, '2026-10-13')).toBe(false);
    expect(isScheduled(mwf, '2026-10-17')).toBe(false);
    expect(isScheduled(mwf, '2026-10-18')).toBe(false);
  });

  it('привычка без поля days (старые данные) назначена на каждый день', () => {
    const old = { id: 'h', name: 'Старая', done: [] };
    for (const key of ['2026-10-12', '2026-10-13', '2026-10-17', '2026-10-18']) {
      expect(isScheduled(old, key)).toBe(true);
    }
  });

  it('только воскресенье: через смену месяца', () => {
    const sunday = { days: [7] };
    expect(isScheduled(sunday, '2026-11-01')).toBe(true);
    expect(isScheduled(sunday, '2026-10-31')).toBe(false);
  });
});

describe('describeDays (подпись на карточке)', () => {
  it('«пн, ср, пт»', () => {
    expect(describeDays([1, 3, 5])).toBe('пн, ср, пт');
  });

  it('порядок по неделе, независимо от порядка входа', () => {
    expect(describeDays([5, 1, 3])).toBe('пн, ср, пт');
  });

  it('один день и выходные', () => {
    expect(describeDays([7])).toBe('вс');
    expect(describeDays([6, 7])).toBe('сб, вс');
  });

  it('все 7 дней («каждый день») — пустая подпись', () => {
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe('');
  });

  it('нет расписания (старые данные) — пустая подпись', () => {
    expect(describeDays(undefined)).toBe('');
  });
});
