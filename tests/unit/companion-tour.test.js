import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOUR_STEPS } from '../../src/companion-tour.js';

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
