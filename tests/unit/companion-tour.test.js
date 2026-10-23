import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOUR_STEPS, DEMO_HABIT, demoHabit, needsDemo } from '../../src/companion-tour.js';
import { addDays, isDateKey } from '../../src/dates.js';

// Расширение итерации 006: экскурсия из 6 шагов — форма, «Сегодня», сетка, 🔔, ✏️, статистика (AC-51).

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
const INDEX_HTML = read('../../index.html');
const MAIN_JS = read('../../src/main.js');

describe('TOUR_STEPS', () => {
  it('ровно 6 шагов с уникальными id', () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(6);
  });

  it('порядок по GOAL: форма → «Сегодня» → сетка → 🔔 → ✏️ → статистика', () => {
    expect(TOUR_STEPS.map((s) => s.target)).toEqual([
      '#add-form',
      '[data-testid="toggle-today"]',
      '.day-grid',
      '[data-testid="reminder-toggle"]',
      '[data-testid="edit-habit"]',
      '#stats-toggle',
    ]);
  });

  it('у каждого шага — непустые заголовок и текст без «{…}»', () => {
    for (const step of TOUR_STEPS) {
      for (const field of ['title', 'text']) {
        expect(typeof step[field], `${step.id}.${field}`).toBe('string');
        expect(step[field].trim().length, `${step.id}.${field}`).toBeGreaterThan(0);
        expect(step[field], `${step.id}.${field}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('шаги про элементы карточки (их нет без привычек) объясняют без подсветки — есть missingText', () => {
    // Шаги 2–5: «Сегодня», сетка, 🔔, ✏️ (порядок проверен выше).
    for (const step of TOUR_STEPS.slice(1, 5)) {
      expect(typeof step.missingText, step.target).toBe('string');
      expect(step.missingText.trim().length, step.target).toBeGreaterThan(0);
      expect(step.missingText, step.target).not.toMatch(/[{}]/);
    }
  });

  it('цели существуют: id — в index.html, data-testid и классы карточки — в разметке или в main.js', () => {
    for (const { target } of TOUR_STEPS) {
      let m;
      if ((m = target.match(/^#([\w-]+)$/))) {
        expect(INDEX_HTML, target).toContain(`id="${m[1]}"`);
      } else if ((m = target.match(/^\[data-testid="([\w-]+)"\]$/))) {
        const inHtml = INDEX_HTML.includes(`data-testid="${m[1]}"`);
        const inJs = MAIN_JS.includes(`dataset.testid = '${m[1]}'`);
        expect(inHtml || inJs, target).toBe(true);
      } else if ((m = target.match(/^\.([\w-]+)$/))) {
        const inHtml = new RegExp(`class="[^"]*\\b${m[1]}\\b`).test(INDEX_HTML);
        const inJs = new RegExp(`className = '[^']*\\b${m[1]}\\b`).test(MAIN_JS);
        expect(inHtml || inJs, target).toBe(true);
      } else {
        throw new Error(`Неожиданный формат цели: ${target}`);
      }
    }
  });
});

// Итерация 007: карточка-пример для экскурсии без привычек (AC-55, AC-56).
const GRID_DAYS = 30; // сетка карточки — последние 30 дней, справа сегодня

describe('demoHabit(today)', () => {
  it('пример «Пример: пить воду» 💧 с id tour-demo, все 7 дней недели', () => {
    const h = demoHabit('2026-10-13');
    expect(h.id).toBe('tour-demo');
    expect(h.name).toBe('Пример: пить воду');
    expect(h.emoji).toBe('💧');
    expect([...h.days].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DEMO_HABIT.id).toBe('tour-demo');
    expect(DEMO_HABIT.name).toBe('Пример: пить воду');
  });

  it('несколько отметок — только в прошлом и в пределах сетки 30 дней, сегодня не отмечено', () => {
    const today = '2026-10-13';
    const { done } = demoHabit(today);
    expect(done.length).toBeGreaterThanOrEqual(2);
    expect(new Set(done).size).toBe(done.length);
    const oldest = addDays(today, -(GRID_DAYS - 1));
    for (const d of done) {
      expect(isDateKey(d), d).toBe(true);
      expect(d < today, `${d} — должна быть раньше сегодня`).toBe(true);
      expect(d >= oldest, `${d} — вне сетки`).toBe(true);
    }
    expect(done).not.toContain(today);
  });

  it('даты отметок считаются от переданного today (управляемые часы), а не от реального дня', () => {
    const a = demoHabit('2026-10-13').done;
    const b = demoHabit('2026-10-20').done;
    expect(b).toEqual(a.map((d) => addDays(d, 7)));
    expect(b).not.toEqual(a);
  });

  it('смена месяца и года: даты валидные, в прошлом, без 30 февраля и 00-х чисел', () => {
    for (const today of ['2026-03-01', '2026-03-03', '2026-01-01', '2024-03-01']) {
      const { done, createdAt } = demoHabit(today);
      for (const d of done) {
        expect(isDateKey(d), `${today}: ${d}`).toBe(true);
        expect(d < today, `${today}: ${d}`).toBe(true);
      }
      // createdAt (если задан) — валидная дата не позже первой отметки, чтобы отметки считались.
      if (createdAt !== null && createdAt !== undefined) {
        expect(isDateKey(createdAt), `${today}: createdAt ${createdAt}`).toBe(true);
        expect(createdAt <= [...done].sort()[0], `${today}: createdAt ${createdAt}`).toBe(true);
      }
    }
    // 1 марта: все отметки — в феврале (или раньше), не в «марте с нулевым днём».
    for (const d of demoHabit('2026-03-01').done) expect(d < '2026-03-01').toBe(true);
    // 1 января: отметки — в декабре прошлого года.
    for (const d of demoHabit('2026-01-01').done) expect(d.startsWith('2025-12-'), d).toBe(true);
  });

  it('каждый вызов — новая копия: правка результата не меняет пример и следующие вызовы', () => {
    const first = demoHabit('2026-10-13');
    const snapshot = JSON.stringify(demoHabit('2026-10-13'));
    first.done.push('2026-10-13');
    first.days.length = 0;
    first.name = 'изменено';
    expect(JSON.stringify(demoHabit('2026-10-13'))).toBe(snapshot);
    expect(DEMO_HABIT.name).toBe('Пример: пить воду');
    expect(DEMO_HABIT.done).toEqual([]);
  });
});

describe('needsDemo(state)', () => {
  const habit = { id: 'a', name: 'Читать', emoji: '📚', createdAt: '2026-10-01', done: [], reminder: null, days: [1, 2, 3, 4, 5, 6, 7] };

  it('без привычек — нужен пример', () => {
    expect(needsDemo({ version: 1, habits: [] })).toBe(true);
  });

  it('есть хотя бы одна привычка — пример не нужен', () => {
    expect(needsDemo({ version: 1, habits: [habit] })).toBe(false);
    expect(needsDemo({ version: 1, habits: [habit, { ...habit, id: 'b' }] })).toBe(false);
  });

  it('некорректное состояние не ломает проверку и считается «привычек нет»', () => {
    expect(() => needsDemo(null)).not.toThrow();
    expect(needsDemo(null)).toBe(true);
    expect(needsDemo({})).toBe(true);
    expect(needsDemo({ habits: 'нет' })).toBe(true);
  });
});
