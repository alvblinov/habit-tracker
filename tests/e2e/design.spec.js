import { test, expect } from '@playwright/test';

// Итерация 005: визуал и дизайн (AC-32…AC-35; AC-36 — прежние спеки без изменений).
// Фиксированный часовой пояс и управляемые часы: «сегодня» = 2026-10-13 (вторник).
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';
const YESTERDAY = '2026-10-12';
const SUNDAY = '2026-10-11';
const KEY = 'habit-tracker:v1';
const THEME_KEY = 'habit-tracker:theme';
const PALETTE = ['teal', 'purple', 'coral', 'pink', 'blue', 'green', 'amber', 'gray'];
const ALL7 = [1, 2, 3, 4, 5, 6, 7];
const MWF = [1, 3, 5];

const msk = (time, day = TODAY) => new Date(`${day}T${time}+03:00`);

/** Открыть страницу в фиксированный момент. */
async function openFixed(page, time = msk('12:00:00')) {
  await page.clock.setFixedTime(time);
  await page.goto('/');
}

/**
 * Записывает данные привычек и (при необходимости) тему один раз — до первой загрузки;
 * reload их не перезаписывает.
 */
async function seedStorage(page, data, theme) {
  await page.addInitScript(
    ({ key, text, themeKey, themeValue }) => {
      if (!sessionStorage.getItem('seeded')) {
        if (text !== null) localStorage.setItem(key, text);
        if (themeValue !== null) localStorage.setItem(themeKey, themeValue);
        sessionStorage.setItem('seeded', '1');
      }
    },
    { key: KEY, text: data ? JSON.stringify(data) : null, themeKey: THEME_KEY, themeValue: theme ?? null },
  );
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function addHabit(page, name, emoji) {
  await page.getByTestId('habit-name-input').fill(name);
  if (emoji) {
    await page.getByTestId('emoji-option').filter({ hasText: emoji }).click();
  }
  await page.getByTestId('add-habit').click();
}

function habit(id, name, emoji, done, { days = ALL7, color, createdAt = '2026-08-01' } = {}) {
  const h = { id, name, emoji, createdAt, done, reminder: null, days };
  if (color !== undefined) h.color = color;
  return h;
}

const seed = (...habits) => ({ version: 1, habits });

const cards = (page) => page.getByTestId('habit-card');
const cardById = (page, id) => page.locator(`[data-testid="habit-card"][data-habit-id="${id}"]`);
const cell = (card, date) => card.locator(`[data-testid="day-cell"][data-date="${date}"]`);
const colorOption = (card, key) => card.locator(`[data-testid="edit-color-option"][data-color="${key}"]`);
const statsRow = (page, id) => page.locator(`[data-testid="stats-row"][data-habit-id="${id}"]`);
const storedRaw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const storedHabits = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).habits, KEY);
const storedTheme = (page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);

async function openEdit(card) {
  await card.getByTestId('edit-habit').click();
  await expect(card.getByTestId('edit-form')).toBeVisible();
}

/** Вычисленный background-color элемента (строка rgb()/rgba()). */
const bgColor = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);

/** Первый непрозрачный background-color у элемента или его потомков (кружок цвета внутри label). */
const paintedColor = (locator) =>
  locator.evaluate((el) => {
    const transparent = (c) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
    for (const node of [el, ...el.querySelectorAll('*')]) {
      if (node.tagName === 'INPUT') continue;
      const c = getComputedStyle(node).backgroundColor;
      if (!transparent(c)) return c;
    }
    return null;
  });

/**
 * Все цвета, которыми «окрашены» элемент и его потомки: фон, рамки, тени (inset-полоска).
 * Возвращает список строк rgb(r, g, b) без альфа-канала.
 */
const usedColors = (locator) =>
  locator.evaluate((el) => {
    const out = new Set();
    const add = (text) => {
      for (const m of String(text).matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)) {
        if (m[4] !== undefined && Number(m[4]) === 0) continue;
        out.add(`rgb(${m[1]}, ${m[2]}, ${m[3]})`);
      }
    };
    for (const node of [el, ...el.querySelectorAll('*')]) {
      const s = getComputedStyle(node);
      add(s.backgroundColor);
      add(s.boxShadow);
      add(s.borderLeftColor);
      add(s.borderTopColor);
      add(s.accentColor);
    }
    return [...out];
  });

const opaque = (c) => c.replace(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/, 'rgb($1, $2, $3)');

/** Доля заполнения кольца по SVG (dasharray или dashoffset) и цвет его штриха. */
const ringGeometry = (page) =>
  page.getByTestId('progress-ring').evaluate((ring) => {
    const circles = [...ring.querySelectorAll('circle')].filter((c) => {
      const d = getComputedStyle(c).strokeDasharray;
      return d && d !== 'none';
    });
    const c = circles[circles.length - 1];
    if (!c) return null;
    const s = getComputedStyle(c);
    const nums = s.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter((n) => !Number.isNaN(n));
    const len = c.hasAttribute('pathLength') ? Number(c.getAttribute('pathLength')) : 2 * Math.PI * c.r.baseVal.value;
    const offset = parseFloat(s.strokeDashoffset) || 0;
    let fraction;
    if (nums[0] >= len * 0.999 && offset > 0) fraction = 1 - offset / len;
    else fraction = (nums[0] - offset) / len;
    return { fraction: Math.max(0, Math.min(1, fraction)), stroke: s.stroke };
  });

const rgbOf = (c) => {
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
};

/**
 * Контраст текста к его фактическому фону по WCAG 2.x (relative luminance).
 * Фон — первый непрозрачный фон вверх по дереву (полупрозрачные слои смешиваются).
 */
const contrastOf = (locator) =>
  locator.evaluate((el) => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    };
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) bg = over(layers[i], bg);
    let fg = parse(getComputedStyle(el).color);
    if (fg.a < 1) fg = over(fg, bg);
    const lum = ({ r, g, b }) => {
      const ch = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const l1 = lum(fg);
    const l2 = lum(bg);
    return {
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      textLum: l1,
      bgLum: l2,
    };
  });

/** Яркость фона страницы: тёмная тема — тёмный фон, светлая — светлый. */
const pageLuminance = (page) =>
  page.evaluate(() => {
    const parse = (c) => String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    let m = parse(getComputedStyle(document.body).backgroundColor);
    if (!m || m[4] === '0') m = parse(getComputedStyle(document.documentElement).backgroundColor);
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(+m[1]) + 0.7152 * ch(+m[2]) + 0.0722 * ch(+m[3]);
  });

async function expectDarkPage(page) {
  await expect.poll(() => pageLuminance(page)).toBeLessThan(0.1);
}

async function expectLightPage(page) {
  await expect.poll(() => pageLuminance(page)).toBeGreaterThan(0.6);
}

// ---------------------------------------------------------------------------

test.describe('цвет новой привычки и выбор цвета (AC-32)', () => {
  test('новые привычки получают разные цвета палитры; после reload цвета те же', async ({ page }) => {
    const errors = collectErrors(page);
    await openFixed(page);
    await addHabit(page, 'Вода', '💧');
    await addHabit(page, 'Чтение', '📚');
    await addHabit(page, 'Бег', '🏃');
    await expect(cards(page)).toHaveCount(3);

    const colors = await cards(page).evaluateAll((els) => els.map((el) => el.dataset.color));
    for (const c of colors) expect(PALETTE).toContain(c);
    expect(new Set(colors).size).toBe(3);

    // Цвет хранится в данных привычки (ключ палитры), а не только в разметке.
    expect((await storedHabits(page)).map((h) => h.color)).toEqual(colors);

    // Разные цвета действительно видны: плашки эмодзи окрашены по-разному.
    const plates = [];
    for (let i = 0; i < 3; i += 1) plates.push(await bgColor(cards(page).nth(i).getByTestId('habit-emoji')));
    expect(new Set(plates).size).toBe(3);

    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    expect(await cards(page).evaluateAll((els) => els.map((el) => el.dataset.color))).toEqual(colors);
    expect(errors).toEqual([]);
  });

  test('новая привычка не берёт цвет, уже занятый другими (первый свободный)', async ({ page }) => {
    await seedStorage(
      page,
      seed(habit('a', 'А', '📚', [], { color: 'teal' }), habit('b', 'Б', '💧', [], { color: 'coral' })),
    );
    await openFixed(page);
    await addHabit(page, 'Новая', '🌱');
    await expect(cards(page)).toHaveCount(3);
    const color = await cards(page).nth(2).getAttribute('data-color');
    expect(['teal', 'coral']).not.toContain(color);
    expect(color).toBe('purple');
  });

  test('форма ✏️: 8 цветов, отмечен текущий; выбор сохраняется и переживает reload; «Отмена» не меняет цвет', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [YESTERDAY, TODAY], { color: 'teal' })));
    await openFixed(page);
    const card = cardById(page, 'a');
    const plateBefore = await bgColor(card.getByTestId('habit-emoji'));

    await openEdit(card);
    const options = card.getByTestId('edit-color-option');
    await expect(options).toHaveCount(8);
    expect(await options.evaluateAll((els) => els.map((el) => el.dataset.color))).toEqual(PALETTE);
    // У каждого варианта есть доступное название (цвет различим не только визуально).
    const radios = card.locator('[data-testid="edit-color-option"] input[type="radio"]');
    await expect(radios).toHaveCount(8);
    for (const label of await radios.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))) {
      expect(label && label.trim()).toBeTruthy();
    }
    // Отмечен текущий цвет.
    await expect(colorOption(card, 'teal').locator('input[type="radio"]')).toBeChecked();
    await expect(card.locator('[data-testid="edit-color-option"] input[type="radio"]:checked')).toHaveCount(1);

    await colorOption(card, 'pink').click();
    await expect(colorOption(card, 'pink').locator('input[type="radio"]')).toBeChecked();
    await card.getByTestId('edit-save').click();
    await expect(card.getByTestId('edit-form')).toHaveCount(0);

    await expect(card).toHaveAttribute('data-color', 'pink');
    expect((await storedHabits(page))[0].color).toBe('pink');
    const plateAfter = await bgColor(card.getByTestId('habit-emoji'));
    expect(plateAfter).not.toBe(plateBefore);
    // Название, эмодзи, отметки и серия не пострадали.
    await expect(card.getByTestId('habit-name')).toHaveText('Читать');
    await expect(card.getByTestId('habit-emoji')).toHaveText('📚');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');

    await page.reload();
    await expect(cardById(page, 'a')).toHaveAttribute('data-color', 'pink');
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');

    // Выбрать другой цвет и нажать «Отмена» — цвет прежний.
    await openEdit(cardById(page, 'a'));
    await expect(colorOption(cardById(page, 'a'), 'pink').locator('input[type="radio"]')).toBeChecked();
    await colorOption(cardById(page, 'a'), 'blue').click();
    await cardById(page, 'a').getByTestId('edit-cancel').click();
    await expect(cardById(page, 'a')).toHaveAttribute('data-color', 'pink');
    expect((await storedHabits(page))[0].color).toBe('pink');

    // Esc тоже отменяет выбор цвета.
    await openEdit(cardById(page, 'a'));
    await colorOption(cardById(page, 'a'), 'green').click();
    await cardById(page, 'a').getByTestId('edit-name-input').press('Escape');
    await expect(cardById(page, 'a').getByTestId('edit-form')).toHaveCount(0);
    await expect(cardById(page, 'a')).toHaveAttribute('data-color', 'pink');
    expect(errors).toEqual([]);
  });

  test('можно выбрать каждый из 8 цветов; все 8 видимо различаются', async ({ page }) => {
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [TODAY], { color: 'gray' })));
    await openFixed(page);
    const card = cardById(page, 'a');
    const painted = new Map();
    for (const key of PALETTE) {
      await openEdit(card);
      await colorOption(card, key).click();
      await card.getByTestId('edit-save').click();
      await expect(card.getByTestId('edit-form')).toHaveCount(0);
      await expect(card).toHaveAttribute('data-color', key);
      expect((await storedHabits(page))[0].color).toBe(key);
      painted.set(key, await bgColor(card.getByTestId('toggle-today')));
    }
    expect(new Set(painted.values()).size).toBe(8);
  });

  test('старые данные без цвета открываются с цветами по порядку; битый цвет не ломает страницу', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(
      page,
      seed(
        habit('a', 'Первая', '📚', [YESTERDAY, TODAY]),
        habit('b', 'Вторая', '💧', []),
        habit('c', 'Третья', '🏃', [TODAY]),
        habit('d', 'Своя', '🧘', [], { color: 'amber' }),
        habit('e', 'Битая', '🌱', [], { color: 'neon"] body {display:none' }),
      ),
    );
    await openFixed(page);
    await expect(cards(page)).toHaveCount(5);
    expect(await cards(page).evaluateAll((els) => els.map((el) => el.dataset.color))).toEqual([
      'teal', 'purple', 'coral', 'amber', 'blue',
    ]);
    // Прежние данные целы.
    await expect(cardById(page, 'a').getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(cardById(page, 'e').getByTestId('habit-name')).toHaveText('Битая');
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 2 из 5');

    // Новая привычка получает цвет, не занятый ни одной из пяти.
    await addHabit(page, 'Новая', '⭐');
    const fresh = await cards(page).nth(5).getAttribute('data-color');
    expect(['teal', 'purple', 'coral', 'amber', 'blue']).not.toContain(fresh);
    expect(PALETTE).toContain(fresh);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe('где виден цвет привычки (AC-33)', () => {
  for (const scheme of ['light', 'dark']) {
    test(`плашка эмодзи, отмеченная кнопка, выполненные клетки и строка статистики — в цвете привычки (${scheme})`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.emulateMedia({ colorScheme: scheme });
      await seedStorage(
        page,
        seed(
          habit('a', 'Бирюза', '📚', [YESTERDAY, TODAY], { color: 'teal' }),
          habit('b', 'Фиолет', '💧', [YESTERDAY, TODAY], { color: 'purple' }),
          habit('c', 'Ещё бирюза', '🏃', [YESTERDAY], { color: 'teal' }),
          habit('d', 'Выходные', '🧘', [SUNDAY], { color: 'purple', days: MWF }),
        ),
      );
      await openFixed(page);
      const a = cardById(page, 'a');
      const b = cardById(page, 'b');
      const c = cardById(page, 'c');
      const d = cardById(page, 'd');

      // Отмеченная кнопка «сегодня» и выполненная клетка одной привычки — один цвет.
      await expect(a.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
      const aButton = await bgColor(a.getByTestId('toggle-today'));
      const bButton = await bgColor(b.getByTestId('toggle-today'));
      expect(await bgColor(cell(a, YESTERDAY))).toBe(aButton);
      expect(await bgColor(cell(a, TODAY))).toBe(aButton);
      expect(await bgColor(cell(b, YESTERDAY))).toBe(bButton);

      // У привычек разных цветов цвета различаются.
      expect(aButton).not.toBe(bButton);
      const aPlate = await bgColor(a.getByTestId('habit-emoji'));
      const bPlate = await bgColor(b.getByTestId('habit-emoji'));
      expect(aPlate).not.toBe(bPlate);

      // Плашка эмодзи окрашена (не прозрачна и не совпадает с фоном карточки).
      expect(aPlate).not.toMatch(/rgba\([^)]*,\s*0\)|transparent/);
      expect(aPlate).not.toBe(await bgColor(a));

      // Тот же цвет у другой привычки — та же окраска: цвет берётся из привычки.
      expect(await bgColor(c.getByTestId('habit-emoji'))).toBe(aPlate);
      expect(await bgColor(cell(c, YESTERDAY))).toBe(aButton);

      // Неотмеченная кнопка не окрашена цветом привычки; после отметки — окрашена.
      const cButton = c.getByTestId('toggle-today');
      await expect(cButton).toHaveAttribute('aria-pressed', 'false');
      expect(await bgColor(cButton)).not.toBe(aButton);
      await cButton.click();
      await expect(cButton).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => bgColor(cButton)).toBe(aButton);

      // Неотмеченная клетка отличается от выполненной (AC-5/AC-36).
      expect(await bgColor(cell(a, SUNDAY))).not.toBe(aButton);

      // Выполненная клетка в выходной день тоже в цвете привычки.
      await expect(cell(d, SUNDAY)).toHaveClass(/is-off/);
      expect(opaque(await bgColor(cell(d, SUNDAY)))).toBe(opaque(bButton));

      // Кружок цвета в форме ✏️ — тот же цвет, что и у отмеченной кнопки.
      await openEdit(a);
      expect(await paintedColor(colorOption(a, 'teal'))).toBe(aButton);
      expect(await paintedColor(colorOption(a, 'purple'))).toBe(bButton);
      await a.getByTestId('edit-cancel').click();

      // Строка статистики окрашена цветом своей привычки и не чужой.
      await page.getByTestId('stats-toggle').click();
      await expect(statsRow(page, 'a')).toBeVisible();
      await expect(statsRow(page, 'a')).toHaveAttribute('data-color', 'teal');
      await expect(statsRow(page, 'b')).toHaveAttribute('data-color', 'purple');
      const rowA = await usedColors(statsRow(page, 'a'));
      const rowB = await usedColors(statsRow(page, 'b'));
      expect(rowA).toContain(opaque(aButton));
      expect(rowB).toContain(opaque(bButton));
      expect(rowA).not.toContain(opaque(bButton));
      expect(rowB).not.toContain(opaque(aButton));

      expect(errors).toEqual([]);
    });
  }

  test('смена цвета в ✏️ перекрашивает кнопку, клетки и строку статистики', async ({ page }) => {
    await seedStorage(
      page,
      seed(
        habit('a', 'Читать', '📚', [YESTERDAY, TODAY], { color: 'teal' }),
        habit('b', 'Эталон', '💧', [TODAY], { color: 'coral' }),
      ),
    );
    await openFixed(page);
    const a = cardById(page, 'a');
    const coral = await bgColor(cardById(page, 'b').getByTestId('toggle-today'));
    expect(await bgColor(a.getByTestId('toggle-today'))).not.toBe(coral);

    await openEdit(a);
    await colorOption(a, 'coral').click();
    await a.getByTestId('edit-save').click();
    await expect(a).toHaveAttribute('data-color', 'coral');

    expect(await bgColor(a.getByTestId('toggle-today'))).toBe(coral);
    expect(await bgColor(cell(a, YESTERDAY))).toBe(coral);
    await page.getByTestId('stats-toggle').click();
    await expect(statsRow(page, 'a')).toHaveAttribute('data-color', 'coral');
    expect(await usedColors(statsRow(page, 'a'))).toContain(opaque(coral));
  });
});

// ---------------------------------------------------------------------------

test.describe('кольцо прогресса дня (AC-34)', () => {
  const ring = (page) => page.getByTestId('progress-ring');
  const ringLabel = (page) => page.getByTestId('progress-ring-label');

  async function expectRing(page, done, total, complete) {
    await expect(ringLabel(page)).toHaveText(`${done}/${total}`);
    await expect(ring(page)).toHaveAttribute('data-done', String(done));
    await expect(ring(page)).toHaveAttribute('data-total', String(total));
    await expect(ring(page)).toHaveAttribute('data-complete', String(complete));
    await expect(page.getByTestId('today-summary')).toHaveText(`Сегодня выполнено ${done} из ${total}`);
    const expected = total > 0 ? done / total : 0;
    await expect.poll(async () => (await ringGeometry(page)).fraction).toBeCloseTo(expected, 2);
  }

  test('0/0 без привычек → 0/2 → 1/2 → 2/2 «всё выполнено» → снятие отметки → удаление → reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFixed(page);

    await expect(ring(page)).toBeVisible();
    await expectRing(page, 0, 0, false);

    await addHabit(page, 'Вода', '💧');
    await addHabit(page, 'Чтение', '📚');
    await expectRing(page, 0, 2, false);

    await cards(page).nth(0).getByTestId('toggle-today').click();
    await expectRing(page, 1, 2, false);
    const partialStroke = (await ringGeometry(page)).stroke;

    await cards(page).nth(1).getByTestId('toggle-today').click();
    await expectRing(page, 2, 2, true);
    // Состояние «всё выполнено» — зелёное и отличается от частичного.
    const completeStroke = (await ringGeometry(page)).stroke;
    expect(completeStroke).not.toBe(partialStroke);
    const rgb = rgbOf(completeStroke);
    expect(rgb).not.toBeNull();
    expect(rgb.g).toBeGreaterThan(rgb.r);
    expect(rgb.g).toBeGreaterThan(rgb.b);

    await cards(page).nth(1).getByTestId('toggle-today').click();
    await expectRing(page, 1, 2, false);

    // Удаление неотмеченной привычки → 1/1, всё выполнено.
    page.once('dialog', (d) => d.accept());
    await cards(page).nth(1).getByTestId('delete-habit').click();
    await expect(cards(page)).toHaveCount(1);
    await expectRing(page, 1, 1, true);

    await page.reload();
    await expectRing(page, 1, 1, true);
    expect(errors).toEqual([]);
  });

  test('клик по сегодняшней клетке сетки обновляет кольцо', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, seed(habit('a', 'Читать', '📚', []), habit('b', 'Бег', '🏃', [])));
    await openFixed(page);
    await expectRing(page, 0, 2, false);
    await cell(cardById(page, 'a'), TODAY).click();
    await expectRing(page, 1, 2, false);
    // Клик по прошедшему дню кольцо не меняет.
    await cell(cardById(page, 'b'), YESTERDAY).click();
    await expectRing(page, 1, 2, false);
  });

  test('привычка с выходным сегодня не входит в Y: 1 отмеченная ежедневная → 1/1 «всё выполнено»', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // 2026-10-13 — вторник; «пн, ср, пт» сегодня не назначена.
    await seedStorage(page, seed(habit('a', 'Каждый день', '📚', [TODAY]), habit('b', 'Спортзал', '🏃', [], { days: MWF })));
    await openFixed(page);
    await expectRing(page, 1, 1, true);
  });
});

// ---------------------------------------------------------------------------

test.describe('тема оформления (AC-35)', () => {
  const toggle = (page) => page.getByTestId('theme-toggle');

  test('без ручного выбора тема следует системной настройке', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await openFixed(page);
    await expectDarkPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Включить светлую тему');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await storedTheme(page)).toBeNull();

    // Система переключилась на светлую — страница следует ей без перезагрузки.
    await page.emulateMedia({ colorScheme: 'light' });
    await expectLightPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Включить тёмную тему');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expectLightPage(page);
    expect(await storedTheme(page)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('кнопка переключает тему; выбор переживает reload и не трогает данные привычек', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(
      page,
      seed(
        habit('a', 'Читать', '📚', [YESTERDAY, TODAY], { color: 'teal' }),
        habit('b', 'Бег', '🏃', [SUNDAY], { color: 'coral', days: MWF }),
      ),
    );
    await page.addInitScript(() => localStorage.setItem('other-app', 'keep me'));
    await openFixed(page);
    await expectLightPage(page);
    await expect(cards(page)).toHaveCount(2);
    const before = await storedRaw(page);
    expect(before).not.toBeNull();

    await toggle(page).click();
    await expectDarkPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Включить светлую тему');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await storedTheme(page)).toBe('dark');
    expect(await storedRaw(page)).toBe(before);

    await page.reload();
    await expectDarkPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await storedRaw(page)).toBe(before);
    // Привычки и отметки на месте после смены темы и reload.
    await expect(cards(page)).toHaveCount(2);
    await expect(cardById(page, 'a').getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardById(page, 'b')).toHaveAttribute('data-color', 'coral');
    expect(await page.evaluate(() => localStorage.getItem('other-app'))).toBe('keep me');

    await toggle(page).click();
    await expectLightPage(page);
    expect(await storedTheme(page)).toBe('light');
    await page.reload();
    await expectLightPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Включить тёмную тему');
    expect(await storedRaw(page)).toBe(before);

    // Ручной выбор важнее системной настройки.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expectLightPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('сохранённая тёмная тема применяется при загрузке при светлой системной', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [TODAY])), 'dark');
    await openFixed(page);
    await expectDarkPage(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Включить светлую тему');
    await expect(cards(page)).toHaveCount(1);
  });

  test('битое значение темы игнорируется — работает системная тема, страница не ломается', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [TODAY])), 'purple');
    await openFixed(page);
    await expectDarkPage(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  const THEME_CASES = [
    { title: 'светлая системная', scheme: 'light', manual: null, dark: false },
    { title: 'тёмная системная', scheme: 'dark', manual: null, dark: true },
    { title: 'тёмная выбрана вручную', scheme: 'light', manual: 'dark', dark: true },
    { title: 'светлая выбрана вручную', scheme: 'dark', manual: 'light', dark: false },
  ];

  for (const { title, scheme, manual, dark } of THEME_CASES) {
    test(`основной текст читаем — контраст не ниже 4.5:1 (${title})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedStorage(
        page,
        seed(
          habit('a', 'Читать книгу', '📚', [TODAY], { color: 'teal' }),
          habit('b', 'Бег', '🏃', [], { color: 'amber' }),
        ),
        manual,
      );
      await openFixed(page);
      if (dark) await expectDarkPage(page);
      else await expectLightPage(page);

      const targets = [
        ['body', page.locator('body')],
        ['заголовок', page.locator('h1')],
        ['сводка дня', page.getByTestId('today-summary')],
        ['название привычки', cardById(page, 'a').getByTestId('habit-name')],
        ['название привычки 2', cardById(page, 'b').getByTestId('habit-name')],
        ['поле названия', page.getByTestId('habit-name-input')],
        ['кнопка «Добавить»', page.getByTestId('add-habit')],
        ['кнопка «Сегодня» (отмечена)', cardById(page, 'a').getByTestId('toggle-today')],
        ['кнопка «Сегодня» (не отмечена)', cardById(page, 'b').getByTestId('toggle-today')],
      ];
      for (const [name, locator] of targets) {
        const { ratio } = await contrastOf(locator);
        expect(ratio, `${name}: контраст ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }

      // Основной текст: светлый на тёмном в тёмной теме и наоборот.
      const body = await contrastOf(page.locator('body'));
      if (dark) expect(body.textLum).toBeGreaterThan(body.bgLum);
      else expect(body.textLum).toBeLessThan(body.bgLum);
    });
  }
});

// ===========================================================================
// Дополнение к итерации 005 (прогон 02): эмодзи Noto картинками, «оживление»,
// подпись об авторстве, фон с пастельными пятнами (AC-37…AC-40).

const EMOJI_CODES = {
  '💧': '1f4a7',
  '📚': '1f4da',
  '🏃': '1f3c3',
  '🧘': '1f9d8',
  '🥗': '1f957',
  '😴': '1f634',
  '✍️': '270d_fe0f',
  '💊': '1f48a',
  '🎸': '1f3b8',
  '🧹': '1f9f9',
  '🌱': '1f331',
  '⭐': '2b50',
};
const ALL_EMOJIS = Object.keys(EMOJI_CODES);
const svgOf = (char) => `emoji/${EMOJI_CODES[char]}.svg`;
const webpOf = (char) => `emoji/${EMOJI_CODES[char]}.webp`;

/** Все запросы страницы; внешние — http(s) не на адрес тестового сервера. */
function collectRequests(page, baseURL) {
  const own = new URL(baseURL).host;
  const all = [];
  const external = [];
  page.on('request', (req) => {
    const url = req.url();
    all.push(url);
    const u = new URL(url);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host !== own) external.push(url);
  });
  return { all, external };
}

const webpRequests = (requests) => requests.all.filter((u) => /\/emoji\/[^/]+\.webp(\?|$)/.test(u));

/**
 * Состояние эмодзи внутри элемента: картинка, её загрузка и виден ли символ системным шрифтом.
 * Загрузку проверяем через img.decode() (отклоняется для битой картинки) и ответ сервера
 * по тому же адресу; naturalWidth тоже возвращаем.
 */
const emojiImage = (locator) =>
  locator.evaluate(async (el) => {
    const imgs = el.querySelectorAll('img');
    const img = imgs[0];
    const text = el.textContent.trim();
    // Символ не рисуется шрифтом: каждый непустой текстовый узел лежит в контейнере
    // .visually-hidden, который обрезает содержимое (рамка ≤ 1×1, overflow hidden,
    // position absolute). Рамка Range не годится: она не учитывает overflow/clip предка.
    let visibleText = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const box = n.parentElement && n.parentElement.closest('.visually-hidden');
      if (!box) {
        visibleText = true;
        continue;
      }
      const r = box.getBoundingClientRect();
      const cs = getComputedStyle(box);
      const hidden =
        r.width <= 1 && r.height <= 1 && cs.overflow === 'hidden' && cs.position === 'absolute';
      if (!hidden) visibleText = true;
    }
    if (!img) return { count: 0, text, visibleText };
    let decoded = true;
    try {
      await img.decode();
    } catch {
      decoded = false;
    }
    let ok = false;
    let type = '';
    try {
      const res = await fetch(img.src);
      ok = res.ok;
      type = res.headers.get('content-type') || '';
    } catch {
      ok = false;
    }
    const rect = img.getBoundingClientRect();
    return {
      count: imgs.length,
      src: img.getAttribute('src'),
      sameOrigin: new URL(img.src).origin === location.origin,
      decoded,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      ok,
      type,
      width: rect.width,
      height: rect.height,
      text,
      visibleText,
      bounce: img.classList.contains('is-bounce'),
      animationName: getComputedStyle(img).animationName,
    };
  });

/** Эмодзи показан загруженной локальной картинкой Noto, символ — прежний, шрифтом не рисуется. */
async function expectNotoImage(locator, char, { animated = false } = {}) {
  const info = await emojiImage(locator);
  const where = `${char} (${animated ? 'анимация' : 'статичная'})`;
  expect(info.count, `${where}: одна картинка`).toBe(1);
  expect(info.src, where).toBe(animated ? webpOf(char) : svgOf(char));
  expect(info.sameOrigin, `${where}: картинка с того же адреса`).toBe(true);
  expect(info.decoded, `${where}: картинка декодируется`).toBe(true);
  expect(info.complete, where).toBe(true);
  expect(info.ok, `${where}: сервер отдал файл`).toBe(true);
  expect(info.type, where).toContain(animated ? 'webp' : 'svg');
  expect(info.width, `${where}: картинка видна`).toBeGreaterThan(0);
  expect(info.height, `${where}: картинка видна`).toBeGreaterThan(0);
  expect(info.text, `${where}: текст элемента — прежний символ`).toBe(char);
  expect(info.visibleText, `${where}: символ не рисуется системным шрифтом`).toBe(false);
  return info;
}

const habitEmoji = (page, id) => cardById(page, id).getByTestId('habit-emoji');

/**
 * Управляемые часы для эффекта на ~2 с: время ставится на паузу после загрузки,
 * таймеры срабатывают только по runFor.
 */
async function openWithClock(page) {
  await page.clock.install({ time: msk('12:00:00') });
  await page.goto('/');
  await page.clock.pauseAt(msk('12:01:00'));
}

// ---------------------------------------------------------------------------

test.describe('эмодзи Noto картинками (AC-37)', () => {
  test('все 12 эмодзи в форме добавления, ✏️, на карточке и в статистике — локальные картинки; внешних запросов нет', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(
      page,
      seed(...ALL_EMOJIS.map((e, i) => habit(`h${i}`, `Привычка ${i + 1}`, e, i % 2 ? [TODAY] : [YESTERDAY]))),
    );
    await openFixed(page);
    await expect(cards(page)).toHaveCount(12);

    // Форма добавления: 12 вариантов в прежнем порядке.
    const addOptions = page.getByTestId('emoji-option');
    await expect(addOptions).toHaveCount(12);
    expect(await addOptions.evaluateAll((els) => els.map((el) => el.dataset.emoji))).toEqual(ALL_EMOJIS);
    for (let i = 0; i < 12; i += 1) await expectNotoImage(addOptions.nth(i), ALL_EMOJIS[i]);

    // Плашки на карточках.
    for (let i = 0; i < 12; i += 1) await expectNotoImage(habitEmoji(page, `h${i}`), ALL_EMOJIS[i]);

    // Форма ✏️.
    const card = cardById(page, 'h0');
    await openEdit(card);
    const editOptions = card.getByTestId('edit-emoji-option');
    await expect(editOptions).toHaveCount(12);
    expect(await editOptions.evaluateAll((els) => els.map((el) => el.dataset.emoji))).toEqual(ALL_EMOJIS);
    for (let i = 0; i < 12; i += 1) await expectNotoImage(editOptions.nth(i), ALL_EMOJIS[i]);
    await card.getByTestId('edit-cancel').click();

    // Строка статистики.
    await page.getByTestId('stats-toggle').click();
    await expect(page.getByTestId('stats-panel')).toBeVisible();
    for (let i = 0; i < 12; i += 1) {
      const row = statsRow(page, `h${i}`);
      await expect(row).toBeVisible();
      await expectNotoImage(row.locator('.stats-emoji'), ALL_EMOJIS[i]);
    }

    // Работа с сайтом (отметка, тема, reload) тоже не обращается к внешним адресам.
    await cardById(page, 'h0').getByTestId('toggle-today').click();
    await page.getByTestId('theme-toggle').click();
    await page.reload();
    await expect(cards(page)).toHaveCount(12);
    await expectNotoImage(habitEmoji(page, 'h0'), '💧');

    expect(requests.external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('выбор эмодзи при добавлении и в ✏️ работает как прежде: в данных — символ, после reload — та же картинка', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFixed(page);

    // Без выбора — эмодзи по умолчанию ⭐ (прежнее поведение).
    await addHabit(page, 'Звезда');
    await addHabit(page, 'Гитара', '🎸');
    await addHabit(page, 'Письмо', '✍️');
    await expect(cards(page)).toHaveCount(3);
    expect((await storedHabits(page)).map((h) => h.emoji)).toEqual(['⭐', '🎸', '✍️']);
    await expectNotoImage(cards(page).nth(0).getByTestId('habit-emoji'), '⭐');
    await expectNotoImage(cards(page).nth(1).getByTestId('habit-emoji'), '🎸');
    await expectNotoImage(cards(page).nth(2).getByTestId('habit-emoji'), '✍️');

    // Смена эмодзи в ✏️.
    const second = cards(page).nth(1);
    await openEdit(second);
    await expect(second.locator('[data-testid="edit-emoji-option"][data-emoji="🎸"] input[type="radio"]')).toBeChecked();
    await second.locator('[data-testid="edit-emoji-option"][data-emoji="🧹"]').click();
    await second.getByTestId('edit-save').click();
    await expect(second.getByTestId('edit-form')).toHaveCount(0);
    expect((await storedHabits(page))[1].emoji).toBe('🧹');
    await expectNotoImage(cards(page).nth(1).getByTestId('habit-emoji'), '🧹');

    // В данных — символы Unicode, а не пути к картинкам.
    const raw = await storedRaw(page);
    expect(raw).not.toMatch(/\.svg|\.webp|emoji\//);

    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    await expectNotoImage(cards(page).nth(0).getByTestId('habit-emoji'), '⭐');
    await expectNotoImage(cards(page).nth(1).getByTestId('habit-emoji'), '🧹');
    await expectNotoImage(cards(page).nth(2).getByTestId('habit-emoji'), '✍️');
    expect(requests.external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('эмодзи вне набора в данных не ломает страницу: показывается картинка ⭐', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seed(habit('a', 'Чужой', '<img src=x onerror=alert(1)>', [TODAY])));
    await openFixed(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(cardById(page, 'a').getByTestId('habit-name')).toHaveText('Чужой');
    await expectNotoImage(habitEmoji(page, 'a'), '⭐');
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe('«оживление» эмодзи при отметке (AC-38)', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('кнопка «Сегодня» для 📚: анимация WebP ~2 с, затем снова статичная картинка; WebP грузится только при отметке', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [YESTERDAY]), habit('b', 'Вода', '💧', [])));
    await openWithClock(page);
    const a = habitEmoji(page, 'a');
    const b = habitEmoji(page, 'b');

    // До отметки — статичные картинки, анимация не загружалась.
    await expectNotoImage(a, '📚');
    await expect(a).not.toHaveAttribute('data-animating');
    expect(webpRequests(requests)).toEqual([]);

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(a).toHaveAttribute('data-animating', 'true');
    await expectNotoImage(a, '📚', { animated: true });
    expect(webpRequests(requests).some((u) => u.endsWith(webpOf('📚')))).toBe(true);
    // Другая привычка не «оживает».
    await expect(b).not.toHaveAttribute('data-animating');
    await expectNotoImage(b, '💧');

    // Через 1 с эффект ещё идёт.
    await page.clock.runFor(1000);
    await expect(a).toHaveAttribute('data-animating', 'true');
    expect((await emojiImage(a)).src).toBe(webpOf('📚'));

    // После ~2 с (с запасом) — снова статичная картинка; отметка и данные на месте.
    await page.clock.runFor(2000);
    await expect(a).not.toHaveAttribute('data-animating');
    await expectNotoImage(a, '📚');
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardById(page, 'a').getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    expect((await storedHabits(page))[0].done).toContain(TODAY);

    expect(requests.external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('клик по сегодняшней клетке тоже запускает анимацию', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seed(habit('a', 'Огород', '🌱', [])));
    await openWithClock(page);
    const a = habitEmoji(page, 'a');

    await cell(cardById(page, 'a'), TODAY).click();
    await expect(cell(cardById(page, 'a'), TODAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(a).toHaveAttribute('data-animating', 'true');
    await expectNotoImage(a, '🌱', { animated: true });

    await page.clock.runFor(3000);
    await expect(a).not.toHaveAttribute('data-animating');
    await expectNotoImage(a, '🌱');
    expect(errors).toEqual([]);
  });

  test('🏃, 🧘, 💊: без WebP, но с эффектом «подпрыгивания», затем эффект снимается', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await seedStorage(page, seed(habit('r', 'Бег', '🏃', []), habit('y', 'Йога', '🧘', []), habit('p', 'Витамины', '💊', [])));
    await openWithClock(page);

    for (const [id, char] of [['r', '🏃'], ['y', '🧘'], ['p', '💊']]) {
      const plate = habitEmoji(page, id);
      await cardById(page, id).getByTestId('toggle-today').click();
      await expect(plate).toHaveAttribute('data-animating', 'true');
      const info = await expectNotoImage(plate, char);
      expect(info.bounce, `${char}: класс эффекта`).toBe(true);
      // Эффект действительно виден: у картинки CSS-анимация.
      expect(info.animationName, `${char}: CSS-анимация`).not.toBe('none');

      await page.clock.runFor(3000);
      await expect(plate).not.toHaveAttribute('data-animating');
      const after = await expectNotoImage(plate, char);
      expect(after.bounce).toBe(false);
    }

    expect(webpRequests(requests)).toEqual([]);
    expect(requests.external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('снятие отметки (кнопкой и клеткой) эффект не запускает; снятие во время эффекта его прекращает', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await seedStorage(page, seed(habit('a', 'Читать', '📚', [TODAY]), habit('b', 'Бег', '🏃', [TODAY])));
    await openWithClock(page);
    const a = habitEmoji(page, 'a');
    const b = habitEmoji(page, 'b');

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expect(a).not.toHaveAttribute('data-animating');
    await expectNotoImage(a, '📚');

    await cell(cardById(page, 'b'), TODAY).click();
    await expect(cell(cardById(page, 'b'), TODAY)).toHaveAttribute('aria-pressed', 'false');
    await expect(b).not.toHaveAttribute('data-animating');
    expect((await expectNotoImage(b, '🏃')).bounce).toBe(false);
    expect(webpRequests(requests)).toEqual([]);

    // Отметить → эффект; сразу снять → эффекта нет (невыполненная привычка не «оживает»).
    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(a).toHaveAttribute('data-animating', 'true');
    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expect(a).not.toHaveAttribute('data-animating');
    await expectNotoImage(a, '📚');
    await page.clock.runFor(3000);
    await expect(a).not.toHaveAttribute('data-animating');
    expect(errors).toEqual([]);
  });

  test('отметка прошлого дня эффекта не даёт', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await seedStorage(page, seed(habit('a', 'Читать', '📚', []), habit('b', 'Бег', '🏃', [])));
    await openWithClock(page);

    await cell(cardById(page, 'a'), YESTERDAY).click();
    await expect(cell(cardById(page, 'a'), YESTERDAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(habitEmoji(page, 'a')).not.toHaveAttribute('data-animating');
    await expectNotoImage(habitEmoji(page, 'a'), '📚');

    await cell(cardById(page, 'b'), SUNDAY).click();
    await expect(cell(cardById(page, 'b'), SUNDAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(habitEmoji(page, 'b')).not.toHaveAttribute('data-animating');
    expect((await expectNotoImage(habitEmoji(page, 'b'), '🏃')).bounce).toBe(false);

    expect(webpRequests(requests)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('при prefers-reduced-motion: reduce — без анимации и без эффекта; отметка работает', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const requests = collectRequests(page, baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, seed(habit('a', 'Читать', '📚', []), habit('b', 'Бег', '🏃', [])));
    await openWithClock(page);

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(habitEmoji(page, 'a')).not.toHaveAttribute('data-animating');
    await expectNotoImage(habitEmoji(page, 'a'), '📚');

    await cell(cardById(page, 'b'), TODAY).click();
    await expect(cell(cardById(page, 'b'), TODAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(habitEmoji(page, 'b')).not.toHaveAttribute('data-animating');
    const info = await expectNotoImage(habitEmoji(page, 'b'), '🏃');
    expect(info.bounce).toBe(false);
    expect(info.animationName).toBe('none');

    expect(webpRequests(requests)).toEqual([]);
    expect((await storedHabits(page)).every((h) => h.done.includes(TODAY))).toBe(true);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe('подпись об авторстве эмодзи (AC-39)', () => {
  test('в подвале — «Эмодзи: Google Noto» с лицензиями и ссылкой на источник', async ({ page }) => {
    const errors = collectErrors(page);
    await openFixed(page);
    const credit = page.getByTestId('emoji-credit');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('Эмодзи');
    await expect(credit).toContainText('Google Noto');
    await expect(credit).toContainText('CC BY 4.0');
    await expect(credit).toContainText('Apache 2.0');

    const link = credit.getByRole('link');
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/\S/);
    await expect(link).toHaveAttribute('href', /^https:\/\/\S*noto/i);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // Подпись на месте и при привычках, и после reload.
    await addHabit(page, 'Вода', '💧');
    await page.reload();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('emoji-credit')).toBeVisible();
    await expect(page.getByTestId('emoji-credit')).toContainText('Google Noto');
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe('фон с пастельными пятнами (AC-40)', () => {
  /** Стиль псевдоэлемента фона body::before и сплошной фон страницы. */
  const backdrop = (page) =>
    page.evaluate(() => {
      const s = getComputedStyle(document.body, '::before');
      return {
        content: s.content,
        backgroundImage: s.backgroundImage,
        position: s.position,
        pointerEvents: s.pointerEvents,
        pageBg: getComputedStyle(document.documentElement).backgroundColor,
      };
    });

  /** Цвета пикселей скриншота окна в точках (доли ширины и высоты). */
  async function pixelsAt(page, points) {
    const png = (await page.screenshot()).toString('base64');
    return page.evaluate(
      async ({ data, pts }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return pts.map(([fx, fy]) => {
          const [r, g, b] = ctx.getImageData(Math.round(fx * canvas.width), Math.round(fy * canvas.height), 1, 1).data;
          return { r, g, b };
        });
      },
      { data: png, pts: points },
    );
  }

  const diff = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

  const BG_CASES = [
    { title: 'светлая системная', scheme: 'light', manual: null, dark: false },
    { title: 'тёмная системная', scheme: 'dark', manual: null, dark: true },
    { title: 'тёмная выбрана вручную', scheme: 'light', manual: 'dark', dark: true },
  ];

  for (const { title, scheme, manual, dark } of BG_CASES) {
    test(`неподвижные пятна radial-gradient видны на фоне и не перехватывают клики (${title})`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await seedStorage(page, seed(), manual);
      await openFixed(page);
      if (dark) await expectDarkPage(page);
      else await expectLightPage(page);

      const s = await backdrop(page);
      expect(s.content).not.toBe('none');
      expect((s.backgroundImage.match(/radial-gradient/g) || []).length).toBeGreaterThanOrEqual(3);
      expect(s.position).toBe('fixed');
      expect(s.pointerEvents).toBe('none');

      // Пятна действительно видны: в пустых полях страницы (вне колонки #app, 720px по центру)
      // пиксели отличаются от сплошного фона страницы, и разные пятна — разного цвета.
      const bg = rgbOf(s.pageBg);
      const [left, right] = await pixelsAt(page, [
        [0.12, 0.18],
        [0.88, 0.3],
      ]);
      expect(diff(left, bg), `левое пятно ${JSON.stringify(left)} vs фон ${s.pageBg}`).toBeGreaterThanOrEqual(4);
      expect(diff(right, bg), `правое пятно ${JSON.stringify(right)} vs фон ${s.pageBg}`).toBeGreaterThanOrEqual(4);
      expect(diff(left, right)).toBeGreaterThanOrEqual(2);

      // Пятна не перекрывают интерфейс: добавление привычки работает.
      await addHabit(page, 'Вода', '💧');
      await expect(cards(page)).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }

  test('в тёмной теме пятна другие (приглушённые), чем в светлой', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openFixed(page);
    await expectLightPage(page);
    const light = (await backdrop(page)).backgroundImage;
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectDarkPage(page);
    const darkImage = (await backdrop(page)).backgroundImage;
    expect(darkImage).toContain('radial-gradient');
    expect(darkImage).not.toBe(light);
  });

  for (const { title, scheme, manual, dark } of BG_CASES) {
    test(`основной текст читаем и поверх пятен — контраст не ниже 4.5:1 (${title})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await seedStorage(page, seed(habit('a', 'Читать книгу', '📚', [TODAY], { color: 'teal' })), manual);
      await openFixed(page);
      if (dark) await expectDarkPage(page);
      else await expectLightPage(page);

      // Худший случай: под текстом — сплошной фон страницы с наложенным цветом пятна
      // в его центре (альфа как задана, без учёта размытия).
      const result = await page.evaluate(() => {
        const parse = (c) => String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        const bgm = parse(getComputedStyle(document.documentElement).backgroundColor);
        const bg = { r: +bgm[1], g: +bgm[2], b: +bgm[3] };
        const image = getComputedStyle(document.body, '::before').backgroundImage;
        const blobs = [...image.matchAll(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g)]
          .map((m) => ({ r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }))
          .filter((c) => c.a > 0);
        const lum = ({ r, g, b }) => {
          const ch = (v) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
        };
        const unders = [
          bg,
          ...blobs.map((c) => ({
            r: c.r * c.a + bg.r * (1 - c.a),
            g: c.g * c.a + bg.g * (1 - c.a),
            b: c.b * c.a + bg.b * (1 - c.a),
          })),
        ];
        const out = [];
        for (const sel of ['body', 'h1']) {
          const fgm = parse(getComputedStyle(document.querySelector(sel)).color);
          const fg = { r: +fgm[1], g: +fgm[2], b: +fgm[3] };
          for (const under of unders) {
            const l1 = lum(fg);
            const l2 = lum(under);
            out.push({ sel, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) });
          }
        }
        return { blobs: blobs.length, out };
      });
      expect(result.blobs).toBeGreaterThanOrEqual(3);
      for (const { sel, ratio } of result.out) {
        expect(ratio, `${sel}: контраст ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
