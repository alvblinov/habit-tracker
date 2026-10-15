import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHARACTERS,
  DEFAULT_CHARACTER,
  COMPANION_KEY,
  MAX_NAME,
  PHRASES,
  normalizeCompanionSettings,
  companionImage,
  partOfDay,
  pickPhrase,
  companionEventForMark,
  companionEventForAdd,
  STREAK_MILESTONES,
  ACCENTS,
  accentOf,
  EVENTS as MODULE_EVENTS,
} from '../../src/companion.js';
import { STORAGE_KEY } from '../../src/storage.js';
import { addDays } from '../../src/dates.js';

// Итерация 006: помощник с выбором персонажа (AC-41…AC-46) — чистая логика.
// Расширение 15.10.2026 (AC-47…AC-54): новые поводы, вехи, первый закрытый день, отметка
// прошлого дня, поля настроек tourOffered/lastTipDate, акцентные цвета.

const EXPECTED = [
  { id: 'cat', emoji: '🐱', defaultName: 'Мурзик' },
  { id: 'fox', emoji: '🦊', defaultName: 'Алиса' },
  { id: 'panda', emoji: '🐼', defaultName: 'Пандуша' },
  { id: 'frog', emoji: '🐸', defaultName: 'Квака' },
  { id: 'owl', emoji: '🦉', defaultName: 'Софа' },
  { id: 'penguin', emoji: '🐧', defaultName: 'Пин' },
  { id: 'hedgehog', emoji: '🦔', defaultName: 'Колючка' },
];
const IDS = EXPECTED.map((c) => c.id);
const EVENTS = [
  'greeting',
  'mark',
  'markStreak',
  'remaining',
  'allDone',
  'newRecord',
  'unmark',
  'empty',
  'poke',
  'intro',
  // Расширение (AC-49, AC-51, AC-52).
  'added',
  'firstHabit',
  'markPast',
  'firstDayClosed',
  'milestone',
  'reminderSet',
  'edited',
  'deleted',
  'tourOffer',
  'tipIntro',
];
// Поводы-действия с привычкой: название привычки — в каждой реплике (AC-43, AC-49).
const HABIT_EVENTS = ['added', 'firstHabit', 'markPast', 'milestone', 'reminderSet', 'edited', 'deleted'];
// Слова-упрёки (GOAL: «никогда не стыдит и не давит»).
const REPROACH = /пропуст|лентя|ленив|стыдн|позор|провал/i;

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

// Полный контекст для подстановок — чтобы проверить, что после неё не остаётся «{…}».
const FULL_CTX = { name: 'Друг', habit: 'Пить воду', streak: 5, left: 2, done: 1, total: 3, hour: 9 };

/** rand, выбирающий вариант i из n (середина интервала [i/n, (i+1)/n)). */
const randFor = (i, n) => () => (i + 0.5) / n;

/** Все варианты реплики персонажа на повод — через pickPhrase, с подстановками. */
function allVariants(event, ctx, characterId) {
  const n = PHRASES[characterId][event].length;
  return Array.from({ length: n }, (_, i) => pickPhrase(event, ctx, characterId, randFor(i, n)));
}

describe('персонажи', () => {
  it('ровно 7 персонажей с ожидаемыми id, символами и именами', () => {
    expect(CHARACTERS.map(({ id, emoji, defaultName }) => ({ id, emoji, defaultName }))).toEqual(EXPECTED);
  });

  it('у каждого есть вид (label) и код картинки Noto, совпадающий с кодом символа', () => {
    for (const c of CHARACTERS) {
      expect(typeof c.label, c.id).toBe('string');
      expect(c.label.length, c.id).toBeGreaterThan(0);
      expect(c.code, c.id).toBe(c.emoji.codePointAt(0).toString(16));
    }
  });

  it('по умолчанию — кот; свой ключ хранилища, не ключ привычек; имя до 20 символов', () => {
    expect(DEFAULT_CHARACTER).toBe('cat');
    expect(COMPANION_KEY).toBe('habit-tracker:companion');
    expect(COMPANION_KEY).not.toBe(STORAGE_KEY);
    expect(MAX_NAME).toBe(20);
  });
});

describe('companionImage', () => {
  it.each(EXPECTED.map((c) => [c.id]))('%s: WebP для анимации, SVG для статики — относительные пути', (id) => {
    const code = CHARACTERS.find((c) => c.id === id).code;
    expect(companionImage(id, { animated: true })).toBe(`companions/${code}.webp`);
    expect(companionImage(id, { animated: false })).toBe(`companions/${code}.svg`);
  });

  it('файлы всех 14 картинок лежат локально в public/companions/', () => {
    for (const id of IDS) {
      for (const animated of [true, false]) {
        const path = companionImage(id, { animated });
        expect(existsSync(`${PUBLIC_DIR}${path}`), path).toBe(true);
      }
    }
  });
});

describe('normalizeCompanionSettings', () => {
  // Расширение (AC-51, AC-52): поля tourOffered (экскурсию предлагали) и lastTipDate (дата совета дня).
  const DEFAULTS = {
    character: 'cat',
    name: 'Мурзик',
    enabled: true,
    introduced: false,
    tourOffered: false,
    lastTipDate: null,
  };

  it.each([
    ['null (ключа нет)', null],
    ['undefined', undefined],
    ['битый JSON', '{oops'],
    ['массив', '[]'],
    ['число', 42],
    ['строка-JSON с числом', '7'],
    ['пустой объект', {}],
  ])('%s → по умолчанию: Мурзик, включён, знакомство не пройдено', (_title, raw) => {
    expect(normalizeCompanionSettings(raw)).toEqual(DEFAULTS);
  });

  it('корректные настройки сохраняются как есть (объект и JSON-строка)', () => {
    const value = {
      character: 'owl',
      name: 'Совушка',
      enabled: false,
      introduced: true,
      tourOffered: true,
      lastTipDate: '2026-10-14',
    };
    expect(normalizeCompanionSettings(value)).toEqual(value);
    expect(normalizeCompanionSettings(JSON.stringify(value))).toEqual(value);
  });

  it('неизвестный персонаж → кот с именем Мурзик', () => {
    expect(normalizeCompanionSettings({ character: 'beaver', introduced: true })).toEqual({
      character: 'cat',
      name: 'Мурзик',
      enabled: true,
      introduced: true,
      tourOffered: false,
      lastTipDate: null,
    });
  });

  it('прежние настройки (прогоны 01–02, без новых полей) → экскурсию не предлагали, совета не было', () => {
    expect(normalizeCompanionSettings({ character: 'fox', name: 'Рыжик', enabled: true, introduced: true })).toEqual({
      character: 'fox',
      name: 'Рыжик',
      enabled: true,
      introduced: true,
      tourOffered: false,
      lastTipDate: null,
    });
  });

  it.each([['строка «true»', 'true'], ['1', 1], ['объект', {}], ['null', null]])(
    'tourOffered: %s → false (только true считается)',
    (_title, tourOffered) => {
      expect(normalizeCompanionSettings({ character: 'cat', introduced: true, tourOffered }).tourOffered).toBe(false);
    },
  );

  it.each([
    ['несуществующая дата', '2026-02-30'],
    ['другой формат', '13.10.2026'],
    ['дата со временем', '2026-10-13T10:00:00Z'],
    ['число', 20261013],
    ['пустая строка', ''],
  ])('lastTipDate: %s → null', (_title, lastTipDate) => {
    expect(normalizeCompanionSettings({ character: 'cat', introduced: true, lastTipDate }).lastTipDate).toBeNull();
  });

  it('lastTipDate: граница месяца и високосный день сохраняются', () => {
    expect(normalizeCompanionSettings({ lastTipDate: '2026-10-31' }).lastTipDate).toBe('2026-10-31');
    expect(normalizeCompanionSettings({ lastTipDate: '2028-02-29' }).lastTipDate).toBe('2028-02-29');
  });

  it('имя обрезается по краям', () => {
    expect(normalizeCompanionSettings({ character: 'fox', name: '  Рыжик  ' }).name).toBe('Рыжик');
  });

  it.each([
    ['пустое', ''],
    ['только пробелы', '    '],
    ['21 символ', 'А'.repeat(21)],
    ['не строка', 123],
  ])('имя %s → имя персонажа по умолчанию', (_title, name) => {
    expect(normalizeCompanionSettings({ character: 'fox', name }).name).toBe('Алиса');
  });

  it('граница длины: 1 и 20 символов допустимы', () => {
    expect(normalizeCompanionSettings({ character: 'cat', name: 'Я' }).name).toBe('Я');
    expect(normalizeCompanionSettings({ character: 'cat', name: 'Б'.repeat(20) }).name).toBe('Б'.repeat(20));
  });

  it('выключенный помощник остаётся выключенным; отсутствие поля — включён', () => {
    expect(normalizeCompanionSettings({ character: 'frog', enabled: false }).enabled).toBe(false);
    expect(normalizeCompanionSettings({ character: 'frog' }).enabled).toBe(true);
  });
});

describe('partOfDay', () => {
  it.each([
    [0, 'night'],
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'day'],
    [17, 'day'],
    [18, 'evening'],
    [22, 'evening'],
    [23, 'night'],
  ])('%i ч → %s', (hour, part) => {
    expect(partOfDay(hour)).toBe(part);
  });

  it.each([[undefined], [null], [-1], [24], [NaN], ['abc']])('некорректный час %s не ломает: одна из частей суток', (hour) => {
    expect(['morning', 'day', 'evening', 'night']).toContain(partOfDay(hour));
  });
});

describe('PHRASES — полнота и тон', () => {
  it('реплики есть у всех 7 персонажей', () => {
    expect(Object.keys(PHRASES).sort()).toEqual([...IDS].sort());
  });

  it.each(IDS.map((id) => [id]))('%s: все 20 поводов, по 3+ непустых и разных варианта', (id) => {
    for (const event of EVENTS) {
      const variants = PHRASES[id][event];
      expect(Array.isArray(variants), `${id}.${event}`).toBe(true);
      expect(variants.length, `${id}.${event}`).toBeGreaterThanOrEqual(3);
      for (const v of variants) {
        expect(typeof v, `${id}.${event}`).toBe('string');
        expect(v.trim().length, `${id}.${event}`).toBeGreaterThan(0);
      }
      expect(new Set(variants).size, `${id}.${event}: варианты не повторяются`).toBe(variants.length);
    }
  });

  it('после подстановки не остаётся «{…}» и нет слов-упрёков — во всех вариантах и частях суток', () => {
    for (const id of IDS) {
      for (const event of EVENTS) {
        for (const hour of [3, 9, 14, 20]) {
          for (const text of allVariants(event, { ...FULL_CTX, hour }, id)) {
            const where = `${id}.${event} @${hour}: ${text}`;
            expect(text, where).not.toMatch(/[{}]/);
            expect(text, where).not.toMatch(REPROACH);
            expect(text.length, where).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('разные персонажи на один повод говорят по-разному: наборы реплик различаются, у каждого есть свои', () => {
    for (const event of EVENTS) {
      for (const id of IDS) {
        const others = new Set(IDS.filter((o) => o !== id).flatMap((o) => PHRASES[o][event]));
        const own = PHRASES[id][event].filter((v) => !others.has(v));
        expect(own.length, `${id}.${event}: нет ни одной своей реплики`).toBeGreaterThan(0);
      }
      for (let i = 0; i < IDS.length; i += 1) {
        for (let j = i + 1; j < IDS.length; j += 1) {
          expect(PHRASES[IDS[i]][event], `${IDS[i]} vs ${IDS[j]} на ${event}`).not.toEqual(PHRASES[IDS[j]][event]);
        }
      }
    }
  });

  it('у разных персонажей на один повод нет дословно совпадающих реплик', () => {
    for (const event of EVENTS) {
      const owner = new Map();
      for (const id of IDS) {
        for (const v of PHRASES[id][event]) {
          const key = v.trim();
          expect(owner.get(key), `${event}: «${v}» у ${owner.get(key)} и ${id}`).toBeUndefined();
          owner.set(key, id);
        }
      }
    }
  });

  it('модуль перечисляет все поводы, включая новые (EVENTS)', () => {
    expect(MODULE_EVENTS).toEqual(expect.arrayContaining(EVENTS));
  });

  it.each(HABIT_EVENTS.map((e) => [e]))('%s: название привычки — в каждой реплике каждого персонажа (AC-49)', (event) => {
    for (const id of IDS) {
      for (const text of allVariants(event, { habit: 'Пить воду', streak: 7 }, id)) {
        expect(text, `${id}.${event}`).toContain('Пить воду');
      }
    }
  });

  it.each([
    [3, '3 дня'],
    [7, '7 дней'],
    [14, '14 дней'],
    [30, '30 дней'],
    [50, '50 дней'],
    [100, '100 дней'],
  ])('веха %i: серия «%s» в каждой реплике каждого персонажа', (streak, expected) => {
    for (const id of IDS) {
      for (const text of allVariants('milestone', { habit: 'Бег', streak }, id)) {
        expect(text, id).toContain(expected);
      }
    }
  });

});

describe('ACCENTS — акцент облачка у каждого персонажа свой (AC-48)', () => {
  it('у всех 7 персонажей есть акцент, и все акценты разные', () => {
    expect(Object.keys(ACCENTS).sort()).toEqual([...IDS].sort());
    const values = IDS.map((id) => ACCENTS[id]);
    for (const v of values) expect(typeof v === 'string' && v.length > 0).toBe(true);
    expect(new Set(values).size).toBe(7);
  });

  it('лиса — оранжевый, лягушка — зелёный (как в плане)', () => {
    expect(ACCENTS.fox).toBe('orange');
    expect(ACCENTS.frog).toBe('green');
  });

  it('accentOf: по id персонажа; неизвестный → акцент кота', () => {
    for (const id of IDS) expect(accentOf(id)).toBe(ACCENTS[id]);
    expect(accentOf('beaver')).toBe(ACCENTS.cat);
    expect(accentOf(undefined)).toBe(ACCENTS.cat);
  });

  it('акцент — безопасный ключ для атрибута/CSS-переменной (латиница)', () => {
    for (const id of IDS) expect(ACCENTS[id]).toMatch(/^[a-z]+$/);
  });
});

describe('pickPhrase', () => {
  it('детерминирован при заданном rand: тот же rand — та же реплика; 0 → первый, ~1 → последний вариант', () => {
    const ctx = { habit: 'Пить воду' };
    for (const id of IDS) {
      const variants = allVariants('mark', ctx, id);
      expect(pickPhrase('mark', ctx, id, () => 0), id).toBe(variants[0]);
      expect(pickPhrase('mark', ctx, id, () => 0.999999), id).toBe(variants[variants.length - 1]);
      expect(pickPhrase('mark', ctx, id, () => 0.4), id).toBe(pickPhrase('mark', ctx, id, () => 0.4));
    }
  });

  it('разные значения rand дают разные варианты', () => {
    const texts = allVariants('poke', {}, 'cat');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('отметка: название привычки — в каждой реплике каждого персонажа', () => {
    for (const id of IDS) {
      for (const text of allVariants('mark', { habit: 'Пить воду' }, id)) {
        expect(text, id).toContain('Пить воду');
      }
    }
  });

  it('серия и рекорд: название привычки и серия со словом «дней»', () => {
    for (const id of IDS) {
      for (const event of ['markStreak', 'newRecord']) {
        for (const text of allVariants(event, { habit: 'Читать', streak: 5 }, id)) {
          expect(text, `${id}.${event}`).toContain('Читать');
          expect(text, `${id}.${event}`).toContain('5 дней');
        }
      }
    }
  });

  it.each([
    [1, '1 день'],
    [2, '2 дня'],
    [4, '4 дня'],
    [5, '5 дней'],
    [11, '11 дней'],
    [12, '12 дней'],
    [14, '14 дней'],
    [21, '21 день'],
    [22, '22 дня'],
    [25, '25 дней'],
    [101, '101 день'],
    [111, '111 дней'],
  ])('склонение серии: %i → «%s»', (streak, expected) => {
    for (const text of allVariants('markStreak', { habit: 'Бег', streak }, 'cat')) {
      expect(text).toContain(expected);
      // Нет ошибочной формы (например, «21 дней»).
      const word = expected.split(' ')[1];
      for (const wrong of ['день', 'дня', 'дней'].filter((f) => f !== word)) {
        expect(text).not.toMatch(new RegExp(`(^|\\D)${streak} ${wrong}(?![а-яё])`));
      }
    }
  });

  it.each([
    [1, '1 привычка'],
    [2, '2 привычки'],
  ])('«осталось»: %i → «%s» в каждой реплике каждого персонажа', (left, expected) => {
    for (const id of IDS) {
      for (const text of allVariants('remaining', { habit: 'Бег', left }, id)) {
        expect(text, id).toContain(expected);
      }
    }
  });

  it('приветствие: сводка «X из Y» и разная фраза для утра и вечера', () => {
    for (const id of IDS) {
      const morning = allVariants('greeting', { done: 2, total: 5, hour: 8 }, id);
      const evening = allVariants('greeting', { done: 2, total: 5, hour: 20 }, id);
      for (let i = 0; i < morning.length; i += 1) {
        expect(morning[i], id).toContain('2 из 5');
        expect(morning[i], id).not.toBe(evening[i]);
      }
    }
  });

  it('приветствие: часть суток можно передать явно (part) — то же, что по часу', () => {
    expect(pickPhrase('greeting', { done: 0, total: 1, part: 'night' }, 'owl', () => 0)).toBe(
      pickPhrase('greeting', { done: 0, total: 1, hour: 2 }, 'owl', () => 0),
    );
  });

  it('представление: имя помощника (в том числе переименованного) в каждой реплике', () => {
    for (const id of IDS) {
      const def = CHARACTERS.find((c) => c.id === id).defaultName;
      for (const text of allVariants('intro', {}, id)) expect(text, id).toContain(def);
      for (const text of allVariants('intro', { name: 'Барсик' }, id)) {
        expect(text, id).toContain('Барсик');
      }
    }
  });

  it('название с «{name}», «$&» и HTML подставляется как есть, без повторного разбора', () => {
    const habit = '<b>x</b> {name} $& {streak}';
    for (const id of IDS) {
      for (const text of allVariants('mark', { habit, name: 'Барсик' }, id)) {
        expect(text, id).toContain(habit);
      }
    }
  });

  it('неизвестный повод → пустая строка; неизвестный персонаж → реплика кота', () => {
    expect(pickPhrase('nope', {}, 'cat', () => 0)).toBe('');
    expect(pickPhrase('mark', { habit: 'Бег' }, 'beaver', () => 0)).toBe(
      pickPhrase('mark', { habit: 'Бег' }, 'cat', () => 0),
    );
  });

  it('снятие отметки: мягко, без упрёков, у всех персонажей', () => {
    for (const id of IDS) {
      for (const text of allVariants('unmark', { habit: 'Бег' }, id)) {
        expect(text, id).not.toMatch(REPROACH);
      }
    }
  });
});

// --- companionEventForMark ---

const TODAY = '2026-10-13';
const ALL7 = [1, 2, 3, 4, 5, 6, 7];

function habit(id, name, done, days = ALL7) {
  return { id, name, emoji: '⭐', createdAt: '2026-08-01', done, reminder: null, days, color: 'teal' };
}
const st = (...habits) => ({ version: 1, habits });
/** n дней подряд, заканчивая днём end (включительно), по возрастанию. */
const run = (end, n) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
/** Состояние с отметкой today у привычки id (toggle). */
function toggled(state, id, day = TODAY) {
  return {
    ...state,
    habits: state.habits.map((h) =>
      h.id !== id
        ? h
        : { ...h, done: h.done.includes(day) ? h.done.filter((d) => d !== day) : [...h.done, day].sort() },
    ),
  };
}

describe('companionEventForMark', () => {
  const fresh = (id) => habit(id, `Привычка ${id}`, []);

  it('сегодняшняя отметка не изменилась → null', () => {
    const s = st(fresh('a'), fresh('b'));
    expect(companionEventForMark({ before: s, after: s, today: TODAY })).toBeNull();
    expect(companionEventForMark({ before: s, after: s, today: TODAY, habitId: 'a' })).toBeNull();
  });

  // Было (прогоны 01–02): отметка прошлого дня → null. Стало (AC-49): реплика на любую клетку —
  // прошлый день даёт markPast (дата клетки передаётся параметром date).
  it('отметка прошлого дня (date ≠ today) → markPast с названием привычки', () => {
    const s = st(habit('a', 'Пить воду', []), fresh('b'), fresh('c'), fresh('d'));
    const after = toggled(s, 'a', '2026-10-12');
    const result = companionEventForMark({ before: s, after, today: TODAY, date: '2026-10-12', habitId: 'a' });
    expect(result.event).toBe('markPast');
    expect(result.ctx.habit).toBe('Пить воду');
  });

  it('без date изменение прошлого дня не считается сегодняшней отметкой → null (прежние вызовы)', () => {
    const s = st(fresh('a'));
    const after = toggled(s, 'a', '2026-10-12');
    expect(companionEventForMark({ before: s, after, today: TODAY, habitId: 'a' })).toBeNull();
  });

  it('mark: первая отметка, осталось 3+ привычки — с названием, серией и сводкой', () => {
    const s = st(habit('a', 'Пить воду', []), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result).toEqual({
      event: 'mark',
      ctx: { habit: 'Пить воду', streak: 1, left: 3, done: 1, total: 4 },
    });
  });

  // Было: серия 3 → markStreak. Стало (AC-49): 3 — веха (milestone), поэтому markStreak
  // проверяется на серии 4 (не веха); смысл — «серия ≥ 2, но не рекорд» — сохранён.
  it('markStreak: серия ≥ 2, не веха и не рекорд (лучшая серия была длиннее), осталось 3+', () => {
    const a = habit('a', 'Читать', [...run('2026-08-05', 5), ...run('2026-10-12', 3)]);
    const s = st(a, fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('markStreak');
    expect(result.ctx).toMatchObject({ habit: 'Читать', streak: 4, left: 3 });
  });

  it('серия, равная прежней лучшей (4 = 4), — не рекорд', () => {
    const a = habit('a', 'Читать', [...run('2026-08-04', 4), ...run('2026-10-12', 3)]);
    const s = st(a, fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('markStreak');
    expect(result.ctx.streak).toBe(4);
  });

  it.each([
    [3, 2],
    [2, 1],
  ])('remaining: из %i привычек отмечена одна → осталось %i', (count, left) => {
    const habits = Array.from({ length: count }, (_, i) => fresh(`h${i}`));
    const s = st(...habits);
    const result = companionEventForMark({ before: s, after: toggled(s, 'h0'), today: TODAY, habitId: 'h0' });
    expect(result.event).toBe('remaining');
    expect(result.ctx).toMatchObject({ habit: 'Привычка h0', left, done: 1, total: count });
  });

  // Было: первый закрытый день → allDone. Стало (AC-49): самый первый закрытый день → firstDayClosed;
  // allDone — когда закрытые дни уже были (засеян ранний закрытый день).
  it('allDone: отмечена последняя привычка дня, закрытые дни уже были', () => {
    const s = st({ ...fresh('a'), done: ['2026-10-10', TODAY] }, { ...fresh('b'), done: ['2026-10-10'] });
    const result = companionEventForMark({ before: s, after: toggled(s, 'b'), today: TODAY, habitId: 'b' });
    expect(result.event).toBe('allDone');
    expect(result.ctx).toMatchObject({ done: 2, total: 2, left: 0 });
  });

  it('firstDayClosed: отмечена последняя привычка дня, раньше ни один день не был закрыт целиком', () => {
    const s = st({ ...fresh('a'), done: [TODAY] }, fresh('b'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'b'), today: TODAY, habitId: 'b' });
    expect(result.event).toBe('firstDayClosed');
    expect(result.ctx).toMatchObject({ done: 2, total: 2, left: 0 });
  });

  it('firstDayClosed: отметки раньше были, но ни один день не закрыт целиком', () => {
    // 10.10 — отмечена только a из двух: день не закрыт.
    const s = st({ ...fresh('a'), done: ['2026-10-10', TODAY] }, fresh('b'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'b'), today: TODAY, habitId: 'b' });
    expect(result.event).toBe('firstDayClosed');
  });

  it('единственная привычка, первая отметка — firstDayClosed, не «рекорд»', () => {
    const s = st(fresh('a'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('firstDayClosed');
    expect(result.ctx.streak).toBe(1);
  });

  it('newRecord: серия стала длиннее прежней лучшей (2 > 1)', () => {
    const s = st(habit('a', 'Читать', ['2026-10-12']), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('newRecord');
    expect(result.ctx).toMatchObject({ habit: 'Читать', streak: 2 });
  });

  it('newRecord важнее allDone (рекорд на последней привычке дня)', () => {
    const s = st(habit('a', 'Читать', ['2026-10-12']));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('newRecord');
  });

  it('смена месяца: вчера 31 октября, сегодня 1 ноября → серия 2, рекорд', () => {
    const today = '2026-11-01';
    const s = st(habit('a', 'Бег', ['2026-10-31']), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a', today), today, habitId: 'a' });
    expect(result.event).toBe('newRecord');
    expect(result.ctx.streak).toBe(2);
  });

  it('пропуск дня: отметка позавчера не продлевает серию → обычная отметка', () => {
    const s = st(habit('a', 'Бег', ['2026-10-11']), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('mark');
    expect(result.ctx.streak).toBe(1);
  });

  it('unmark: сегодняшнюю отметку сняли', () => {
    const s = st(habit('a', 'Бег', ['2026-10-12', TODAY]), fresh('b'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('unmark');
    expect(result.ctx.habit).toBe('Бег');
  });

  it('habitId выбирает нужную привычку, без habitId — ту, у которой изменилась отметка', () => {
    const s = st(fresh('a'), habit('b', 'Вторая', []), fresh('c'), fresh('d'));
    const after = toggled(s, 'b');
    expect(companionEventForMark({ before: s, after, today: TODAY, habitId: 'b' }).ctx.habit).toBe('Вторая');
    expect(companionEventForMark({ before: s, after, today: TODAY }).ctx.habit).toBe('Вторая');
    // Отметка изменилась у b, а спросили про a → повода нет.
    expect(companionEventForMark({ before: s, after, today: TODAY, habitId: 'a' })).toBeNull();
  });

  it('пустые или битые аргументы не ломают: null', () => {
    expect(companionEventForMark({ before: null, after: undefined, today: TODAY })).toBeNull();
    expect(companionEventForMark()).toBeNull();
  });
});

describe('companionEventForMark — вехи серии (AC-49)', () => {
  const fresh = (id) => habit(id, `Привычка ${id}`, []);
  // Давняя длинная серия (120 дней) — чтобы веха не совпадала с новым рекордом.
  const LONG = run('2025-06-30', 120);

  it('вехи — 3, 7, 14, 30, 50, 100', () => {
    expect(STREAK_MILESTONES).toEqual([3, 7, 14, 30, 50, 100]);
  });

  it.each([3, 7, 14, 30, 50, 100].map((n) => [n]))('серия стала %i → milestone со streak', (n) => {
    const s = st(habit('a', 'Бег', [...LONG, ...run('2026-10-12', n - 1)]), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('milestone');
    expect(result.ctx).toMatchObject({ habit: 'Бег', streak: n });
  });

  it.each([2, 4, 6, 8, 13, 15, 29, 31].map((n) => [n]))('серия %i — не веха', (n) => {
    const s = st(habit('a', 'Бег', [...LONG, ...run('2026-10-12', n - 1)]), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).not.toBe('milestone');
    expect(result.ctx.streak).toBe(n);
  });

  it('веха важнее рекорда: серия 3 — одновременно новый рекорд → milestone', () => {
    const s = st(habit('a', 'Читать', run('2026-10-12', 2)), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('milestone');
  });

  it('веха важнее «всё выполнено» (единственная привычка, 3-й день подряд)', () => {
    const s = st(habit('a', 'Читать', run('2026-10-12', 2)));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('milestone');
  });

  it('веха через смену месяца: 30.10, 31.10, 1.11 → серия 3', () => {
    const today = '2026-11-01';
    const s = st(habit('a', 'Бег', ['2026-10-30', '2026-10-31']), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a', today), today, habitId: 'a' });
    expect(result.event).toBe('milestone');
    expect(result.ctx.streak).toBe(3);
  });

  it('пропуск дня: 10.10, 11.10, (12.10 нет), 13.10 → серия 1, не веха', () => {
    const s = st(habit('a', 'Бег', ['2026-10-10', '2026-10-11']), fresh('b'), fresh('c'), fresh('d'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).not.toBe('milestone');
    expect(result.ctx.streak).toBe(1);
  });

  it('снятие отметки при серии-вехе — unmark (снятие важнее всего)', () => {
    const s = st(habit('a', 'Бег', run(TODAY, 3)), fresh('b'));
    const result = companionEventForMark({ before: s, after: toggled(s, 'a'), today: TODAY, habitId: 'a' });
    expect(result.event).toBe('unmark');
  });

  it('отметка прошлого дня, дотянувшая серию до вехи → milestone', () => {
    // 11.10 и 13.10 отмечены; отмечаем 12.10 → серия 3.
    const s = st(habit('a', 'Бег', ['2026-10-11', TODAY]), fresh('b'), fresh('c'), fresh('d'));
    const date = '2026-10-12';
    const result = companionEventForMark({ before: s, after: toggled(s, 'a', date), today: TODAY, date, habitId: 'a' });
    expect(result.event).toBe('milestone');
    expect(result.ctx.streak).toBe(3);
  });

  it('веха не повторяется: серия уже 3, отметка далёкого прошлого дня её не меняет → markPast', () => {
    const s = st(habit('a', 'Бег', run(TODAY, 3)), fresh('b'), fresh('c'), fresh('d'));
    const date = '2026-10-01';
    const result = companionEventForMark({ before: s, after: toggled(s, 'a', date), today: TODAY, date, habitId: 'a' });
    expect(result.event).toBe('markPast');
    expect(result.ctx.streak).toBe(3);
  });
});

describe('companionEventForMark — прошлые дни (AC-49)', () => {
  const fresh = (id) => habit(id, `Привычка ${id}`, []);
  const past = (s, date, id = 'a') =>
    companionEventForMark({ before: s, after: toggled(s, id, date), today: TODAY, date, habitId: id });

  it('отметка прошлого дня, давшая новый рекорд (не веху) → newRecord', () => {
    // 10.10, 11.10, 13.10; отмечаем 12.10 → серия 4 > прежней лучшей 2.
    const s = st(habit('a', 'Бег', ['2026-10-10', '2026-10-11', TODAY]), fresh('b'), fresh('c'), fresh('d'));
    const result = past(s, '2026-10-12');
    expect(result.event).toBe('newRecord');
    expect(result.ctx.streak).toBe(4);
  });

  it('markPast важнее «всё выполнено»/первого закрытого дня: единственная привычка, отмечен вчерашний день', () => {
    expect(past(st(habit('a', 'Бег', [])), '2026-10-12').event).toBe('markPast');
  });

  it('markPast важнее «осталось N»: из трёх привычек отмечен прошлый день у одной', () => {
    const result = past(st(fresh('a'), fresh('b'), fresh('c')), '2026-10-05');
    expect(result.event).toBe('markPast');
    expect(result.ctx.habit).toBe('Привычка a');
  });

  it('прошлый день в прошлом месяце (30.09 при сегодня 13.10) → markPast', () => {
    expect(past(st(fresh('a'), fresh('b')), '2026-09-30').event).toBe('markPast');
  });

  it('снятие отметки прошлого дня → unmark', () => {
    const result = past(st(habit('a', 'Бег', ['2026-10-12']), fresh('b')), '2026-10-12');
    expect(result.event).toBe('unmark');
    expect(result.ctx.habit).toBe('Бег');
  });

  it('date указан, но отметка этого дня не изменилась → null', () => {
    const s = st(fresh('a'));
    const after = toggled(s, 'a', '2026-10-11');
    expect(companionEventForMark({ before: s, after, today: TODAY, date: '2026-10-12', habitId: 'a' })).toBeNull();
  });
});

describe('companionEventForAdd (AC-49)', () => {
  const h = (id, name) => habit(id, name, []);

  it('первая привычка (список был пуст) → firstHabit с названием', () => {
    expect(companionEventForAdd({ before: st(), after: st(h('a', 'Зарядка')) })).toEqual({
      event: 'firstHabit',
      ctx: { habit: 'Зарядка' },
    });
  });

  it('следующая привычка → added с названием новой (не прежней)', () => {
    const before = st(h('a', 'Зарядка'));
    const after = st(h('a', 'Зарядка'), h('b', 'Чтение'));
    expect(companionEventForAdd({ before, after })).toEqual({ event: 'added', ctx: { habit: 'Чтение' } });
  });

  it('название с HTML и «{name}» передаётся как есть', () => {
    const name = '<b>x</b> {name}';
    const result = companionEventForAdd({ before: st(h('a', 'A')), after: st(h('a', 'A'), h('b', name)) });
    expect(result.ctx.habit).toBe(name);
  });

  it('ничего не добавлено (тот же список или удаление) → null', () => {
    const s = st(h('a', 'A'), h('b', 'B'));
    expect(companionEventForAdd({ before: s, after: s })).toBeNull();
    expect(companionEventForAdd({ before: s, after: st(h('a', 'A')) })).toBeNull();
  });

  it('пустые или битые аргументы не ломают: null', () => {
    expect(companionEventForAdd()).toBeNull();
    expect(companionEventForAdd({ before: null, after: undefined })).toBeNull();
    expect(companionEventForAdd({ before: { habits: 'x' }, after: { habits: 42 } })).toBeNull();
  });
});
