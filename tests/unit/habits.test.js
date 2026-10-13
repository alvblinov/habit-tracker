import { describe, it, expect } from 'vitest';
import {
  EMOJIS,
  DEFAULT_EMOJI,
  MAX_NAME_LENGTH,
  createEmptyState,
  normalizeName,
  addHabit,
  toggleDay,
  removeHabit,
  isDone,
  getStreak,
  getTodaySummary,
  getBestStreak,
  updateHabit,
} from '../../src/habits.js';

const TODAY = '2026-10-13';

function habitWith(done, id = 'h1') {
  return { id, name: 'Тест', emoji: DEFAULT_EMOJI, createdAt: '2026-09-01', done };
}

function stateWith(...habits) {
  return { version: 1, habits };
}

describe('константы', () => {
  it('набор из 12 эмодзи из требований, по умолчанию ⭐, лимит 40', () => {
    expect(EMOJIS).toEqual(['💧', '📚', '🏃', '🧘', '🥗', '😴', '✍️', '💊', '🎸', '🧹', '🌱', '⭐']);
    expect(DEFAULT_EMOJI).toBe('⭐');
    expect(MAX_NAME_LENGTH).toBe(40);
  });
});

describe('addHabit (AC-1, AC-2)', () => {
  it('добавляет привычку с выбранным эмодзи и пустым списком отметок', () => {
    const state = addHabit(createEmptyState(), { name: 'Читать', emoji: '📚' }, { id: 'a', todayKey: TODAY });
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({ id: 'a', name: 'Читать', emoji: '📚', createdAt: TODAY });
    expect(state.habits[0].done).toEqual([]);
  });

  it('без выбора эмодзи ставит ⭐', () => {
    const state = addHabit(createEmptyState(), { name: 'Бег' }, { id: 'a', todayKey: TODAY });
    expect(state.habits[0].emoji).toBe('⭐');
  });

  it('эмодзи не из набора заменяется на ⭐', () => {
    const state = addHabit(createEmptyState(), { name: 'Бег', emoji: '🍕' }, { id: 'a', todayKey: TODAY });
    expect(state.habits[0].emoji).toBe('⭐');
  });

  it.each([[''], ['   '], ['\t \n']])('не добавляет пустое название или только пробелы: %j', (name) => {
    const initial = createEmptyState();
    const next = addHabit(initial, { name, emoji: '📚' }, { id: 'a', todayKey: TODAY });
    expect(next.habits).toHaveLength(0);
  });

  it('обрезает пробелы по краям названия', () => {
    const state = addHabit(createEmptyState(), { name: '  Пить воду  ' }, { id: 'a', todayKey: TODAY });
    expect(state.habits[0].name).toBe('Пить воду');
  });

  it('название длиннее 40 символов обрезается до 40', () => {
    const long = 'я'.repeat(45);
    const state = addHabit(createEmptyState(), { name: long }, { id: 'a', todayKey: TODAY });
    expect(state.habits[0].name).toBe('я'.repeat(40));
  });

  it('название ровно из 40 символов сохраняется целиком', () => {
    const exact = 'ж'.repeat(40);
    const state = addHabit(createEmptyState(), { name: exact }, { id: 'a', todayKey: TODAY });
    expect(state.habits[0].name).toBe(exact);
  });

  it('разрешает одинаковые названия', () => {
    let state = addHabit(createEmptyState(), { name: 'Йога' }, { id: 'a', todayKey: TODAY });
    state = addHabit(state, { name: 'Йога' }, { id: 'b', todayKey: TODAY });
    expect(state.habits.map((h) => h.name)).toEqual(['Йога', 'Йога']);
    expect(state.habits.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('не изменяет исходное состояние', () => {
    const initial = createEmptyState();
    addHabit(initial, { name: 'Читать' }, { id: 'a', todayKey: TODAY });
    expect(initial.habits).toHaveLength(0);
  });
});

describe('normalizeName', () => {
  it('обрезает пробелы и возвращает null для пустого', () => {
    expect(normalizeName('  a  ')).toBe('a');
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('')).toBeNull();
  });
});

describe('toggleDay (AC-3, AC-5)', () => {
  it('первое нажатие отмечает сегодня, повторное — снимает', () => {
    const s0 = stateWith(habitWith([]));
    const s1 = toggleDay(s0, 'h1', TODAY, TODAY);
    expect(isDone(s1.habits[0], TODAY)).toBe(true);
    const s2 = toggleDay(s1, 'h1', TODAY, TODAY);
    expect(isDone(s2.habits[0], TODAY)).toBe(false);
  });

  it('переключает прошедший день', () => {
    const s1 = toggleDay(stateWith(habitWith([])), 'h1', '2026-09-20', TODAY);
    expect(isDone(s1.habits[0], '2026-09-20')).toBe(true);
    const s2 = toggleDay(s1, 'h1', '2026-09-20', TODAY);
    expect(isDone(s2.habits[0], '2026-09-20')).toBe(false);
  });

  it('будущая дата игнорируется', () => {
    const s0 = stateWith(habitWith(['2026-10-12']));
    const s1 = toggleDay(s0, 'h1', '2026-10-14', TODAY);
    expect(s1.habits[0].done).toEqual(['2026-10-12']);
    expect(isDone(s1.habits[0], '2026-10-14')).toBe(false);
  });

  it('затрагивает только указанную привычку', () => {
    const s0 = stateWith(habitWith([], 'h1'), habitWith([], 'h2'));
    const s1 = toggleDay(s0, 'h2', TODAY, TODAY);
    expect(isDone(s1.habits[0], TODAY)).toBe(false);
    expect(isDone(s1.habits[1], TODAY)).toBe(true);
  });

  it('не изменяет исходное состояние', () => {
    const s0 = stateWith(habitWith([]));
    toggleDay(s0, 'h1', TODAY, TODAY);
    expect(s0.habits[0].done).toEqual([]);
  });

  it('повторное переключение не создаёт дублей отметки', () => {
    let s = stateWith(habitWith([]));
    s = toggleDay(s, 'h1', TODAY, TODAY);
    s = toggleDay(s, 'h1', TODAY, TODAY);
    s = toggleDay(s, 'h1', TODAY, TODAY);
    expect(s.habits[0].done.filter((d) => d === TODAY)).toHaveLength(1);
  });
});

describe('getStreak (AC-4)', () => {
  it('без отметок — 0', () => {
    expect(getStreak(habitWith([]), TODAY)).toBe(0);
  });

  it('отмечено только сегодня — 1', () => {
    expect(getStreak(habitWith([TODAY]), TODAY)).toBe(1);
  });

  it('отмечены сегодня, вчера и позавчера — 3', () => {
    expect(getStreak(habitWith(['2026-10-11', '2026-10-12', TODAY]), TODAY)).toBe(3);
  });

  it('пример из требований: вчера и позавчера, сегодня нет — 2', () => {
    expect(getStreak(habitWith(['2026-10-11', '2026-10-12']), TODAY)).toBe(2);
  });

  it('пропуск вчерашнего дня обнуляет серию, если сегодня не отмечено', () => {
    expect(getStreak(habitWith(['2026-10-10', '2026-10-11']), TODAY)).toBe(0);
  });

  it('пропуск дня в середине обрывает серию', () => {
    // сегодня и вчера отмечены, позавчера пропуск, раньше — отметки
    expect(getStreak(habitWith(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12', TODAY]), TODAY)).toBe(2);
  });

  it('сегодня отмечено, вчера пропуск — 1', () => {
    expect(getStreak(habitWith(['2026-10-10', '2026-10-11', TODAY]), TODAY)).toBe(1);
  });

  it('серия продолжается через границу месяца', () => {
    expect(getStreak(habitWith(['2026-02-27', '2026-02-28', '2026-03-01']), '2026-03-01')).toBe(3);
  });

  it('серия продолжается через границу года', () => {
    expect(getStreak(habitWith(['2025-12-30', '2025-12-31']), '2026-01-01')).toBe(2);
  });

  it('учитывает 29 февраля в високосном году', () => {
    expect(getStreak(habitWith(['2028-02-28', '2028-02-29']), '2028-03-01')).toBe(2);
  });

  it('не зависит от порядка дат в списке отметок', () => {
    expect(getStreak(habitWith([TODAY, '2026-10-11', '2026-10-12']), TODAY)).toBe(3);
  });
});

describe('removeHabit (AC-6)', () => {
  it('удаляет привычку вместе с отметками, остальные не трогает', () => {
    const s0 = stateWith(habitWith([TODAY], 'h1'), habitWith(['2026-10-12'], 'h2'));
    const s1 = removeHabit(s0, 'h1');
    expect(s1.habits.map((h) => h.id)).toEqual(['h2']);
    expect(s1.habits[0].done).toEqual(['2026-10-12']);
    expect(s0.habits).toHaveLength(2);
  });
});

describe('getTodaySummary (AC-7)', () => {
  it('пустой список — 0 из 0', () => {
    expect(getTodaySummary(createEmptyState(), TODAY)).toEqual({ done: 0, total: 0 });
  });

  it('считает только отметки за сегодня', () => {
    const state = stateWith(
      habitWith([TODAY], 'h1'),
      habitWith(['2026-10-12'], 'h2'),
      habitWith([], 'h3'),
    );
    expect(getTodaySummary(state, TODAY)).toEqual({ done: 1, total: 3 });
  });

  it('обновляется после отметки, добавления и удаления', () => {
    let s = addHabit(createEmptyState(), { name: 'A' }, { id: 'a', todayKey: TODAY });
    s = addHabit(s, { name: 'B' }, { id: 'b', todayKey: TODAY });
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 0, total: 2 });
    s = toggleDay(s, 'a', TODAY, TODAY);
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 1, total: 2 });
    s = addHabit(s, { name: 'C' }, { id: 'c', todayKey: TODAY });
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 1, total: 3 });
    s = removeHabit(s, 'a');
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 0, total: 2 });
  });
});

describe('getBestStreak (AC-17, AC-18)', () => {
  it('без отметок — 0', () => {
    expect(getBestStreak(habitWith([]))).toBe(0);
  });

  it('одна отметка — 1', () => {
    expect(getBestStreak(habitWith(['2026-10-01']))).toBe(1);
  });

  it('две цепочки 5 и 2 → 5, даже если длинная цепочка дальше 30 дней от сегодня', () => {
    const done = [
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-10-12', '2026-10-13',
    ];
    expect(getBestStreak(habitWith(done))).toBe(5);
  });

  it('последняя цепочка длиннее прежних — берётся она', () => {
    const done = ['2026-10-01', '2026-10-02', '2026-10-10', '2026-10-11', '2026-10-12'];
    expect(getBestStreak(habitWith(done))).toBe(3);
  });

  it('пропуск дня разрывает цепочку', () => {
    expect(getBestStreak(habitWith(['2026-10-01', '2026-10-03', '2026-10-05']))).toBe(1);
  });

  it('цепочка через границу месяца', () => {
    expect(getBestStreak(habitWith(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']))).toBe(4);
  });

  it('цепочка через Новый год', () => {
    expect(getBestStreak(habitWith(['2026-12-30', '2026-12-31', '2027-01-01']))).toBe(3);
  });

  it('учитывает 29 февраля в високосном году', () => {
    expect(getBestStreak(habitWith(['2028-02-28', '2028-02-29', '2028-03-01']))).toBe(3);
  });

  it('в невисокосном году 28.02 и 01.03 — соседние дни', () => {
    expect(getBestStreak(habitWith(['2027-02-28', '2027-03-01']))).toBe(2);
  });

  it('не зависит от порядка дат', () => {
    const done = ['2026-10-12', '2026-08-03', '2026-10-13', '2026-08-01', '2026-08-02'];
    expect(getBestStreak(habitWith(done))).toBe(3);
  });

  it('не изменяет список отметок привычки', () => {
    const done = ['2026-10-12', '2026-10-01', '2026-10-11'];
    const habit = habitWith(done);
    getBestStreak(habit);
    expect(habit.done).toEqual(['2026-10-12', '2026-10-01', '2026-10-11']);
  });

  it('снятие отметки в середине цепочки уменьшает рекорд', () => {
    let s = stateWith(habitWith(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']));
    expect(getBestStreak(s.habits[0])).toBe(5);
    s = toggleDay(s, 'h1', '2026-10-11', TODAY);
    expect(getBestStreak(s.habits[0])).toBe(2);
  });
});

describe('updateHabit (AC-19, AC-20, AC-21)', () => {
  const REMINDER = { mode: 'times', times: ['08:00', '20:00'] };
  const original = () => ({
    id: 'h1',
    name: 'Читать',
    emoji: '📚',
    createdAt: '2026-09-01',
    done: ['2026-10-11', '2026-10-12'],
    reminder: REMINDER,
  });

  it('меняет название и эмодзи', () => {
    const s0 = stateWith(original());
    const s1 = updateHabit(s0, 'h1', { name: 'Читать книгу', emoji: '🎸' });
    expect(s1.habits[0].name).toBe('Читать книгу');
    expect(s1.habits[0].emoji).toBe('🎸');
  });

  it('сохраняет id, отметки, дату создания и напоминание', () => {
    const s1 = updateHabit(stateWith(original()), 'h1', { name: 'Новое', emoji: '💧' });
    expect(s1.habits[0]).toEqual({
      id: 'h1',
      name: 'Новое',
      emoji: '💧',
      createdAt: '2026-09-01',
      done: ['2026-10-11', '2026-10-12'],
      reminder: { mode: 'times', times: ['08:00', '20:00'] },
    });
  });

  it('не изменяет исходное состояние и другие привычки', () => {
    const other = { ...original(), id: 'h2', name: 'Другая' };
    const s0 = stateWith(original(), other);
    const s1 = updateHabit(s0, 'h1', { name: 'Новое', emoji: '💧' });
    expect(s0.habits[0].name).toBe('Читать');
    expect(s0.habits[0].emoji).toBe('📚');
    expect(s1.habits[1]).toEqual(other);
    expect(s1.habits.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  it('меняет только эмодзи при прежнем названии', () => {
    const s1 = updateHabit(stateWith(original()), 'h1', { name: 'Читать', emoji: '🌱' });
    expect(s1.habits[0]).toMatchObject({ name: 'Читать', emoji: '🌱' });
  });

  it('обрезает пробелы по краям названия', () => {
    const s1 = updateHabit(stateWith(original()), 'h1', { name: '  Пить воду  ', emoji: '💧' });
    expect(s1.habits[0].name).toBe('Пить воду');
  });

  it('обрезает название до 40 символов', () => {
    const s1 = updateHabit(stateWith(original()), 'h1', { name: 'я'.repeat(45), emoji: '📚' });
    expect(s1.habits[0].name).toBe('я'.repeat(40));
  });

  it('после обрезки до 40 символов не оставляет пробел в конце', () => {
    const name = `${'а'.repeat(39)} хвост`;
    const s1 = updateHabit(stateWith(original()), 'h1', { name, emoji: '📚' });
    expect(s1.habits[0].name).toBe('а'.repeat(39));
  });

  it.each([[''], ['   '], ['\t \n'], [undefined], [null]])('пустое название или только пробелы — без изменений: %j', (name) => {
    const s0 = stateWith(original());
    const s1 = updateHabit(s0, 'h1', { name, emoji: '🎸' });
    expect(s1).toBe(s0);
    expect(s1.habits[0]).toMatchObject({ name: 'Читать', emoji: '📚' });
  });

  it('эмодзи не из набора заменяется на ⭐', () => {
    const s1 = updateHabit(stateWith(original()), 'h1', { name: 'Читать', emoji: '🍕' });
    expect(s1.habits[0].emoji).toBe('⭐');
  });

  it('неизвестный id — то же состояние', () => {
    const s0 = stateWith(original());
    expect(updateHabit(s0, 'nope', { name: 'Новое', emoji: '💧' })).toBe(s0);
  });

  it('те же название и эмодзи — то же состояние', () => {
    const s0 = stateWith(original());
    expect(updateHabit(s0, 'h1', { name: '  Читать ', emoji: '📚' })).toBe(s0);
  });

  it('серия и рекорд после переименования не меняются', () => {
    const s0 = stateWith(original());
    const s1 = updateHabit(s0, 'h1', { name: 'Новое', emoji: '💧' });
    expect(getStreak(s1.habits[0], TODAY)).toBe(2);
    expect(getBestStreak(s1.habits[0])).toBe(2);
  });
});
