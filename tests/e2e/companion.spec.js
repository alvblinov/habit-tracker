import { test, expect } from '@playwright/test';
import { TOUR_STEPS } from '../../src/companion-tour.js';
import { QUICK_QUESTIONS, getAnswerEntry, answerText, unknownAnswer } from '../../src/companion-qa.js';
import { tipForDay } from '../../src/companion-tips.js';

// Итерация 006: помощник с выбором персонажа (AC-41…AC-46) и расширение 15.10.2026 —
// помощник-тренер и гид (AC-47…AC-54).
// Фиксированный часовой пояс и управляемые часы: «сегодня» = 2026-10-13 (вторник).
// Реплики выбираются случайно, поэтому проверяем повод (data-event у облачка),
// подстановки (название привычки, серия, «осталось», имя помощника) и отсутствие упрёков,
// а не конкретный текст.
//
// С расширения (AC-48) текст реплики печатается по буквам: полный текст сразу лежит в
// data-full-text у companion-bubble-text, а textContent наращивается по таймеру (25 мс/символ).
// Поэтому полный текст читаем из data-full-text, а печать проверяем отдельно на управляемых часах.
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';
const YESTERDAY = '2026-10-12';
const TOMORROW = '2026-10-14';
const KEY = 'habit-tracker:v1';
const COMPANION_KEY = 'habit-tracker:companion';
const THEME_KEY = 'habit-tracker:theme';
const ALL7 = [1, 2, 3, 4, 5, 6, 7];
const REPROACH = /пропуст|лентя|ленив|стыдн|позор|провал/i;
const BUBBLE_HIDE_MARGIN = 7000; // облачко скрывается через ~6 с — берём с запасом
const TYPE_MS = 25; // печать: мс на символ (план, AC-48)
const SETTLE_MS = 30_000; // хватает, чтобы показались и скрылись приветствие и совет дня

const CHARACTERS = [
  { id: 'cat', code: '1f431', name: 'Мурзик' },
  { id: 'fox', code: '1f98a', name: 'Алиса' },
  { id: 'panda', code: '1f43c', name: 'Пандуша' },
  { id: 'frog', code: '1f438', name: 'Квака' },
  { id: 'owl', code: '1f989', name: 'Софа' },
  { id: 'penguin', code: '1f427', name: 'Пин' },
  { id: 'hedgehog', code: '1f994', name: 'Колючка' },
];
const byId = (id) => CHARACTERS.find((c) => c.id === id);

const msk = (time, day = TODAY) => new Date(`${day}T${time}+03:00`);

/**
 * Записывает данные один раз — до первой загрузки; reload их не перезаписывает.
 * habits: объект состояния или null; companion: объект/строка или null; theme: строка или null.
 */
async function seedStorage(page, { habits = null, companion = null, theme = null } = {}) {
  await page.addInitScript(
    ({ key, habitsText, companionKey, companionText, themeKey, themeValue }) => {
      if (!sessionStorage.getItem('seeded')) {
        if (habitsText !== null) localStorage.setItem(key, habitsText);
        if (companionText !== null) localStorage.setItem(companionKey, companionText);
        if (themeValue !== null) localStorage.setItem(themeKey, themeValue);
        sessionStorage.setItem('seeded', '1');
      }
    },
    {
      key: KEY,
      habitsText: habits ? JSON.stringify(habits) : null,
      companionKey: COMPANION_KEY,
      companionText:
        companion === null ? null : typeof companion === 'string' ? companion : JSON.stringify(companion),
      themeKey: THEME_KEY,
      themeValue: theme,
    },
  );
}

/**
 * Знакомство пройдено: помощник выбран.
 * Расширение (AC-51, AC-52): по умолчанию экскурсию уже предлагали и совет дня сегодня уже был —
 * чтобы прежние проверки реплик не перемешивались с предложением экскурсии и советом дня.
 * Тесты экскурсии и совета задают эти поля явно через extra.
 */
const met = (character = 'cat', name = byId(character).name, enabled = true, extra = {}) => ({
  character,
  name,
  enabled,
  introduced: true,
  tourOffered: true,
  lastTipDate: TODAY,
  ...extra,
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Внешние запросы (не на адрес тестового сервера). */
function collectExternal(page, baseURL) {
  const own = new URL(baseURL).host;
  const external = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host !== own) external.push(req.url());
  });
  return external;
}

/** Все запросы страницы: адрес и тело. */
function collectRequests(page) {
  const all = [];
  page.on('request', (req) => all.push({ url: req.url(), body: req.postData() ?? '' }));
  return all;
}

/**
 * Журнал реплик: каждое значение data-event, выставленное облачку, — в window.__bubbleEvents.
 * Наблюдатель ставится до загрузки скриптов страницы, поэтому видит и реплики при загрузке.
 */
async function recordBubbleEvents(page) {
  await page.addInitScript(() => {
    window.__bubbleEvents = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target.getAttribute?.('data-testid') === 'companion-bubble') {
          window.__bubbleEvents.push(r.target.getAttribute('data-event'));
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-event'] });
  });
}
const bubbleEvents = (page) => page.evaluate(() => window.__bubbleEvents);

/** Заглушка системных уведомлений (без запросов разрешения и без настоящих уведомлений). */
async function stubNotifications(page) {
  await page.addInitScript(() => {
    class FakeNotification {
      constructor() {
        this.onclick = null;
      }
      close() {}
      static get permission() {
        return 'granted';
      }
      static requestPermission() {
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  });
}

/**
 * Управляемые часы: время ставится на паузу после загрузки (приветствие при загрузке к этому
 * моменту уже скрыто), таймер облачка срабатывает только по runFor.
 */
async function openPaused(page, time = msk('12:00:00')) {
  await page.clock.install({ time });
  await page.goto('/');
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
}

/** Открыть страницу с идущими часами — чтобы застать реплику при загрузке. */
async function openRunning(page, time = msk('12:00:00')) {
  await page.clock.install({ time });
  await page.goto('/');
}

function habit(id, name, done, { days = ALL7, emoji = '⭐', createdAt = '2026-08-01' } = {}) {
  return { id, name, emoji, createdAt, done, reminder: null, days };
}
const seed = (...habits) => ({ version: 1, habits });
const fresh = (id, name = `Привычка ${id}`) => habit(id, name, []);
/** n дней подряд, заканчивая днём end (включительно). */
function run(end, n) {
  const [y, m, d] = end.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d - (n - 1 - i)));
    return date.toISOString().slice(0, 10); // только арифметика календарных дат, не «сегодня»
  });
}

const intro = (page) => page.getByTestId('companion-intro');
const introTitle = (page) => page.getByTestId('companion-intro-title');
const option = (page, id) => page.locator(`[data-testid="companion-option"][data-character="${id}"]`);
const pick = (page, id) => page.locator(`[data-testid="companion-pick"][data-character="${id}"]`);
const companion = (page) => page.getByTestId('companion');
const companionImg = (page) => companion(page).locator('img');
const dock = (page) => page.getByTestId('companion-dock');
const bubble = (page) => page.getByTestId('companion-bubble');
const bubbleText = (page) => page.getByTestId('companion-bubble-text');
const bubbleName = (page) => page.getByTestId('companion-bubble-name');
const bubbleClose = (page) => page.getByTestId('companion-bubble-close');
const confettiPieces = (page) => page.getByTestId('companion-confetti').locator('.confetti-piece');
const menu = (page) => page.getByTestId('companion-menu');
const tour = (page) => page.getByTestId('companion-tour');
const tourStep = (page) => page.getByTestId('companion-tour-step');
const cards = (page) => page.getByTestId('habit-card');
const cardById = (page, id) => page.locator(`[data-testid="habit-card"][data-habit-id="${id}"]`);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cardByName = (page, name) =>
  cards(page).filter({
    has: page.getByTestId('habit-name').filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }),
  });
const cell = (card, date) => card.locator(`[data-testid="day-cell"][data-date="${date}"]`);

const storedRaw = (page, key = KEY) => page.evaluate((k) => localStorage.getItem(k), key);
const storedCompanion = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), COMPANION_KEY);

/** Полный текст текущей реплики (сразу, не дожидаясь печати). */
const fullText = async (page) => (await bubbleText(page).getAttribute('data-full-text')) ?? '';
/** Время показа облачка по требованию: max(6 с, символы × 25 мс + 4 с). */
const hideMsFor = (text) => Math.max(6000, [...text].length * TYPE_MS + 4000);

/**
 * Облачко видно, повод — event; полный текст непустой, без упрёков и без незаполненных «{…}»;
 * уже напечатанная часть — начало полного текста. literal — ожидаемый буквальный фрагмент
 * (например, название привычки с фигурными скобками): скобки внутри него допустимы, во всём
 * остальном тексте — нет. Возвращает полный текст.
 */
async function expectBubble(page, event, { literal = null } = {}) {
  await expect(bubble(page)).toBeVisible();
  await expect(bubble(page)).toHaveAttribute('data-event', event);
  const text = await fullText(page);
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text).not.toMatch(REPROACH);
  const rest = literal ? text.split(literal).join('') : text;
  expect(rest).not.toMatch(/[{}]/);
  const typed = (await bubbleText(page).textContent()) ?? '';
  expect(text.startsWith(typed), `напечатано «${typed}» — не начало «${text}»`).toBe(true);
  return text;
}

/** Закрыть облачко кнопкой «×» — чтобы следующая реплика была заметна как новая. */
async function closeBubble(page) {
  await bubbleClose(page).click();
  await expect(bubble(page)).toBeHidden();
}

async function openMenu(page) {
  await companion(page).click();
  await expect(menu(page)).toBeVisible();
}

async function rename(page, name) {
  await openMenu(page);
  await page.getByTestId('companion-rename').click();
  await page.getByTestId('companion-name-input').fill(name);
  await page.getByTestId('companion-rename-save').click();
}

async function ask(page, question) {
  if (!(await menu(page).isVisible())) await openMenu(page);
  await page.getByTestId('companion-ask-input').fill(question);
  await page.getByTestId('companion-ask-submit').click();
}

const intersects = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ---------------------------------------------------------------------------

test.describe('знакомство с помощником (AC-41)', () => {
  test('первое открытие: карточка из 7 персонажей, помощника ещё нет; выбор сохраняется после reload', async ({ page }) => {
    const errors = collectErrors(page);
    await openPaused(page);

    await expect(intro(page)).toBeVisible();
    await expect(introTitle(page)).toHaveText('Привет! Я буду помогать тебе с привычками. Кого выберешь?');
    const options = page.getByTestId('companion-option');
    await expect(options).toHaveCount(7);
    for (const c of CHARACTERS) {
      await expect(option(page, c.id)).toContainText(c.name);
      // В карточке знакомства — статичные SVG.
      await expect(option(page, c.id).locator('img')).toHaveAttribute('src', `companions/${c.code}.svg`);
    }
    await expect(page.getByTestId('companion-intro-skip')).toBeVisible();
    await expect(companion(page)).toBeHidden();
    await expect(page.getByTestId('companion-on')).toBeHidden();

    await option(page, 'owl').click();
    await expect(intro(page)).toBeHidden();
    await expect(companion(page)).toBeVisible();
    await expect(companion(page)).toHaveAttribute('data-character', 'owl');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Софа');
    // Помощник представляется.
    const text = await expectBubble(page, 'intro');
    expect(text).toContain('Софа');
    expect(await storedCompanion(page)).toMatchObject({ character: 'owl', name: 'Софа', enabled: true, introduced: true });

    await page.reload();
    await expect(companion(page)).toBeVisible();
    await expect(companion(page)).toHaveAttribute('data-character', 'owl');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Софа');
    await expect(intro(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('«Позже» без выбора → Мурзик; карточка больше не показывается после reload', async ({ page }) => {
    await openPaused(page);
    await expect(intro(page)).toBeVisible();
    await page.getByTestId('companion-intro-skip').click();

    await expect(intro(page)).toBeHidden();
    await expect(companion(page)).toHaveAttribute('data-character', 'cat');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Мурзик');
    expect(await storedCompanion(page)).toMatchObject({ character: 'cat', name: 'Мурзик', introduced: true });

    await page.reload();
    await expect(intro(page)).toBeHidden();
    await expect(companion(page)).toHaveAttribute('data-character', 'cat');
  });

  test('пользователь со старыми данными: «У нас новенький…» один раз; привычки не меняются', async ({ page }) => {
    const data = seed(habit('a', 'Пить воду', [YESTERDAY]), fresh('b', 'Читать'));
    await seedStorage(page, { habits: data });
    await openPaused(page);
    const rawBefore = await storedRaw(page);

    await expect(intro(page)).toBeVisible();
    await expect(introTitle(page)).toHaveText('У нас новенький — выбери себе помощника!');
    // Прежний список на месте.
    await expect(cardById(page, 'a')).toBeVisible();
    await expect(cardById(page, 'b')).toBeVisible();

    await option(page, 'hedgehog').click();
    await expect(companion(page)).toHaveAttribute('data-character', 'hedgehog');
    await page.reload();
    await expect(intro(page)).toBeHidden();
    await expect(companion(page)).toHaveAttribute('data-character', 'hedgehog');
    expect(await storedRaw(page)).toBe(rawBefore);
  });

  test('карточка знакомства не блокирует страницу: привычку можно добавить до выбора', async ({ page }) => {
    await openPaused(page);
    await expect(intro(page)).toBeVisible();
    await page.getByTestId('habit-name-input').fill('Зарядка');
    await page.getByTestId('add-habit').click();
    await expect(page.getByTestId('habit-card')).toHaveCount(1);
    await expect(page.getByTestId('habit-card')).toContainText('Зарядка');
    // Заголовок и карточка остаются до выбора.
    await expect(intro(page)).toBeVisible();
    await option(page, 'frog').click();
    await expect(companion(page)).toHaveAttribute('data-character', 'frog');
  });

  test('повреждённые настройки помощника не ломают страницу: знакомство показывается заново', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, { companion: '{oops' });
    await openPaused(page);
    await expect(intro(page)).toBeVisible();
    await expect(page.getByTestId('companion-option')).toHaveCount(7);
    await option(page, 'penguin').click();
    await expect(companion(page)).toHaveAttribute('data-character', 'penguin');
    expect(errors).toEqual([]);
  });
});

test.describe('помощник и меню (AC-42)', () => {
  test('анимированный WebP Noto из локальной папки; картинка загружается; внешних запросов нет', async ({ page, baseURL }) => {
    const external = collectExternal(page, baseURL);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedStorage(page, { companion: met('fox') });
    await openPaused(page);

    await expect(companionImg(page)).toHaveAttribute('src', 'companions/1f98a.webp');
    const loaded = await companionImg(page).evaluate(async (img) => {
      try {
        await img.decode();
        return img.naturalWidth > 0;
      } catch {
        return false;
      }
    });
    expect(loaded).toBe(true);
    expect(external).toEqual([]);
  });

  test('при reduced motion — статичный SVG', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, { companion: met('panda') });
    await openPaused(page);
    await expect(companionImg(page)).toHaveAttribute('src', 'companions/1f43c.svg');
  });

  test('клик по персонажу: меню и реплика poke; Esc закрывает и возвращает фокус; клик вне — закрывает', async ({ page }) => {
    await seedStorage(page, { companion: met('cat') });
    await openPaused(page);

    await openMenu(page);
    await expectBubble(page, 'poke');
    await expect(page.getByTestId('companion-change')).toBeVisible();
    await expect(page.getByTestId('companion-rename')).toBeVisible();
    await expect(page.getByTestId('companion-off')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(companion(page)).toBeFocused();

    await openMenu(page);
    await page.locator('h1').click();
    await expect(menu(page)).toBeHidden();
  });

  test('смена персонажа: новое имя по умолчанию, представление; сохраняется после reload', async ({ page }) => {
    await seedStorage(page, { companion: met('cat') });
    await openPaused(page);

    await openMenu(page);
    await page.getByTestId('companion-change').click();
    await expect(page.getByTestId('companion-pick')).toHaveCount(7);
    await pick(page, 'fox').click();

    await expect(menu(page)).toBeHidden();
    await expect(companion(page)).toHaveAttribute('data-character', 'fox');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Алиса');
    await expect(companionImg(page)).toHaveAttribute('src', /companions\/1f98a\.(webp|svg)$/);
    expect(await expectBubble(page, 'intro')).toContain('Алиса');

    await page.reload();
    await expect(companion(page)).toHaveAttribute('data-character', 'fox');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Алиса');
  });

  test('переименование: новое имя в подписи и реплике, сохраняется после reload', async ({ page }) => {
    await seedStorage(page, { companion: met('fox') });
    await openPaused(page);

    await openMenu(page);
    await page.getByTestId('companion-rename').click();
    await expect(page.getByTestId('companion-name-input')).toHaveAttribute('maxlength', '20');
    await page.getByTestId('companion-name-input').fill('  Рыжик  ');
    await page.getByTestId('companion-rename-save').click();

    await expect(menu(page)).toBeHidden();
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Рыжик');
    expect(await expectBubble(page, 'intro')).toContain('Рыжик');
    expect((await storedCompanion(page)).name).toBe('Рыжик');

    await page.reload();
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Рыжик');
    await expect(companion(page)).toHaveAttribute('data-character', 'fox');
  });

  test('пустое имя и одни пробелы не сохраняются: ошибка, прежнее имя остаётся', async ({ page }) => {
    await seedStorage(page, { companion: met('owl') });
    await openPaused(page);

    await openMenu(page);
    await page.getByTestId('companion-rename').click();
    for (const value of ['', '     ']) {
      await page.getByTestId('companion-name-input').fill(value);
      await page.getByTestId('companion-rename-save').click();
      await expect(page.getByTestId('companion-rename-error')).toBeVisible();
      await expect(page.getByTestId('companion-rename-form')).toBeVisible();
      await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Софа');
      expect((await storedCompanion(page)).name).toBe('Софа');
    }

    await page.reload();
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Софа');
  });

  test('имя длиннее 20 символов в поле не помещается', async ({ page }) => {
    await seedStorage(page, { companion: met('cat') });
    await openPaused(page);
    await openMenu(page);
    await page.getByTestId('companion-rename').click();
    const input = page.getByTestId('companion-name-input');
    await input.fill('');
    await input.pressSequentially('А'.repeat(25));
    await expect(input).toHaveValue('А'.repeat(20));
    await page.getByTestId('companion-rename-save').click();
    await expect(companion(page)).toHaveAttribute('aria-label', `Помощник ${'А'.repeat(20)}`);
  });
});

test.describe('реплики на поводы (AC-43, AC-44)', () => {
  test('при загрузке — приветствие утром со сводкой дня', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(habit('a', 'Пить воду', [TODAY]), fresh('b')),
      companion: met('cat'),
    });
    await openRunning(page, msk('08:00:00'));
    const text = await expectBubble(page, 'greeting');
    expect(text).toMatch(/утр/i);
    expect(text).toContain('1 из 2');
  });

  test('при загрузке вечером — вечернее приветствие', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('owl') });
    await openRunning(page, msk('20:00:00'));
    const text = await expectBubble(page, 'greeting');
    expect(text).toMatch(/вечер/i);
    expect(text).toContain('0 из 1');
  });

  test('без привычек — реплика empty (предложить добавить первую)', async ({ page }) => {
    await seedStorage(page, { companion: met('frog') });
    await openRunning(page);
    await expectBubble(page, 'empty');
  });

  test('приветствие при загрузке скрывается само', async ({ page }) => {
    // Совет дня сегодня уже был (met: lastTipDate = сегодня) — после приветствия ничего не показывается.
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat') });
    await openRunning(page);
    const text = await expectBubble(page, 'greeting');
    await page.clock.runFor(hideMsFor(text) + 1000);
    await expect(bubble(page)).toBeHidden();
  });

  test('отметка кнопкой «Сегодня»: повод mark и название привычки', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(fresh('a', 'Пить воду'), fresh('b'), fresh('c'), fresh('d')),
      companion: met('cat'),
    });
    await openPaused(page);
    await expect(bubble(page)).toBeHidden();

    await cardById(page, 'a').getByTestId('toggle-today').click();
    expect(await expectBubble(page, 'mark')).toContain('Пить воду');
  });

  // Было (прогоны 01–02): клетка прошлого дня реплику не вызывала. Стало (AC-49): реплика на любую
  // клетку — прошлый день даёт markPast с названием привычки.
  test('отметка клеткой сегодняшнего дня — mark; клетка прошлого дня — markPast', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(fresh('a', 'Пить воду'), fresh('b', 'Читать'), fresh('c'), fresh('d')),
      companion: met('penguin'),
    });
    await openPaused(page);
    await expect(bubble(page)).toBeHidden();

    await cell(cardById(page, 'b'), YESTERDAY).click();
    await expect(cell(cardById(page, 'b'), YESTERDAY)).toHaveAttribute('aria-pressed', 'true');
    expect(await expectBubble(page, 'markPast')).toContain('Читать');

    await cell(cardById(page, 'a'), TODAY).click();
    expect(await expectBubble(page, 'mark')).toContain('Пить воду');
  });

  // Было: серия 3 → markStreak «3 дня». Стало (AC-49): 3 — веха, поэтому «серия ≥ 2, не рекорд»
  // проверяется на серии 4 (лучшая серия — 5 дней в августе).
  test('серия ≥ 2 (не веха и не рекорд): повод markStreak, серия «4 дня»', async ({ page }) => {
    const a = habit('a', 'Читать', [...run('2026-08-05', 5), '2026-10-10', '2026-10-11', YESTERDAY]);
    await seedStorage(page, { habits: seed(a, fresh('b'), fresh('c'), fresh('d')), companion: met('panda') });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    const text = await expectBubble(page, 'markStreak');
    expect(text).toContain('Читать');
    expect(text).toContain('4 дня');
  });

  test('«осталось N до закрытия дня»: повод remaining и число оставшихся', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(fresh('a', 'Пить воду'), fresh('b'), fresh('c')),
      companion: met('cat'),
    });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    expect(await expectBubble(page, 'remaining')).toContain('2 привычки');

    await cardById(page, 'b').getByTestId('toggle-today').click();
    expect(await expectBubble(page, 'remaining')).toContain('1 привычка');
  });

  // Было: первый же закрытый день → allDone. Стало (AC-49): самый первый закрытый день —
  // firstDayClosed (отдельный тест ниже), allDone — когда закрытые дни уже были (засеян 10.10).
  test('всё выполнено: повод allDone на последней привычке дня (закрытые дни уже были)', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(habit('a', 'Пить воду', ['2026-10-10', TODAY]), habit('b', 'Читать', ['2026-10-10'])),
      companion: met('frog'),
    });
    await openPaused(page);
    await cardById(page, 'b').getByTestId('toggle-today').click();
    await expectBubble(page, 'allDone');
  });

  test('новый рекорд серии: повод newRecord с названием и серией', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(habit('a', 'Читать', [YESTERDAY]), fresh('b'), fresh('c'), fresh('d')),
      companion: met('owl'),
    });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    const text = await expectBubble(page, 'newRecord');
    expect(text).toContain('Читать');
    expect(text).toContain('2 дня');
  });

  test('снятие отметки: повод unmark, мягко и без упрёков', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(habit('a', 'Бег', [YESTERDAY, TODAY]), fresh('b')),
      companion: met('hedgehog'),
    });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expectBubble(page, 'unmark');
  });

  // Было: у облачка не было вложенных элементов (bubble *) и проверялся textContent всего облачка.
  // Стало (AC-48): в облачке имя, «×» и текст — без элементов должен быть текст реплики
  // (companion-bubble-text), а после печати его textContent равен полному тексту.
  test('HTML и «{name}» в названии выводятся как текст', async ({ page }) => {
    const name = '<b>Жирный</b> {name}';
    await seedStorage(page, {
      habits: seed(fresh('a', name), fresh('b'), fresh('c'), fresh('d')),
      companion: met('cat', 'Барсик'),
    });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    const text = await expectBubble(page, 'mark', { literal: name });
    expect(text).toContain(name);
    // «{name}» из названия не подставлен повторно именем помощника.
    expect(text).not.toContain('Барсик');
    await page.clock.runFor([...text].length * TYPE_MS + 100);
    await expect(bubbleText(page)).toHaveText(text);
    await expect(bubbleText(page).locator('*')).toHaveCount(0);
    await expect(bubble(page).locator('b')).toHaveCount(0);
  });

  // Было: скрытие ровно через ~6 с (порог 7 с). Стало (AC-48): показ = max(6 с, печать + 4 с) —
  // срок второй реплики считается по её длине.
  test('облачко скрывается само; новая реплика заменяет прежнюю и продлевает показ', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(fresh('a', 'Пить воду'), fresh('b', 'Читать'), fresh('c'), fresh('d'), fresh('e')),
      companion: met('cat'),
    });
    await openPaused(page);

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expectBubble(page, 'mark');
    await page.clock.runFor(4000);
    await expect(bubble(page)).toBeVisible();

    // Новая реплика: одно облачко, другой текст про другую привычку.
    await cardById(page, 'b').getByTestId('toggle-today').click();
    await expect(page.getByTestId('companion-bubble')).toHaveCount(1);
    const second = await expectBubble(page, 'mark');
    expect(second).toContain('Читать');
    const hideAt = hideMsFor(second);

    // 8 с от первой реплики, 4 с от второй — ещё видно.
    await page.clock.runFor(4000);
    await expect(bubble(page)).toBeVisible();
    await page.clock.runFor(hideAt - 4000 - 300);
    await expect(bubble(page)).toBeVisible();
    await page.clock.runFor(600);
    await expect(bubble(page)).toBeHidden();
  });
});

test.describe('выключение и включение (AC-45)', () => {
  test('выключенный помощник не показывается и не говорит; после reload выключен; включение возвращает персонажа и имя', async ({ page }) => {
    await seedStorage(page, {
      habits: seed(fresh('a', 'Пить воду'), fresh('b'), fresh('c'), fresh('d')),
      companion: met('fox'),
    });
    await openPaused(page);
    await rename(page, 'Рыжик');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Рыжик');

    await openMenu(page);
    await page.getByTestId('companion-off').click();
    await expect(companion(page)).toBeHidden();
    await expect(bubble(page)).toBeHidden();
    await expect(page.getByTestId('companion-on')).toBeVisible();
    await expect(page.getByTestId('companion-on')).toHaveText('Включить помощника');
    // Кнопка включения — в шапке (AC-47: сам помощник — в углу).
    await expect(page.locator('header').getByTestId('companion-on')).toBeVisible();

    // Не говорит при отметке.
    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(bubble(page)).toBeHidden();

    await page.reload();
    await expect(companion(page)).toBeHidden();
    await expect(bubble(page)).toBeHidden();
    await expect(intro(page)).toBeHidden();
    await expect(page.getByTestId('companion-on')).toBeVisible();

    await page.getByTestId('companion-on').click();
    await expect(companion(page)).toBeVisible();
    await expect(companion(page)).toHaveAttribute('data-character', 'fox');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Рыжик');
    await expect(page.getByTestId('companion-on')).toBeHidden();
    await expectBubble(page, 'greeting');

    await page.reload();
    await expect(companion(page)).toHaveAttribute('data-character', 'fox');
    await expect(companion(page)).toHaveAttribute('aria-label', 'Помощник Рыжик');
  });
});

test.describe('данные привычек не меняются (AC-46)', () => {
  test('знакомство, меню, смена, переименование, выкл/вкл не меняют habit-tracker:v1 и тему', async ({ page }) => {
    const data = seed(habit('a', 'Пить воду', [YESTERDAY, TODAY]), fresh('b', 'Читать'));
    await seedStorage(page, { habits: data, theme: 'dark' });
    await openPaused(page);
    const rawBefore = await storedRaw(page);
    expect(rawBefore).not.toBeNull();

    await option(page, 'cat').click();
    await openMenu(page);
    await page.getByTestId('companion-change').click();
    await pick(page, 'penguin').click();
    await rename(page, 'Капитан');
    await openMenu(page);
    await page.keyboard.press('Escape');
    await openMenu(page);
    await page.getByTestId('companion-off').click();
    await page.getByTestId('companion-on').click();
    await page.clock.runFor(BUBBLE_HIDE_MARGIN);

    expect(await storedRaw(page)).toBe(rawBefore);
    expect(await storedRaw(page, THEME_KEY)).toBe('dark');
    expect(await storedCompanion(page)).toMatchObject({
      character: 'penguin',
      name: 'Капитан',
      enabled: true,
      introduced: true,
    });

    await page.reload();
    expect(await storedRaw(page)).toBe(rawBefore);
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardById(page, 'b').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ===========================================================================
// Расширение итерации 006 (15.10.2026): помощник-тренер и гид (AC-47…AC-54).

const manyHabits = (n = 8) =>
  seed(...Array.from({ length: n }, (_, i) => fresh(`h${i}`, i === n - 1 ? 'Последняя' : `Привычка ${i + 1}`)));

test.describe('место помощника: правый нижний угол (AC-47)', () => {
  test('виджет fixed внизу справа; при прокрутке к последней карточке остаётся на месте и виден', async ({ page }) => {
    await seedStorage(page, { habits: manyHabits(), companion: met('cat') });
    await openPaused(page);

    await expect(dock(page)).toBeVisible();
    expect(await dock(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrollable, 'страница должна прокручиваться, иначе проверка не имеет смысла').toBe(true);

    const vp = page.viewportSize();
    const top = await companion(page).boundingBox();
    const right = vp.width - (top.x + top.width);
    const bottom = vp.height - (top.y + top.height);
    expect(right).toBeGreaterThanOrEqual(8);
    expect(right).toBeLessThanOrEqual(40);
    expect(bottom).toBeGreaterThanOrEqual(8);
    expect(bottom).toBeLessThanOrEqual(40);

    await cardById(page, 'h7').scrollIntoViewIfNeeded();
    await expect(cardById(page, 'h7')).toBeInViewport();
    await expect(companion(page)).toBeInViewport();
    const after = await companion(page).boundingBox();
    expect(Math.abs(after.x - top.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - top.y)).toBeLessThanOrEqual(1);

    // Персонаж — поверх карточек и принимает клики.
    const onTop = await companion(page).evaluate((btn) => {
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return btn.contains(el);
    });
    expect(onTop).toBe(true);
  });

  test('в самом низу страницы помощник не закрывает элементы последней карточки; клики по клеткам и «Удалить» проходят даже под облачком', async ({ page }) => {
    const errors = collectErrors(page);
    // У h7 — прежняя серия 5 дней (26–30.09), вне текущей: отметка «сегодня» даёт серию 1 → mark
    // (осталось 7), отметка «вчера» — серию 2 < рекорда 5 → markPast, а не newRecord.
    const habits = seed(...manyHabits().habits.slice(0, 7), habit('h7', 'Последняя', run('2026-09-30', 5)));
    await seedStorage(page, { habits, companion: met('cat') });
    await openPaused(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const last = cardById(page, 'h7');
    await expect(last).toBeInViewport();
    const persona = await companion(page).boundingBox();
    const controls = [
      last.getByTestId('toggle-today'),
      last.getByTestId('delete-habit'),
      last.getByTestId('reminder-toggle'),
      last.getByTestId('edit-habit'),
      cell(last, TODAY),
      cell(last, YESTERDAY),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(intersects(persona, box), 'персонаж перекрывает элемент последней карточки').toBe(false);
    }

    // Клетка сегодняшнего дня последней карточки.
    await cell(last, TODAY).click();
    await expect(cell(last, TODAY)).toHaveAttribute('aria-pressed', 'true');
    expect(await expectBubble(page, 'mark')).toContain('Последняя');

    // Облачко клики не перехватывает: в его середине — элемент страницы, а не облачко.
    const passThrough = await bubbleText(page).evaluate((textEl) => {
      const bubbleEl = textEl.closest('[data-testid="companion-bubble"]');
      const r = textEl.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !bubbleEl.contains(el);
    });
    expect(passThrough).toBe(true);

    // Клетка прошлого дня — при видимом облачке.
    await cell(last, YESTERDAY).click();
    await expect(cell(last, YESTERDAY)).toHaveAttribute('aria-pressed', 'true');
    await expectBubble(page, 'markPast');

    // «Удалить» последней карточки — при видимом облачке.
    await expect(bubble(page)).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await last.getByTestId('delete-habit').click();
    await expect(cards(page)).toHaveCount(7);
    await expect(cardByName(page, 'Последняя')).toHaveCount(0);
    expect(await expectBubble(page, 'deleted')).toContain('Последняя');
    expect(errors).toEqual([]);
  });

  test('узкий экран (380×700): помощник в правом нижнем углу и в пределах экрана', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 700 });
    await seedStorage(page, { habits: manyHabits(), companion: met('frog') });
    await openPaused(page);
    await expect(companion(page)).toBeInViewport({ ratio: 1 });
    const box = await companion(page).boundingBox();
    expect(380 - (box.x + box.width)).toBeLessThanOrEqual(40);
    expect(700 - (box.y + box.height)).toBeLessThanOrEqual(40);
    // Облачко реплики целиком на экране.
    await cardById(page, 'h0').getByTestId('toggle-today').click();
    await expectBubble(page, 'mark');
    await expect(bubble(page)).toBeInViewport({ ratio: 1 });
  });
});

test.describe('новое облачко: имя, «закрыть», акцент, печать (AC-48)', () => {
  test('заголовок — имя помощника; «×» закрывает; цвет акцента у разных персонажей разный', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a', 'Пить воду'), fresh('b'), fresh('c'), fresh('d')), companion: met('fox', 'Рыжик') });
    await openPaused(page);

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expectBubble(page, 'mark');
    await expect(bubbleName(page)).toHaveText('Рыжик');
    await expect(bubbleClose(page)).toBeVisible();
    await expect(bubbleClose(page)).toHaveAccessibleName(/закрыть/i);
    await expect(bubble(page)).toHaveAttribute('data-accent', 'orange');
    const foxBorder = await bubble(page).evaluate((el) => getComputedStyle(el).borderTopColor);

    await closeBubble(page);

    await openMenu(page);
    await page.getByTestId('companion-change').click();
    await pick(page, 'frog').click();
    await expectBubble(page, 'intro');
    await expect(bubbleName(page)).toHaveText('Квака');
    await expect(bubble(page)).toHaveAttribute('data-accent', 'green');
    const frogBorder = await bubble(page).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(frogBorder).not.toBe(foxBorder);
    for (const color of [foxBorder, frogBorder]) expect(color).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test('текст печатается по буквам на управляемых часах и появляется полностью; показ = max(6 с, печать + 4 с)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat') });
    await openPaused(page);

    // Длинный детерминированный текст — ответ на вопрос (печать дольше 2.5 с).
    await ask(page, 'Как настроить напоминание?');
    await expect(bubble(page)).toHaveAttribute('data-event', 'answer');
    const full = answerText(getAnswerEntry('reminder'), 'cat');
    await expect(bubbleText(page)).toHaveAttribute('data-full-text', full);
    await expect(bubbleText(page)).toHaveAttribute('aria-label', full);
    await expect(bubble(page)).toHaveAttribute('aria-busy', 'true');
    const n = [...full].length;
    const hideAt = hideMsFor(full);
    expect(hideAt, 'текст должен печататься дольше 2.5 с, чтобы проверка отличала печать от 6 с').toBeGreaterThan(6500);

    expect(await bubbleText(page).textContent()).toBe('');
    await page.clock.runFor(100);
    const partial = await bubbleText(page).textContent();
    expect(partial.length).toBeGreaterThanOrEqual(2);
    expect(partial.length).toBeLessThanOrEqual(6);
    expect(full.startsWith(partial)).toBe(true);

    await page.clock.runFor(n * TYPE_MS);
    await expect(bubbleText(page)).toHaveText(full);
    await expect(bubble(page)).toHaveAttribute('aria-busy', 'false');

    // Уже после 6 с, но до «печать + 4 с» — ещё видно; после — скрыто.
    const elapsed = 100 + n * TYPE_MS;
    await page.clock.runFor(hideAt - 300 - elapsed);
    await expect(bubble(page)).toBeVisible();
    await page.clock.runFor(600);
    await expect(bubble(page)).toBeHidden();
  });

  test('reduced motion: текст сразу целиком, без анимаций; скрывается через 6 с', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, { habits: seed(fresh('a', 'Пить воду'), fresh('b'), fresh('c'), fresh('d')), companion: met('owl') });
    await openPaused(page);

    await cardById(page, 'a').getByTestId('toggle-today').click();
    const text = await expectBubble(page, 'mark');
    // Ни одного тика часов — а текст уже весь.
    await expect(bubbleText(page)).toHaveText(text);
    await expect(bubble(page)).not.toHaveAttribute('aria-busy', 'true');
    const animations = await dock(page).evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);

    await page.clock.runFor(5800);
    await expect(bubble(page)).toBeVisible();
    await page.clock.runFor(400);
    await expect(bubble(page)).toBeHidden();
  });
});

test.describe('реплика на каждое действие, вехи и конфетти (AC-49)', () => {
  test('добавление (первая и следующая), отметка сегодня и прошлого дня, снятие, напоминание, правка, расписание, удаление', async ({ page }) => {
    const errors = collectErrors(page);
    await stubNotifications(page);
    await seedStorage(page, { companion: met('cat') });
    await openPaused(page);

    // Первая привычка.
    await page.getByTestId('habit-name-input').fill('Зарядка');
    await page.getByTestId('add-habit').click();
    expect(await expectBubble(page, 'firstHabit')).toContain('Зарядка');
    await closeBubble(page);

    // Следующая привычка.
    await page.getByTestId('habit-name-input').fill('Чтение');
    await page.getByTestId('add-habit').click();
    expect(await expectBubble(page, 'added')).toContain('Чтение');
    await closeBubble(page);

    // Карточки — по id (в режиме правки название заменяется полем ввода).
    const zarId = await cardByName(page, 'Зарядка').getAttribute('data-habit-id');
    const readId = await cardByName(page, 'Чтение').getAttribute('data-habit-id');
    const zar = cardById(page, zarId);
    const read = cardById(page, readId);

    // Отметка сегодня (из двух — осталась одна).
    await zar.getByTestId('toggle-today').click();
    await expectBubble(page, 'remaining');
    await closeBubble(page);

    // Отметка прошлого дня.
    await cell(read, YESTERDAY).click();
    expect(await expectBubble(page, 'markPast')).toContain('Чтение');
    await closeBubble(page);

    // Снятие.
    await zar.getByTestId('toggle-today').click();
    await expect(zar.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expectBubble(page, 'unmark');
    await closeBubble(page);

    // Напоминание.
    await zar.getByTestId('reminder-toggle').click();
    await expect(zar.getByTestId('reminder-panel')).toBeVisible();
    await zar.locator('[data-testid="reminder-mode"][value="interval"]').check();
    await zar.getByTestId('reminder-interval').selectOption('60');
    await zar.getByTestId('reminder-start').fill('09:00');
    await zar.getByTestId('reminder-end').fill('21:00');
    await zar.getByTestId('reminder-save').click();
    await expect(zar.getByTestId('reminder-panel')).toHaveCount(0);
    expect(await expectBubble(page, 'reminderSet')).toContain('Зарядка');
    await closeBubble(page);

    // Правка названия.
    await read.getByTestId('edit-habit').click();
    await expect(read.getByTestId('edit-form')).toBeVisible();
    await read.getByTestId('edit-name-input').fill('Чтение книг');
    await read.getByTestId('edit-save').click();
    await expect(cardByName(page, 'Чтение книг')).toHaveCount(1);
    const renamed = read;
    expect(await expectBubble(page, 'edited')).toContain('Чтение книг');
    await closeBubble(page);

    // Правка расписания (снять понедельник).
    await renamed.getByTestId('edit-habit').click();
    await expect(renamed.getByTestId('edit-form')).toBeVisible();
    await renamed.locator('[data-testid="edit-day"][value="1"]').uncheck();
    await renamed.getByTestId('edit-save').click();
    await expect(renamed.getByTestId('habit-days')).toBeVisible();
    expect(await expectBubble(page, 'edited')).toContain('Чтение книг');
    await closeBubble(page);

    // Удаление — мягко.
    page.once('dialog', (d) => d.accept());
    await zar.getByTestId('delete-habit').click();
    await expect(cardByName(page, 'Зарядка')).toHaveCount(0);
    expect(await expectBubble(page, 'deleted')).toContain('Зарядка');
    expect(errors).toEqual([]);
  });

  test('первый закрытый день — firstDayClosed', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a', 'Пить воду'), fresh('b', 'Читать')), companion: met('panda') });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expectBubble(page, 'remaining');
    await cardById(page, 'b').getByTestId('toggle-today').click();
    const text = await expectBubble(page, 'firstDayClosed');
    expect(text).not.toMatch(REPROACH);
  });

  test('вехи 3 и 7: особая реплика с серией и конфетти, которое исчезает; обычная отметка — без конфетти', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedStorage(page, {
      habits: seed(
        habit('a', 'Читать', run(YESTERDAY, 2)),
        habit('b', 'Бег', run(YESTERDAY, 6)),
        fresh('c'),
        fresh('d'),
        fresh('e'),
      ),
      companion: met('frog'),
    });
    await openPaused(page);
    await expect(confettiPieces(page)).toHaveCount(0);

    // Веха 3 — кнопкой «Сегодня».
    await cardById(page, 'a').getByTestId('toggle-today').click();
    const three = await expectBubble(page, 'milestone');
    expect(three).toContain('Читать');
    expect(three).toContain('3 дня');
    const count3 = await confettiPieces(page).count();
    expect(count3).toBeGreaterThanOrEqual(30);
    expect(count3).toBeLessThanOrEqual(40);
    await expect(page.getByTestId('companion-confetti')).toHaveAttribute('aria-hidden', 'true');
    await page.clock.runFor(2000);
    await expect(confettiPieces(page)).toHaveCount(0);

    // Веха 7 — клеткой сегодняшнего дня.
    await cell(cardById(page, 'b'), TODAY).click();
    const seven = await expectBubble(page, 'milestone');
    expect(seven).toContain('Бег');
    expect(seven).toContain('7 дней');
    const count7 = await confettiPieces(page).count();
    expect(count7).toBeGreaterThanOrEqual(30);
    expect(count7).toBeLessThanOrEqual(40);
    await page.clock.runFor(2000);
    await expect(confettiPieces(page)).toHaveCount(0);

    // Обычная отметка — без конфетти.
    await cardById(page, 'c').getByTestId('toggle-today').click();
    await expect(bubble(page)).not.toHaveAttribute('data-event', 'milestone');
    await expect(confettiPieces(page)).toHaveCount(0);
  });

  test('reduced motion: веха — та же реплика, но без конфетти', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, {
      habits: seed(habit('a', 'Читать', run(YESTERDAY, 2)), fresh('b'), fresh('c')),
      companion: met('cat'),
    });
    await openPaused(page);
    await cardById(page, 'a').getByTestId('toggle-today').click();
    expect(await expectBubble(page, 'milestone')).toContain('3 дня');
    await expect(confettiPieces(page)).toHaveCount(0);
  });
});

test.describe('«Спроси меня» (AC-50)', () => {
  test('ответы по ключевым словам: регистр, знаки и ё не важны; поле очищается', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('owl') });
    await openPaused(page);

    for (const [question, id] of [
      ['Как ДОБАВИТЬ привычку???', 'add'],
      ['ТЁМНАЯ тема!!', 'theme'],
      ['что такое серия', 'streak'],
      ['забыл отметить вчера', 'past'],
    ]) {
      await ask(page, question);
      await expect(bubble(page)).toHaveAttribute('data-event', 'answer');
      await expect(bubble(page)).toHaveAttribute('data-qa', id);
      expect(await expectBubble(page, 'answer')).toContain(getAnswerEntry(id).answer);
      await expect(page.getByTestId('companion-ask-input')).toHaveValue('');
    }
  });

  test('кнопки частых вопросов: каждая даёт свой ответ', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('penguin') });
    await openPaused(page);
    await openMenu(page);

    const buttons = page.getByTestId('companion-quick-question');
    await expect(buttons).toHaveCount(QUICK_QUESTIONS.length);
    expect(QUICK_QUESTIONS.length).toBeGreaterThanOrEqual(6);
    await expect(buttons).toHaveText(QUICK_QUESTIONS.map((q) => q.label));
    for (const q of QUICK_QUESTIONS) {
      await page.locator(`[data-testid="companion-quick-question"][data-qa="${q.id}"]`).click();
      await expect(bubble(page)).toHaveAttribute('data-qa', q.id);
      expect(await expectBubble(page, 'answer')).toBe(answerText(getAnswerEntry(q.id), 'penguin'));
    }
  });

  test('незнакомый вопрос — честный ответ с подсказкой; пустой вопрос — без ответа', async ({ page }) => {
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('hedgehog') });
    await openPaused(page);

    await ask(page, 'qwerty йцукен');
    await expect(bubble(page)).toHaveAttribute('data-qa', 'unknown');
    const text = await expectBubble(page, 'answer');
    expect(text).toBe(unknownAnswer('hedgehog'));
    expect(text).toMatch(/спроси/i);

    await closeBubble(page);
    await ask(page, '   ');
    await expect(bubble(page)).toBeHidden();
  });

  test('HTML в вопросе — как текст; вопрос нигде не сохраняется и не отправляется; внешних запросов нет', async ({ page, baseURL }) => {
    const external = collectExternal(page, baseURL);
    const requests = collectRequests(page);
    const errors = collectErrors(page);
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat') });
    await openPaused(page);
    const before = requests.length;

    const marker = 'зюзябрик';
    await ask(page, `<img src="x-${marker}.png" onerror="window.__xss=1"><b>${marker}</b>`);
    const text = await expectBubble(page, 'answer');
    // Печать до конца — в облачке по-прежнему только текст.
    await page.clock.runFor([...text].length * TYPE_MS + 100);
    await expect(bubbleText(page)).toHaveText(text);
    await expect(bubble(page).locator('img')).toHaveCount(0);
    await expect(bubble(page).locator('b')).toHaveCount(0);
    await page.clock.runFor(10_000);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    const stored = await page.evaluate(() => {
      const values = [];
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i += 1) values.push(store.getItem(store.key(i)));
      }
      return { values, href: location.href };
    });
    for (const v of stored.values) expect(v ?? '').not.toContain(marker);
    expect(stored.href).not.toContain(marker);
    const later = requests.slice(before);
    for (const r of later) {
      expect(decodeURIComponent(r.url)).not.toContain(marker);
      expect(r.body).not.toContain(marker);
    }
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('экскурсия (AC-51)', () => {
  // Без плавной прокрутки (reduced motion): цель прокручивается сразу, подсветку можно сверить с ней.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('из меню: 6 шагов с подсветкой целей; «Далее»/«Назад»; на последнем «Готово» закрывает', async ({ page }) => {
    await seedStorage(page, { habits: manyHabits(3), companion: met('cat') });
    await openPaused(page);

    await openMenu(page);
    await page.getByTestId('companion-tour-start').click();
    await expect(tour(page)).toBeVisible();
    await expect(menu(page)).toBeHidden();
    await expect(page.getByTestId('companion-tour-prev')).toBeDisabled();

    for (let i = 0; i < 6; i += 1) {
      const step = TOUR_STEPS[i];
      await expect(page.getByTestId('companion-tour-count')).toHaveText(`Шаг ${i + 1} из 6`);
      await expect(tourStep(page)).toHaveAttribute('data-step-id', step.id);
      await expect(page.getByTestId('companion-tour-title')).toHaveText(step.title);
      await expect(page.getByTestId('companion-tour-text')).toHaveText(step.text);
      await expect(tour(page)).toHaveAttribute('data-has-target', 'true');

      const target = page.locator(step.target).first();
      await expect(target).toBeInViewport();
      const spot = page.getByTestId('companion-tour-spot');
      await expect(spot).toBeVisible();
      const s = await spot.boundingBox();
      const t = await target.boundingBox();
      expect(s.x, `${step.id}: подсветка слева`).toBeLessThanOrEqual(t.x + 1);
      expect(s.y, `${step.id}: подсветка сверху`).toBeLessThanOrEqual(t.y + 1);
      expect(s.x + s.width, `${step.id}: подсветка справа`).toBeGreaterThanOrEqual(t.x + t.width - 1);
      expect(s.y + s.height, `${step.id}: подсветка снизу`).toBeGreaterThanOrEqual(t.y + t.height - 1);

      if (i === 2) {
        // «Назад» с шага 3 → шаг 2, затем снова вперёд.
        await page.getByTestId('companion-tour-prev').click();
        await expect(page.getByTestId('companion-tour-count')).toHaveText('Шаг 2 из 6');
        await page.getByTestId('companion-tour-next').click();
        await expect(page.getByTestId('companion-tour-count')).toHaveText('Шаг 3 из 6');
      }
      if (i < 5) {
        await expect(page.getByTestId('companion-tour-next')).toHaveText('Далее');
        await page.getByTestId('companion-tour-next').click();
      }
    }
    await expect(page.getByTestId('companion-tour-next')).toHaveText('Готово');
    await page.getByTestId('companion-tour-next').click();
    await expect(tour(page)).toBeHidden();
  });

  test('«Закрыть» и Esc закрывают; после экскурсии страница работает', async ({ page }) => {
    await seedStorage(page, { habits: manyHabits(2), companion: met('cat') });
    await openPaused(page);

    await openMenu(page);
    await page.getByTestId('companion-tour-start').click();
    await expect(tour(page)).toBeVisible();
    await page.getByTestId('companion-tour-close').click();
    await expect(tour(page)).toBeHidden();

    await openMenu(page);
    await page.getByTestId('companion-tour-start').click();
    await page.getByTestId('companion-tour-next').click();
    await expect(page.getByTestId('companion-tour-count')).toHaveText('Шаг 2 из 6');
    await page.keyboard.press('Escape');
    await expect(tour(page)).toBeHidden();
    await expect(menu(page)).toBeHidden();

    await cardById(page, 'h0').getByTestId('toggle-today').click();
    await expect(cardById(page, 'h0').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
  });

  test('без привычек: шаги про карточку объясняют без подсветки', async ({ page }) => {
    await seedStorage(page, { companion: met('cat') });
    await openPaused(page);
    await openMenu(page);
    await page.getByTestId('companion-tour-start').click();
    await expect(tour(page)).toHaveAttribute('data-has-target', 'true'); // шаг 1 — форма есть всегда
    await page.getByTestId('companion-tour-next').click();
    await expect(page.getByTestId('companion-tour-count')).toHaveText('Шаг 2 из 6');
    await expect(tour(page)).toHaveAttribute('data-has-target', 'false');
    await expect(page.getByTestId('companion-tour-spot')).toBeHidden();
    await expect(page.getByTestId('companion-tour-text')).toHaveText(TOUR_STEPS[1].missingText);
  });

  test('предлагается сразу после знакомства один раз; «Покажи!» запускает экскурсию', async ({ page }) => {
    await recordBubbleEvents(page);
    await seedStorage(page, { habits: manyHabits(2) });
    await openPaused(page);

    await option(page, 'fox').click();
    const introText = await expectBubble(page, 'intro');
    await page.clock.runFor(hideMsFor(introText) + 100);
    await expectBubble(page, 'tourOffer');
    const accept = page.getByTestId('companion-tour-accept');
    await expect(accept).toBeVisible();
    await expect(accept).toHaveText('Покажи!');
    expect((await storedCompanion(page)).tourOffered).toBe(true);

    await accept.click();
    await expect(tour(page)).toBeVisible();
    await expect(page.getByTestId('companion-tour-count')).toHaveText('Шаг 1 из 6');
    await page.getByTestId('companion-tour-close').click();
    await expect(tour(page)).toBeHidden();

    // Повторно не предлагается.
    await page.reload();
    await page.clock.runFor(SETTLE_MS);
    const events = await bubbleEvents(page);
    expect(events).toContain('greeting');
    expect(events).not.toContain('tourOffer');
  });
});

test.describe('совет дня (AC-52)', () => {
  test('после приветствия — совет дня; в тот же день повторно нет; на следующий день — снова', async ({ page }) => {
    await recordBubbleEvents(page);
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat', 'Мурзик', true, { lastTipDate: null }) });
    await openRunning(page);

    const greeting = await expectBubble(page, 'greeting');
    await page.clock.runFor(hideMsFor(greeting) + 200);
    const tip = await expectBubble(page, 'tip');
    expect(tip).toContain(tipForDay(TODAY));
    expect((await storedCompanion(page)).lastTipDate).toBe(TODAY);

    // Тот же день — только приветствие.
    await page.reload();
    await page.clock.runFor(SETTLE_MS);
    let events = await bubbleEvents(page);
    expect(events).toContain('greeting');
    expect(events).not.toContain('tip');

    // Следующий день — совет снова, дата обновлена.
    await page.clock.setSystemTime(msk('09:00:00', TOMORROW));
    await page.reload();
    await page.clock.runFor(SETTLE_MS);
    events = await bubbleEvents(page);
    expect(events.indexOf('greeting')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('tip')).toBeGreaterThan(events.indexOf('greeting'));
    expect((await storedCompanion(page)).lastTipDate).toBe(TOMORROW);
  });

  test('после полуночи по локальной дате (00:30 МСК = 21:30 UTC предыдущего дня) — совет нового дня', async ({ page }) => {
    await recordBubbleEvents(page);
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat', 'Мурзик', true, { lastTipDate: TODAY }) });
    await openPaused(page, msk('00:30:00', TOMORROW));
    expect(await bubbleEvents(page)).toContain('tip');
    expect((await storedCompanion(page)).lastTipDate).toBe(TOMORROW);
  });

  test('поздно вечером того же дня (23:30 МСК) совета повторно нет', async ({ page }) => {
    await recordBubbleEvents(page);
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat', 'Мурзик', true, { lastTipDate: TODAY }) });
    await openPaused(page, msk('23:30:00'));
    const events = await bubbleEvents(page);
    expect(events).toContain('greeting');
    expect(events).not.toContain('tip');
    expect((await storedCompanion(page)).lastTipDate).toBe(TODAY);
  });

  test('выключенный помощник совет не показывает и дату совета не меняет', async ({ page }) => {
    await recordBubbleEvents(page);
    await seedStorage(page, { habits: seed(fresh('a')), companion: met('cat', 'Мурзик', false, { lastTipDate: null }) });
    await openPaused(page);
    expect(await bubbleEvents(page)).toEqual([]);
    expect((await storedCompanion(page)).lastTipDate).toBeNull();
  });
});

test.describe('статичная картинка под анимированным эмодзи (AC-53)', () => {
  const CODES = {
    '💧': '1f4a7',
    '📚': '1f4da',
    '🥗': '1f957',
    '😴': '1f634',
    '✍️': '270d_fe0f',
    '🎸': '1f3b8',
    '🧹': '1f9f9',
    '🌱': '1f331',
    '⭐': '2b50',
  };

  test('у 💧 на карточке под WebP — фон статичной SVG того же эмодзи; в плашке одна img.emoji-img', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedStorage(page, {
      habits: seed(habit('w', 'Пить воду', [], { emoji: '💧' })),
      companion: met('cat'),
    });
    await openPaused(page);

    const plate = cardById(page, 'w').getByTestId('habit-emoji');
    await expect(plate).toHaveText('💧');
    await expect(plate.locator('img')).toHaveCount(1);
    const img = plate.locator('img.emoji-img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('src', /emoji\/1f4a7\.webp$/);
    const bg = await img.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain('emoji/1f4a7.svg');

    // Статичная картинка действительно доступна локально.
    const url = bg.match(/url\("?([^")]+)"?\)/)[1];
    const res = await page.request.get(url);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('svg');
  });

  test('у всех анимированных эмодзи карточек — статичный фон того же символа', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const chars = Object.keys(CODES);
    await seedStorage(page, {
      habits: seed(...chars.map((e, i) => habit(`e${i}`, `Привычка ${i + 1}`, [], { emoji: e }))),
      companion: met('cat'),
    });
    await openPaused(page);
    for (let i = 0; i < chars.length; i += 1) {
      const img = cardById(page, `e${i}`).getByTestId('habit-emoji').locator('img.emoji-img');
      await expect(img).toHaveCount(1);
      const info = await img.evaluate((el) => ({ src: el.getAttribute('src'), bg: getComputedStyle(el).backgroundImage }));
      if (info.src.endsWith('.webp')) {
        expect(info.bg, chars[i]).toContain(`emoji/${CODES[chars[i]]}.svg`);
      }
    }
  });
});

test.describe('данные привычек не меняются от новых действий помощника (AC-54)', () => {
  test('экскурсия, вопросы, быстрые вопросы, «×», предложение экскурсии и совет дня не меняют habit-tracker:v1 и тему', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const data = seed(habit('a', 'Пить воду', [YESTERDAY, TODAY]), fresh('b', 'Читать'));
    await seedStorage(page, { habits: data, theme: 'dark' });
    await openPaused(page);
    const rawBefore = await storedRaw(page);
    expect(rawBefore).not.toBeNull();

    // Знакомство → предложение экскурсии → «Покажи!» → шаги → Esc.
    await option(page, 'frog').click();
    const introText = await expectBubble(page, 'intro');
    await page.clock.runFor(hideMsFor(introText) + 100);
    await page.getByTestId('companion-tour-accept').click();
    await page.getByTestId('companion-tour-next').click();
    await page.getByTestId('companion-tour-next').click();
    await page.getByTestId('companion-tour-prev').click();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toBeHidden();

    // Вопросы и быстрые вопросы, «×».
    await ask(page, 'Как удалить привычку?');
    await expectBubble(page, 'answer');
    await page.getByTestId('companion-quick-question').first().click();
    await closeBubble(page);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();

    // Экскурсия из меню — до конца.
    await openMenu(page);
    await page.getByTestId('companion-tour-start').click();
    for (let i = 0; i < 6; i += 1) await page.getByTestId('companion-tour-next').click();
    await expect(tour(page)).toBeHidden();
    await page.clock.runFor(SETTLE_MS);

    expect(await storedRaw(page)).toBe(rawBefore);
    expect(await storedRaw(page, THEME_KEY)).toBe('dark');

    // Перезагрузка: приветствие и совет дня — данные привычек те же.
    await page.reload();
    await page.clock.runFor(SETTLE_MS);
    expect(await storedRaw(page)).toBe(rawBefore);
    expect((await storedCompanion(page)).lastTipDate).toBe(TODAY);
    await expect(cardById(page, 'a').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardById(page, 'b').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });
});

// ===========================================================================
// Цикл исправления 05 (решение пользователя по прогону 04, 15.10.2026): меню без горизонтальной
// прокрутки; на ≤ 420px реплика — плашка внизу слева от персонажа; на широком экране облачко
// не заходит на карточки; длинный текст в плашке — до 3 строк с прокруткой (data-scroll="true").
// Геометрию проверяем при reduced motion: без анимации появления (scale) и без печати по буквам.

/** Последняя карточка с прежней серией 26–30.09: отметка сегодня даёт mark (как в тесте AC-47). */
const habitsWithLast = () =>
  seed(...manyHabits().habits.slice(0, 7), habit('h7', 'Последняя', run('2026-09-30', 5)));

/** Прямоугольники видимых элементов управления карточки (кнопки, клетки, поля). */
const controlRects = (card) =>
  card.evaluate((el) =>
    [...el.querySelectorAll('button, input, select, [data-testid="day-cell"]')]
      .map((c) => {
        const r = c.getBoundingClientRect();
        return {
          what: c.getAttribute('data-testid') ?? c.tagName,
          date: c.getAttribute('data-date'),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      })
      .filter((r) => r.width > 0 && r.height > 0),
  );

/** Облачко не пересекается ни с одним элементом управления карточки. */
async function expectBubbleClearOf(page, card) {
  const b = await bubble(page).boundingBox();
  expect(b).not.toBeNull();
  const rects = await controlRects(card);
  expect(rects.length, 'у карточки должны быть кнопки и клетки').toBeGreaterThan(5);
  for (const r of rects) {
    expect(intersects(b, r), `облачко перекрывает ${r.what}${r.date ? ` ${r.date}` : ''}`).toBe(false);
  }
}

const pageOverflowsX = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe('цикл 05: меню помощника помещается в рамку', () => {
  for (const [width, height] of [
    [1100, 800],
    [380, 700],
  ]) {
    test(`${width}px: у меню нет горизонтальной прокрутки, «Спросить» целиком внутри меню и окна`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await seedStorage(page, { habits: manyHabits(3), companion: met('cat') });
      await openPaused(page);
      await openMenu(page);

      const m = await menu(page).evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(m.scrollWidth, 'содержимое меню шире рамки').toBeLessThanOrEqual(m.clientWidth);

      const submit = page.getByTestId('companion-ask-submit');
      await expect(submit).toBeVisible();
      await expect(submit).toHaveText('Спросить');
      const mb = await menu(page).boundingBox();
      const sb = await submit.boundingBox();
      const ib = await page.getByTestId('companion-ask-input').boundingBox();
      for (const [label, box] of [
        ['кнопка «Спросить»', sb],
        ['поле вопроса', ib],
      ]) {
        expect(box.width, `${label}: нулевая ширина`).toBeGreaterThan(0);
        expect(box.x, `${label}: левее меню`).toBeGreaterThanOrEqual(mb.x - 0.5);
        expect(box.x + box.width, `${label}: правее меню`).toBeLessThanOrEqual(mb.x + mb.width + 0.5);
        expect(box.y, `${label}: выше меню`).toBeGreaterThanOrEqual(mb.y - 0.5);
        expect(box.y + box.height, `${label}: ниже меню`).toBeLessThanOrEqual(mb.y + mb.height + 0.5);
        expect(box.x, `${label}: за левым краем окна`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${label}: за правым краем окна`).toBeLessThanOrEqual(width);
        expect(box.y, `${label}: за верхним краем окна`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${label}: за нижним краем окна`).toBeLessThanOrEqual(height);
      }
      // Подпись кнопки не обрезана внутри самой кнопки.
      const clipped = await submit.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, 'текст «Спросить» обрезан').toBe(false);
      await expect(submit).toBeInViewport({ ratio: 1 });

      // Кнопки частых вопросов тоже не выходят за рамку меню.
      const quick = await page.getByTestId('companion-quick-question').all();
      expect(quick.length).toBeGreaterThan(0);
      for (const q of quick) {
        const qb = await q.boundingBox();
        expect(qb.x).toBeGreaterThanOrEqual(mb.x - 0.5);
        expect(qb.x + qb.width).toBeLessThanOrEqual(mb.x + mb.width + 0.5);
      }

      // Поле вопроса по-прежнему работает: кнопка «Спросить» нажимается и даёт ответ.
      await ask(page, 'что такое серия');
      await expect(bubble(page)).toHaveAttribute('data-qa', 'streak');
      expect(await pageOverflowsX(page), 'у страницы горизонтальная прокрутка').toBe(false);
    });
  }
});

test.describe('цикл 05: телефон 375×700 — реплика плашкой внизу слева от персонажа', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 700 });
  });

  test('в самом низу: после отметки клетки и «Сегодня» последней карточки плашка не закрывает её клетки и кнопки', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, { habits: habitsWithLast(), companion: met('cat') });
    await openPaused(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = cardById(page, 'h7');
    await expect(last).toBeInViewport();

    // 1) Клетка сегодняшнего дня.
    await cell(last, TODAY).click();
    await expect(cell(last, TODAY)).toHaveAttribute('aria-pressed', 'true');
    expect(await expectBubble(page, 'mark')).toContain('Последняя');
    const b = await bubble(page).boundingBox();
    expect(intersects(b, await cell(last, TODAY).boundingBox()), 'плашка закрывает только что отмеченную клетку').toBe(false);
    await expectBubbleClearOf(page, last);

    // Плашка у нижнего края, слева от персонажа, в той же нижней полосе, целиком на экране.
    const persona = await companion(page).boundingBox();
    const fromBottom = 700 - (b.y + b.height);
    expect(fromBottom, 'плашка не у нижнего края').toBeGreaterThanOrEqual(0);
    expect(fromBottom, 'плашка не у нижнего края').toBeLessThanOrEqual(40);
    expect(b.x + b.width, 'плашка заходит на персонажа').toBeLessThanOrEqual(persona.x + 0.5);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, 'плашка над персонажем, а не слева от него').toBeGreaterThan(persona.y);
    await expect(bubble(page)).toBeInViewport({ ratio: 1 });
    expect(await pageOverflowsX(page), 'у страницы горизонтальная прокрутка').toBe(false);

    // 2) Кнопка «Сегодня» той же карточки (снятие отметки) — плашка снова не закрывает карточку.
    await closeBubble(page);
    await last.getByTestId('toggle-today').click();
    await expect(last.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expectBubble(page, 'unmark');
    expect(
      intersects(await bubble(page).boundingBox(), await last.getByTestId('toggle-today').boundingBox()),
      'плашка закрывает «Сегодня»',
    ).toBe(false);
    await expectBubbleClearOf(page, last);
    expect(errors).toEqual([]);
  });

  test('короткая реплика: без data-scroll, клики проходят сквозь плашку', async ({ page }) => {
    await seedStorage(page, { habits: habitsWithLast(), companion: met('cat') });
    await openPaused(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await cell(cardById(page, 'h7'), TODAY).click();
    // Реплики mark короткие (до ~60 символов) — помещаются в 3 строки.
    const text = await expectBubble(page, 'mark');
    expect([...text].length).toBeLessThan(80);
    await expect(bubble(page)).not.toHaveAttribute('data-scroll', 'true');

    const passThrough = await bubbleText(page).evaluate((textEl) => {
      const bubbleEl = textEl.closest('[data-testid="companion-bubble"]');
      const r = textEl.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !bubbleEl.contains(el);
    });
    expect(passThrough, 'короткая плашка перехватывает клики').toBe(true);
  });

  test('длинный ответ: data-scroll="true", не выше 3 строк, текст прокручивается колёсиком внутри плашки', async ({ page }) => {
    await seedStorage(page, { habits: manyHabits(3), companion: met('cat') });
    await openPaused(page);

    // Самый длинный быстрый ответ — заведомо больше 3 строк на 375px.
    await openMenu(page);
    await page.locator('[data-testid="companion-quick-question"][data-qa="missed"]').click();
    await expect(bubble(page)).toHaveAttribute('data-qa', 'missed');
    const full = answerText(getAnswerEntry('missed'), 'cat');
    expect([...full].length).toBeGreaterThan(120);
    await expect(bubbleText(page)).toHaveText(full); // reduced motion — сразу целиком
    // Меню закрываем, реплика остаётся.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(bubble(page)).toBeVisible();
    await expect(bubble(page)).toHaveAttribute('data-scroll', 'true');

    const m = await bubbleText(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(m.scrollHeight, 'текст должен не помещаться').toBeGreaterThan(m.clientHeight + 1);
    expect(m.clientHeight, 'видимая часть выше 3 строк').toBeLessThanOrEqual(3 * m.line + 2);
    await expect(bubble(page)).toBeInViewport({ ratio: 1 });

    // Точка в середине текста принадлежит тексту — его можно прокрутить пальцем или колёсиком.
    const hit = await bubbleText(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(at);
    });
    expect(hit, 'длинный текст не принимает прокрутку').toBe(true);

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(await bubbleText(page).evaluate((el) => el.scrollTop)).toBe(0);
    const tb = await bubbleText(page).boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => bubbleText(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // Прокрутилась сама плашка, а не страница под ней.
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);
  });

  test('длинный ответ при печати: data-scroll="true" сразу, после печати видна последняя строка', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedStorage(page, { habits: manyHabits(3), companion: met('cat') });
    await openPaused(page);

    await openMenu(page);
    await page.locator('[data-testid="companion-quick-question"][data-qa="missed"]').click();
    await expect(bubble(page)).toHaveAttribute('data-qa', 'missed');
    const full = answerText(getAnswerEntry('missed'), 'cat');
    // Высоту задаёт полный текст — прокрутка нужна уже до конца печати.
    await expect(bubble(page)).toHaveAttribute('data-scroll', 'true');

    await page.clock.runFor([...full].length * TYPE_MS + 200);
    await expect(bubbleText(page)).toHaveText(full);
    await expect(bubble(page)).toHaveAttribute('data-scroll', 'true');
    const m = await bubbleText(page).evaluate((el) => ({
      top: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(m.top, 'при печати текст не прокручивался следом').toBeGreaterThan(0);
    expect(m.top + m.clientHeight, 'конец текста не виден после печати').toBeGreaterThanOrEqual(m.scrollHeight - m.line);
  });
});

test.describe('цикл 05: широкий экран — облачко не заходит на карточки', () => {
  for (const width of [1100, 1400]) {
    test(`${width}px: облачко после отметки и после ответа на вопрос не пересекается с карточками`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 800 });
      await seedStorage(page, { habits: habitsWithLast(), companion: met('cat') });
      await openPaused(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      const clearOfCards = async (label) => {
        const b = await bubble(page).boundingBox();
        expect(b).not.toBeNull();
        expect(b.width, `${label}: облачко слишком узкое`).toBeGreaterThan(100);
        const boxes = await cards(page).evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.getAttribute('data-habit-id'), x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        );
        expect(boxes.length).toBe(8);
        // Облачко на уровне карточек (иначе проверка ничего не доказывает).
        const sameRows = boxes.filter((r) => r.y < b.y + b.height && b.y < r.y + r.height);
        expect(sameRows.length, `${label}: рядом с облачком нет карточек`).toBeGreaterThan(0);
        for (const r of boxes) {
          expect(intersects(b, r), `${label}: облачко заходит на карточку ${r.id}`).toBe(false);
        }
        await expect(bubble(page)).toBeInViewport({ ratio: 1 });
      };

      await cell(cardById(page, 'h7'), TODAY).click();
      await expectBubble(page, 'mark');
      await clearOfCards('реплика mark');

      await closeBubble(page);
      await ask(page, 'забыл отметить вчера');
      await expect(bubble(page)).toHaveAttribute('data-qa', 'past');
      await page.keyboard.press('Escape');
      await expect(menu(page)).toBeHidden();
      await expect(bubble(page)).toBeVisible();
      await clearOfCards('ответ на вопрос');
      // На широком экране высота текста не ограничена — прокрутки внутри облачка нет.
      await expect(bubble(page)).not.toHaveAttribute('data-scroll', 'true');
      expect(await pageOverflowsX(page), 'у страницы горизонтальная прокрутка').toBe(false);
    });
  }
});
