import { describe, it, expect } from 'vitest';
import { STORAGE_KEY, loadState, saveState } from '../../src/storage.js';
import { createEmptyState, addHabit, toggleDay } from '../../src/habits.js';

/** Простая заглушка localStorage на Map. */
function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    _map: map,
  };
}

const TODAY = '2026-10-13';

function sampleState() {
  let s = addHabit(createEmptyState(), { name: 'Читать', emoji: '📚' }, { id: 'a', todayKey: '2026-09-01' });
  s = addHabit(s, { name: 'Бег' }, { id: 'b', todayKey: '2026-09-01' });
  s = toggleDay(s, 'a', TODAY, TODAY);
  s = toggleDay(s, 'a', '2026-10-12', TODAY);
  s = toggleDay(s, 'b', '2026-09-20', TODAY);
  return s;
}

describe('STORAGE_KEY', () => {
  it('отдельный ключ проекта', () => {
    expect(STORAGE_KEY).toBe('habit-tracker:v1');
  });
});

describe('loadState', () => {
  it('нет данных — пустое состояние', () => {
    expect(loadState(createStorage())).toEqual(createEmptyState());
  });

  it('битый JSON — пустое состояние без исключения', () => {
    const storage = createStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadState(storage)).toEqual(createEmptyState());
  });

  it.each([
    ['null', 'null'],
    ['число', '42'],
    ['habits не массив', JSON.stringify({ version: 1, habits: 'x' })],
    ['чужая версия', JSON.stringify({ version: 99, habits: [] })],
  ])('неверная структура (%s) — пустое состояние', (_title, raw) => {
    expect(loadState(createStorage({ [STORAGE_KEY]: raw }))).toEqual(createEmptyState());
  });

  it('ошибка чтения хранилища не роняет загрузку', () => {
    const storage = {
      getItem() {
        throw new Error('SecurityError');
      },
    };
    expect(loadState(storage)).toEqual(createEmptyState());
  });

  it('отбрасывает некорректные привычки и даты, оставляя корректные', () => {
    const raw = {
      version: 1,
      habits: [
        { id: 'ok', name: 'Хорошая', emoji: '💧', createdAt: '2026-09-01', done: ['2026-10-12', 'вчера', '2026-02-30', 5] },
        { id: 'noname', name: '   ', emoji: '💧', createdAt: '2026-09-01', done: [] },
        { name: 'Без id', emoji: '💧', createdAt: '2026-09-01', done: [] },
        null,
        'строка',
      ],
    };
    const state = loadState(createStorage({ [STORAGE_KEY]: JSON.stringify(raw) }));
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({ id: 'ok', name: 'Хорошая', emoji: '💧' });
    expect(state.habits[0].done).toEqual(['2026-10-12']);
  });
});

describe('saveState', () => {
  it('save → load возвращает то же состояние (привычки, эмодзи, отметки)', () => {
    const storage = createStorage();
    const state = sampleState();
    saveState(storage, state);
    const loaded = loadState(storage);
    expect(loaded.habits).toHaveLength(2);
    expect(loaded.habits.map((h) => [h.id, h.name, h.emoji])).toEqual([
      ['a', 'Читать', '📚'],
      ['b', 'Бег', '⭐'],
    ]);
    expect([...loaded.habits[0].done].sort()).toEqual(['2026-10-12', TODAY]);
    expect(loaded.habits[1].done).toEqual(['2026-09-20']);
  });

  it('пишет только свой ключ и не трогает чужие', () => {
    const storage = createStorage({ 'other-app': 'keep me', theme: 'dark' });
    saveState(storage, sampleState());
    expect(storage.getItem('other-app')).toBe('keep me');
    expect(storage.getItem('theme')).toBe('dark');
    expect([...storage._map.keys()].sort()).toEqual(['habit-tracker:v1', 'other-app', 'theme'].sort());
  });

  it('ошибка записи (переполнение) не пробрасывается', () => {
    const storage = {
      getItem: () => null,
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveState(storage, sampleState())).not.toThrow();
  });

  it('пустое состояние после сохранения загружается как пустое', () => {
    const storage = createStorage();
    saveState(storage, createEmptyState());
    expect(loadState(storage)).toEqual(createEmptyState());
  });
});

describe('напоминания в хранилище (AC-15)', () => {
  const oldHabit = (over = {}) => ({
    id: 'old',
    name: 'Читать',
    emoji: '📚',
    createdAt: '2026-09-01',
    done: ['2026-10-12', TODAY],
    ...over,
  });
  const store = (habits) => createStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, habits }) });

  it('данные первой версии без поля reminder открываются, reminder = null, привычка и отметки целы', () => {
    const state = loadState(store([oldHabit()]));
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({ id: 'old', name: 'Читать', emoji: '📚', reminder: null });
    expect(state.habits[0].done).toEqual(['2026-10-12', TODAY]);
  });

  it.each([
    ['строка', 'каждый час'],
    ['число', 5],
    ['неизвестный режим', { mode: 'weekly', times: ['08:00'] }],
    ['недопустимый интервал', { mode: 'interval', intervalMin: 45, start: '09:00', end: '21:00', anchor: 1 }],
    ['начало позже конца', { mode: 'interval', intervalMin: 60, start: '21:00', end: '09:00', anchor: 1 }],
    ['interval без anchor', { mode: 'interval', intervalMin: 60, start: '09:00', end: '21:00' }],
    ['6 разных времён', { mode: 'times', times: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00'] }],
    ['пустой список времён', { mode: 'times', times: [] }],
    ['время не HH:MM', { mode: 'times', times: ['8 утра'] }],
  ])('битое напоминание (%s) → reminder = null, привычка цела', (_title, reminder) => {
    const state = loadState(store([oldHabit({ reminder }), oldHabit({ id: 'second', name: 'Бег' })]));
    expect(state.habits.map((h) => h.id)).toEqual(['old', 'second']);
    expect(state.habits[0].reminder).toBeNull();
    expect(state.habits[0].done).toEqual(['2026-10-12', TODAY]);
  });

  it('save → load сохраняет напоминания обоих режимов, включая момент включения', () => {
    const storage = createStorage();
    const anchor = new Date(2026, 9, 13, 10, 15).getTime();
    const state = sampleState();
    state.habits[0] = {
      ...state.habits[0],
      reminder: { mode: 'interval', intervalMin: 120, start: '10:00', end: '18:00', anchor },
    };
    state.habits[1] = { ...state.habits[1], reminder: { mode: 'times', times: ['08:00', '20:00'] } };
    saveState(storage, state);
    const loaded = loadState(storage);
    expect(loaded.habits[0].reminder).toEqual({ mode: 'interval', intervalMin: 120, start: '10:00', end: '18:00', anchor });
    expect(loaded.habits[1].reminder).toEqual({ mode: 'times', times: ['08:00', '20:00'] });
    expect([...loaded.habits[0].done].sort()).toEqual(['2026-10-12', TODAY]);
  });

  it('хранилище не меняет ключ и версию из-за напоминаний', () => {
    const storage = createStorage();
    const state = sampleState();
    state.habits[0] = { ...state.habits[0], reminder: { mode: 'times', times: ['08:00'] } };
    saveState(storage, state);
    expect(JSON.parse(storage.getItem('habit-tracker:v1')).version).toBe(1);
  });
});

// Итерация 004 (AC-23, AC-31): расписание по дням недели в хранилище.
describe('расписание в хранилище (AC-23)', () => {
  const ALL7 = [1, 2, 3, 4, 5, 6, 7];
  const legacy = (over = {}) => ({
    id: 'old',
    name: 'Читать',
    emoji: '📚',
    createdAt: '2026-09-01',
    done: ['2026-10-12', TODAY],
    reminder: null,
    ...over,
  });
  const store = (habits) => createStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, habits }) });

  it('старые данные без поля days открываются как «каждый день», отметки целы', () => {
    const state = loadState(store([legacy()]));
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0].days).toEqual(ALL7);
    expect(state.habits[0].done).toEqual(['2026-10-12', TODAY]);
  });

  it.each([
    ['null', null],
    ['строка', 'пн, ср, пт'],
    ['число', 3],
    ['объект', { mon: true }],
    ['пустой массив', []],
    ['только недопустимые значения', [0, 8, 99]],
  ])('битые days (%s) → все 7 дней, привычка цела', (_title, days) => {
    const state = loadState(store([legacy({ days }), legacy({ id: 'second', name: 'Бег', days: [1, 3, 5] })]));
    expect(state.habits.map((h) => h.id)).toEqual(['old', 'second']);
    expect(state.habits[0].days).toEqual(ALL7);
    expect(state.habits[0].done).toEqual(['2026-10-12', TODAY]);
    expect(state.habits[1].days).toEqual([1, 3, 5]);
  });

  it('неотсортированные дни с повторами приводятся к порядку недели', () => {
    const state = loadState(store([legacy({ days: [5, 1, 3, 1] })]));
    expect(state.habits[0].days).toEqual([1, 3, 5]);
  });

  it('save → load сохраняет расписание; ключ и версия прежние', () => {
    const storage = createStorage();
    const state = sampleState();
    state.habits[0] = { ...state.habits[0], days: [1, 3, 5] };
    saveState(storage, state);
    const loaded = loadState(storage);
    expect(loaded.habits[0].days).toEqual([1, 3, 5]);
    expect(loaded.habits[1].days).toEqual(ALL7);
    expect([...loaded.habits[0].done].sort()).toEqual(['2026-10-12', TODAY]);
    const raw = JSON.parse(storage.getItem('habit-tracker:v1'));
    expect(raw.version).toBe(1);
    expect(raw.habits[0].days).toEqual([1, 3, 5]);
  });
});
