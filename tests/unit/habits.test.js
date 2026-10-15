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
import { describeDays } from '../../src/schedule.js';

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

// ---------------------------------------------------------------------------
// Итерация 004: расписание по дням недели (AC-23, AC-24, AC-26, AC-31).
// 2026-10-12 — понедельник, 2026-10-13 — вторник, 2026-10-17 — суббота.
// ---------------------------------------------------------------------------

const MWF = [1, 3, 5];
const ALL7 = [1, 2, 3, 4, 5, 6, 7];

function scheduledHabit(done, days = MWF, id = 'h1') {
  return { id, name: 'Спортзал', emoji: '🏃', createdAt: '2026-09-01', done, reminder: null, days };
}

describe('addHabit: расписание по умолчанию (AC-23)', () => {
  it('новая привычка назначена на все 7 дней', () => {
    const s = addHabit(createEmptyState(), { name: 'Вода' }, { id: 'a', todayKey: TODAY });
    expect(s.habits[0].days).toEqual(ALL7);
  });
});

describe('getStreak с расписанием (AC-24)', () => {
  const SAT = '2026-10-17';

  it('«пн, ср, пт», отмечены пн, ср, пт, сегодня суббота → 3', () => {
    expect(getStreak(scheduledHabit(['2026-10-12', '2026-10-14', '2026-10-16']), SAT)).toBe(3);
  });

  it('не отмечена среда → серия 1 (только пт)', () => {
    expect(getStreak(scheduledHabit(['2026-10-12', '2026-10-16']), SAT)).toBe(1);
  });

  it('отметка в выходной (вс) добавляет +1', () => {
    expect(getStreak(scheduledHabit(['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-16']), SAT)).toBe(4);
  });

  it('отметка сегодня в выходной (сб) добавляет +1', () => {
    expect(getStreak(scheduledHabit(['2026-10-12', '2026-10-14', '2026-10-16', SAT]), SAT)).toBe(4);
  });

  it('выходные без отметки серию не рвут: пт → (сб, вс пропущены) → пн, ср, пт', () => {
    // Вт 13 и чт 15 — тоже выходные без отметки; ср 07.10 не отмечена — на ней серия заканчивается.
    expect(getStreak(scheduledHabit(['2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16']), SAT)).toBe(4);
  });

  it('сегодня день по расписанию и не отмечено — серия не прерывается', () => {
    expect(getStreak(scheduledHabit(['2026-10-12', '2026-10-14']), '2026-10-16')).toBe(2);
  });

  it('сегодня пн не отмечен: выходные перед ним пропускаются до пятницы', () => {
    expect(getStreak(scheduledHabit(['2026-10-14', '2026-10-16']), '2026-10-19')).toBe(2);
  });

  it('пропущенный прошедший день по расписанию обнуляет серию', () => {
    // Сегодня чт 15 (выходной), ср 14 не отмечена.
    expect(getStreak(scheduledHabit(['2026-10-12']), '2026-10-15')).toBe(0);
    // Отмечена только прошлая пятница, пн 12 пропущен.
    expect(getStreak(scheduledHabit(['2026-10-09']), SAT)).toBe(0);
  });

  it('только воскресенья: неделя между отметками не рвёт серию', () => {
    expect(getStreak(scheduledHabit(['2026-09-27', '2026-10-04', '2026-10-11'], [7]), TODAY)).toBe(3);
  });

  it('через смену месяца: пт 30.10 → пн 02.11, сегодня вт 03.11', () => {
    expect(getStreak(scheduledHabit(['2026-10-30', '2026-11-02']), '2026-11-03')).toBe(2);
  });

  it('без отметок — 0', () => {
    expect(getStreak(scheduledHabit([]), SAT)).toBe(0);
  });

  it('явное «каждый день» (все 7 дней) — прежние правила AC-4', () => {
    expect(getStreak(scheduledHabit(['2026-10-11', '2026-10-12'], ALL7), TODAY)).toBe(2);
    expect(getStreak(scheduledHabit(['2026-10-10', '2026-10-11'], ALL7), TODAY)).toBe(0);
    expect(getStreak(scheduledHabit(['2026-10-11', '2026-10-12', TODAY], ALL7), TODAY)).toBe(3);
  });
});

describe('getBestStreak с расписанием (AC-24)', () => {
  it('«пн, ср, пт»: пропуск среды разрывает цепочку → рекорд 4', () => {
    const done = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-16'];
    expect(getBestStreak(scheduledHabit(done))).toBe(4);
  });

  it('отметка в выходной добавляет +1 к цепочке', () => {
    expect(getBestStreak(scheduledHabit(['2026-10-09', '2026-10-10', '2026-10-12']))).toBe(3);
  });

  it('пропущенный день по расписанию рвёт цепочку', () => {
    expect(getBestStreak(scheduledHabit(['2026-10-05', '2026-10-09', '2026-10-12']))).toBe(2);
  });

  it('только воскресенья: недели между отметками не рвут цепочку', () => {
    expect(getBestStreak(scheduledHabit(['2026-09-27', '2026-10-04', '2026-10-11'], [7]))).toBe(3);
  });

  it('явное «каждый день» — пропуск дня рвёт цепочку, как раньше', () => {
    expect(getBestStreak(scheduledHabit(['2026-10-01', '2026-10-03'], ALL7))).toBe(1);
    expect(getBestStreak(scheduledHabit(['2026-10-01', '2026-10-02', '2026-10-03'], ALL7))).toBe(3);
  });
});

describe('getTodaySummary с расписанием (AC-26)', () => {
  it('неотмеченная привычка с выходным сегодня не входит в Y; отмеченная в выходной — входит в X и Y', () => {
    // Сегодня вторник.
    const state = stateWith(
      scheduledHabit([], MWF, 'off-unmarked'),
      scheduledHabit([TODAY], MWF, 'off-marked'),
      scheduledHabit([], ALL7, 'daily'),
      scheduledHabit([], [2], 'tue-only'),
    );
    expect(getTodaySummary(state, TODAY)).toEqual({ done: 1, total: 3 });
  });

  it('все привычки сегодня выходные и не отмечены — 0 из 0', () => {
    const state = stateWith(scheduledHabit([], MWF, 'a'), scheduledHabit([], [7], 'b'));
    expect(getTodaySummary(state, TODAY)).toEqual({ done: 0, total: 0 });
  });

  it('отметка и снятие отметки в выходной меняют и X, и Y', () => {
    let s = stateWith(scheduledHabit([], MWF, 'off'), scheduledHabit([], ALL7, 'daily'));
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 0, total: 1 });
    s = toggleDay(s, 'off', TODAY, TODAY);
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 1, total: 2 });
    s = toggleDay(s, 'off', TODAY, TODAY);
    expect(getTodaySummary(s, TODAY)).toEqual({ done: 0, total: 1 });
  });

  it('привычка без поля days (старые данные) считается назначенной на сегодня', () => {
    expect(getTodaySummary(stateWith(habitWith([])), TODAY)).toEqual({ done: 0, total: 1 });
  });
});

describe('updateHabit с расписанием (AC-23)', () => {
  const daily = () => scheduledHabit(['2026-10-09', '2026-10-12'], ALL7);

  it('задаёт дни «пн, ср, пт», не трогая название, эмодзи и отметки', () => {
    const s1 = updateHabit(stateWith(daily()), 'h1', { name: 'Спортзал', emoji: '🏃', days: MWF });
    expect(s1.habits[0]).toMatchObject({
      id: 'h1',
      name: 'Спортзал',
      emoji: '🏃',
      createdAt: '2026-09-01',
      done: ['2026-10-09', '2026-10-12'],
      days: [1, 3, 5],
    });
    expect(describeDays(s1.habits[0].days)).toBe('пн, ср, пт');
  });

  it('дни сохраняются отсортированными', () => {
    const s1 = updateHabit(stateWith(daily()), 'h1', { name: 'Спортзал', emoji: '🏃', days: [5, 3, 1] });
    expect(s1.habits[0].days).toEqual([1, 3, 5]);
  });

  it('пустой набор дней не сохраняется как пустое расписание', () => {
    const s1 = updateHabit(stateWith(scheduledHabit([], MWF)), 'h1', { name: 'Спортзал', emoji: '🏃', days: [] });
    expect(s1.habits[0].days.length).toBeGreaterThan(0);
    expect(s1.habits[0].days).toEqual(ALL7);
  });

  it('вернуть все дни → «каждый день», подпись пустая', () => {
    const s1 = updateHabit(stateWith(scheduledHabit([], MWF)), 'h1', { name: 'Спортзал', emoji: '🏃', days: ALL7 });
    expect(s1.habits[0].days).toEqual(ALL7);
    expect(describeDays(s1.habits[0].days)).toBe('');
  });

  it('те же дни (в другом порядке), название и эмодзи — то же состояние', () => {
    const s0 = stateWith(scheduledHabit([], MWF));
    expect(updateHabit(s0, 'h1', { name: 'Спортзал', emoji: '🏃', days: [5, 1, 3] })).toBe(s0);
  });

  it('без поля days расписание не меняется', () => {
    const s1 = updateHabit(stateWith(scheduledHabit([], MWF)), 'h1', { name: 'Зал', emoji: '🏃' });
    expect(s1.habits[0].name).toBe('Зал');
    expect(s1.habits[0].days).toEqual([1, 3, 5]);
  });

  it('пустое название не сохраняется — вместе с ним не меняются и дни', () => {
    const s0 = stateWith(daily());
    expect(updateHabit(s0, 'h1', { name: '  ', emoji: '🏃', days: MWF })).toBe(s0);
  });

  it('смена расписания пересчитывает серию и рекорд', () => {
    const s0 = stateWith(daily());
    // «Каждый день»: вс 11 не отмечено → серия только пн 12.
    expect(getStreak(s0.habits[0], TODAY)).toBe(1);
    // «пн, ср, пт»: пт 9 → (сб, вс — выходные) → пн 12.
    const s1 = updateHabit(s0, 'h1', { name: 'Спортзал', emoji: '🏃', days: MWF });
    expect(getStreak(s1.habits[0], TODAY)).toBe(2);
    expect(getBestStreak(s1.habits[0])).toBe(2);
  });
});

// --- Итерация 005: цвет привычки (AC-32) ---

describe('addHabit: цвет привычки (AC-32)', () => {
  const PALETTE_ORDER = ['teal', 'purple', 'coral', 'pink', 'blue', 'green', 'amber', 'gray'];

  function addMany(count, initial = createEmptyState()) {
    let s = initial;
    for (let i = 0; i < count; i += 1) {
      s = addHabit(s, { name: `П${i}` }, { id: `n${i}`, todayKey: TODAY });
    }
    return s;
  }

  it('первая привычка получает первый цвет палитры', () => {
    const s = addMany(1);
    expect(s.habits[0].color).toBe('teal');
  });

  it('новые привычки получают разные цвета, пока есть свободные', () => {
    const s = addMany(8);
    const colors = s.habits.map((h) => h.color);
    expect(colors).toEqual(PALETTE_ORDER);
    expect(new Set(colors).size).toBe(8);
  });

  it('выбирается первый свободный цвет, занятые пропускаются', () => {
    const s0 = stateWith({ ...habitWith([], 'a'), color: 'teal' }, { ...habitWith([], 'b'), color: 'coral' });
    const s1 = addHabit(s0, { name: 'Новая' }, { id: 'c', todayKey: TODAY });
    expect(s1.habits[2].color).toBe('purple');
  });

  it('цвет удалённой привычки снова свободен', () => {
    let s = addMany(3);
    s = removeHabit(s, 'n1'); // освобождается purple
    s = addHabit(s, { name: 'Новая' }, { id: 'x', todayKey: TODAY });
    expect(s.habits.find((h) => h.id === 'x').color).toBe('purple');
  });

  it('все 8 заняты → цвета по кругу, значение остаётся ключом палитры', () => {
    const s = addMany(10);
    expect(s.habits[8].color).toBe('teal');
    expect(s.habits[9].color).toBe('purple');
  });

  it('пустое название не добавляется — цвет не расходуется', () => {
    let s = addHabit(createEmptyState(), { name: '   ' }, { id: 'bad', todayKey: TODAY });
    s = addHabit(s, { name: 'Ок' }, { id: 'ok', todayKey: TODAY });
    expect(s.habits).toHaveLength(1);
    expect(s.habits[0].color).toBe('teal');
  });
});

describe('updateHabit: цвет (AC-32)', () => {
  const colored = (color = 'teal') => ({
    id: 'h1',
    name: 'Читать',
    emoji: '📚',
    createdAt: '2026-09-01',
    done: ['2026-10-11', '2026-10-12'],
    reminder: { mode: 'times', times: ['08:00'] },
    days: [1, 2, 3, 4, 5, 6, 7],
    color,
  });

  it.each(['teal', 'purple', 'coral', 'pink', 'blue', 'green', 'amber', 'gray'])(
    'можно выбрать любой цвет палитры: %s',
    (color) => {
      const start = color === 'teal' ? 'gray' : 'teal';
      const s1 = updateHabit(stateWith(colored(start)), 'h1', { name: 'Читать', emoji: '📚', color });
      expect(s1.habits[0].color).toBe(color);
    },
  );

  it('смена только цвета → новое состояние, остальные поля прежние', () => {
    const s0 = stateWith(colored('teal'));
    const s1 = updateHabit(s0, 'h1', { name: 'Читать', emoji: '📚', color: 'pink' });
    expect(s1).not.toBe(s0);
    expect(s1.habits[0]).toEqual({ ...colored('teal'), color: 'pink' });
    expect(s0.habits[0].color).toBe('teal');
  });

  it('цвет меняется вместе с названием, эмодзи и днями', () => {
    const s1 = updateHabit(stateWith(colored('teal')), 'h1', {
      name: 'Книга',
      emoji: '🎸',
      days: [1, 3, 5],
      color: 'blue',
    });
    expect(s1.habits[0]).toMatchObject({ name: 'Книга', emoji: '🎸', days: [1, 3, 5], color: 'blue' });
    expect(s1.habits[0].done).toEqual(['2026-10-11', '2026-10-12']);
  });

  it('тот же цвет, название и эмодзи → то же состояние', () => {
    const s0 = stateWith(colored('amber'));
    expect(updateHabit(s0, 'h1', { name: 'Читать', emoji: '📚', color: 'amber' })).toBe(s0);
  });

  it.each([
    ['не из палитры', 'neon'],
    ['HEX', '#ff0000'],
    ['null', null],
    ['число', 5],
  ])('цвет %s не применяется — цвет прежний', (_title, color) => {
    const s0 = stateWith(colored('coral'));
    const s1 = updateHabit(s0, 'h1', { name: 'Читать', emoji: '📚', color });
    expect(s1.habits[0].color).toBe('coral');
  });

  it('без поля color цвет не меняется', () => {
    const s1 = updateHabit(stateWith(colored('green')), 'h1', { name: 'Новое', emoji: '💧' });
    expect(s1.habits[0].name).toBe('Новое');
    expect(s1.habits[0].color).toBe('green');
  });

  it('пустое название не сохраняется — цвет тоже не меняется (AC-20)', () => {
    const s0 = stateWith(colored('teal'));
    expect(updateHabit(s0, 'h1', { name: '   ', emoji: '📚', color: 'pink' })).toBe(s0);
  });

  it('цвет другой привычки не меняется', () => {
    const other = { ...colored('purple'), id: 'h2' };
    const s1 = updateHabit(stateWith(colored('teal'), other), 'h1', { name: 'Читать', emoji: '📚', color: 'pink' });
    expect(s1.habits[1]).toEqual(other);
  });

  it('смена цвета не влияет на серию и рекорд', () => {
    const s0 = stateWith(colored('teal'));
    const s1 = updateHabit(s0, 'h1', { name: 'Читать', emoji: '📚', color: 'gray' });
    expect(getStreak(s1.habits[0], TODAY)).toBe(getStreak(s0.habits[0], TODAY));
    expect(getBestStreak(s1.habits[0])).toBe(getBestStreak(s0.habits[0]));
  });
});
