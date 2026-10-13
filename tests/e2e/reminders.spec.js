import { test, expect } from '@playwright/test';

// Фиксированный часовой пояс и управляемые часы (page.clock): напоминания
// проверяются на заданных датах и временах, а не на реальном «сейчас».
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';
const msk = (time, day = TODAY) => new Date(`${day}T${time}+03:00`);
const KEY = 'habit-tracker:v1';

/**
 * Подменяет window.Notification классом-заглушкой до загрузки страницы.
 * permission — начальное разрешение; requestResult — ответ на requestPermission();
 * supported: false — Notification в браузере нет.
 * Вызовы пишутся в window.__notifications / window.__permissionRequests.
 */
async function stubNotifications(page, { permission = 'granted', requestResult = 'granted', supported = true } = {}) {
  await page.addInitScript(
    ({ permission, requestResult, supported }) => {
      window.__notifications = [];
      window.__notificationInstances = [];
      window.__permissionRequests = 0;
      if (!supported) {
        delete window.Notification;
        return;
      }
      let current = permission;
      class FakeNotification {
        constructor(title, options = {}) {
          this.title = title;
          this.tag = options.tag ?? null;
          this.onclick = null;
          this.closed = false;
          window.__notifications.push({ title, tag: this.tag });
          window.__notificationInstances.push(this);
        }
        close() {
          this.closed = true;
        }
        static get permission() {
          return current;
        }
        static requestPermission(callback) {
          window.__permissionRequests += 1;
          current = requestResult;
          if (typeof callback === 'function') callback(current);
          return Promise.resolve(current);
        }
      }
      Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
    },
    { permission, requestResult, supported },
  );
}

/** Записывает данные в localStorage один раз (до первой загрузки), reload их не перезаписывает. */
async function seedStorage(page, data) {
  await page.addInitScript(
    ({ key, text }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, text);
        sessionStorage.setItem('seeded', '1');
      }
    },
    { key: KEY, text: JSON.stringify(data) },
  );
}

/** Ошибки страницы собираются, чтобы проверить отсутствие исключений. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openAt(page, time, notify = {}) {
  await stubNotifications(page, notify);
  await page.clock.install({ time });
  await page.goto('/');
}

async function addHabit(page, name, emoji) {
  await page.getByTestId('habit-name-input').fill(name);
  if (emoji) {
    await page.getByTestId('emoji-option').filter({ hasText: emoji }).click();
  }
  await page.getByTestId('add-habit').click();
}

const cards = (page) => page.getByTestId('habit-card');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cardByName = (page, name) =>
  cards(page).filter({
    has: page.getByTestId('habit-name').filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }),
  });

async function openPanel(card) {
  await card.getByTestId('reminder-toggle').click();
  await expect(card.getByTestId('reminder-panel')).toBeVisible();
}

async function saveIntervalReminder(card, { interval = '60', start = '09:00', end = '21:00' } = {}) {
  await openPanel(card);
  await card.locator('[data-testid="reminder-mode"][value="interval"]').check();
  await card.getByTestId('reminder-interval').selectOption(interval);
  await card.getByTestId('reminder-start').fill(start);
  await card.getByTestId('reminder-end').fill(end);
  await card.getByTestId('reminder-save').click();
  await expect(card.getByTestId('reminder-panel')).toHaveCount(0);
}

async function saveTimesReminder(card, times) {
  await openPanel(card);
  await card.locator('[data-testid="reminder-mode"][value="times"]').check();
  const inputs = card.getByTestId('reminder-time');
  while ((await inputs.count()) < times.length) {
    await card.getByTestId('reminder-add-time').click();
  }
  for (let i = 0; i < times.length; i += 1) {
    await inputs.nth(i).fill(times[i]);
  }
  await card.getByTestId('reminder-save').click();
  await expect(card.getByTestId('reminder-panel')).toHaveCount(0);
}

const notificationTitles = (page) => page.evaluate(() => window.__notifications.map((n) => n.title));
const permissionRequests = (page) => page.evaluate(() => window.__permissionRequests);
const banners = (page) => page.getByTestId('reminder-banner');

test.describe('настройка и выключение (AC-10)', () => {
  test('«Каждые N», 1 ч, 9:00–21:00 → подпись на карточке; «Выключить» → подписи и напоминаний нет', async ({ page }) => {
    await openAt(page, msk('10:15:00'));
    await addHabit(page, 'Разминка', '🧘');
    const card = cardByName(page, 'Разминка');

    // Форма добавления привычки не содержит настроек напоминаний.
    await expect(page.locator('#add-form [data-testid^="reminder"]')).toHaveCount(0);
    await expect(card.getByTestId('reminder-label')).toHaveCount(0);

    await saveIntervalReminder(card, { interval: '60', start: '09:00', end: '21:00' });
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 каждый час, 9:00–21:00');
    await expect(page.getByTestId('reminder-hint')).toBeVisible();
    await expect(page.getByTestId('reminder-hint')).toHaveText('Напоминания приходят, пока эта вкладка открыта');

    // Изменение: 30 минут → подпись обновляется.
    await saveIntervalReminder(card, { interval: '30', start: '09:00', end: '21:00' });
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 каждые 30 минут, 9:00–21:00');

    // Выключение.
    await openPanel(card);
    await card.getByTestId('reminder-off').click();
    await expect(card.getByTestId('reminder-label')).toHaveCount(0);

    await page.clock.runFor('02:00:00');
    expect(await notificationTitles(page)).toEqual([]);
    await expect(banners(page)).toHaveCount(0);

    // Выключение сохранено.
    await page.reload();
    await expect(cardByName(page, 'Разминка').getByTestId('reminder-label')).toHaveCount(0);
  });

  test('«Отмена» закрывает панель без изменений', async ({ page }) => {
    await openAt(page, msk('10:15:00'));
    await addHabit(page, 'Разминка', '🧘');
    const card = cardByName(page, 'Разминка');
    await openPanel(card);
    await card.getByTestId('reminder-interval').selectOption('120');
    await card.getByTestId('reminder-cancel').click();
    await expect(card.getByTestId('reminder-panel')).toHaveCount(0);
    await expect(card.getByTestId('reminder-label')).toHaveCount(0);
  });

  test('начало активных часов позже конца — не сохраняется, показывается ошибка', async ({ page }) => {
    await openAt(page, msk('10:15:00'));
    await addHabit(page, 'Разминка', '🧘');
    const card = cardByName(page, 'Разминка');
    await openPanel(card);
    await card.getByTestId('reminder-start').fill('21:00');
    await card.getByTestId('reminder-end').fill('09:00');
    await card.getByTestId('reminder-save').click();
    await expect(card.getByTestId('reminder-error')).toBeVisible();
    await expect(card.getByTestId('reminder-panel')).toBeVisible();
    await expect(card.getByTestId('reminder-label')).toHaveCount(0);
  });
});

test.describe('«Каждые N» (AC-11)', () => {
  test('включено в 10:15 с интервалом 1 ч → напоминания в 11:15 и 12:15; отметка «сегодня» их не отменяет', async ({ page }) => {
    await openAt(page, msk('10:15:00'));
    await addHabit(page, 'Разминка', '🧘');
    const card = cardByName(page, 'Разминка');
    await saveIntervalReminder(card, { interval: '60' });

    await page.clock.runFor('59:00'); // ≈ 11:14
    expect(await notificationTitles(page)).toEqual([]);

    await page.clock.runFor('02:00'); // ≈ 11:16
    expect(await notificationTitles(page)).toEqual(['🧘 Пора: Разминка']);

    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');

    await page.clock.runFor('01:00:00'); // ≈ 12:16
    expect(await notificationTitles(page)).toEqual(['🧘 Пора: Разминка', '🧘 Пора: Разминка']);
  });

  test('вне активных часов напоминаний нет', async ({ page }) => {
    await openAt(page, msk('10:15:00'));
    await addHabit(page, 'Вне часов', '🧘');
    await addHabit(page, 'Контроль', '💧');
    await saveIntervalReminder(cardByName(page, 'Вне часов'), { interval: '60', start: '09:00', end: '11:00' });
    await expect(cardByName(page, 'Вне часов').getByTestId('reminder-label')).toHaveText('🔔 каждый час, 9:00–11:00');
    await saveIntervalReminder(cardByName(page, 'Контроль'), { interval: '60', start: '09:00', end: '21:00' });

    // ≈ 13:16: моменты 11:15, 12:15, 13:15 (от сохранения) + запас на тик планировщика (раз в 15 с).
    await page.clock.runFor('03:01:00');
    // Контроль показывает, что планировщик работал; «Вне часов» — ни одного.
    expect(await notificationTitles(page)).toEqual(['💧 Пора: Контроль', '💧 Пора: Контроль', '💧 Пора: Контроль']);
  });
});

test.describe('«В определённое время» (AC-12)', () => {
  test('08:00 и 20:00 приходят, если не отмечено; после отметки — не приходят', async ({ page }) => {
    await openAt(page, msk('07:58:00'));
    await addHabit(page, 'Вода', '💧');
    await addHabit(page, 'Таблетки', '💊');
    await saveTimesReminder(cardByName(page, 'Вода'), ['08:00', '20:00']);
    await saveTimesReminder(cardByName(page, 'Таблетки'), ['20:00', '08:00']);
    await expect(cardByName(page, 'Вода').getByTestId('reminder-label')).toHaveText('🔔 08:00, 20:00');
    await expect(cardByName(page, 'Таблетки').getByTestId('reminder-label')).toHaveText('🔔 08:00, 20:00');

    await page.clock.runFor('03:00'); // ≈ 08:01
    expect((await notificationTitles(page)).sort()).toEqual(['💊 Пора: Таблетки', '💧 Пора: Вода'].sort());

    await cardByName(page, 'Вода').getByTestId('toggle-today').click();
    await expect(cardByName(page, 'Вода').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');

    await page.clock.runFor('12:00:00'); // ≈ 20:01
    const titles = await notificationTitles(page);
    // Между 08:00 и 20:00 ничего; в 20:00 — только неотмеченные «Таблетки».
    expect(titles).toHaveLength(3);
    expect(titles[2]).toBe('💊 Пора: Таблетки');
  });

  test('больше 5 времён добавить нельзя', async ({ page }) => {
    await openAt(page, msk('07:00:00'));
    await addHabit(page, 'Вода', '💧');
    const card = cardByName(page, 'Вода');
    await openPanel(card);
    await card.locator('[data-testid="reminder-mode"][value="times"]').check();
    const add = card.getByTestId('reminder-add-time');
    for (let i = 0; i < 4; i += 1) {
      await expect(add).toBeEnabled();
      await add.click();
    }
    await expect(card.getByTestId('reminder-time')).toHaveCount(5);
    await expect(add).toBeDisabled();

    const values = ['18:00', '07:00', '12:00', '09:00', '15:00'];
    for (let i = 0; i < 5; i += 1) {
      await card.getByTestId('reminder-time').nth(i).fill(values[i]);
    }
    await card.getByTestId('reminder-save').click();
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 07:00, 09:00, 12:00, 15:00, 18:00');

    await openPanel(card);
    await expect(card.getByTestId('reminder-time')).toHaveCount(5);
    await expect(card.getByTestId('reminder-add-time')).toBeDisabled();
  });

  test('одинаковые времена не дублируются', async ({ page }) => {
    await openAt(page, msk('07:00:00'));
    await addHabit(page, 'Вода', '💧');
    const card = cardByName(page, 'Вода');
    await saveTimesReminder(card, ['08:00', '20:00', '08:00']);
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 08:00, 20:00');

    await openPanel(card);
    await expect(card.getByTestId('reminder-time')).toHaveCount(2);
  });
});

test.describe('уведомление и плашка (AC-13)', () => {
  test('разрешено → системное уведомление «<эмодзи> Пора: <название>», плашки нет; клик открывает вкладку', async ({ page }) => {
    await openAt(page, msk('09:58:00'), { permission: 'granted' });
    await addHabit(page, 'Разминка', '🧘');
    await saveTimesReminder(cardByName(page, 'Разминка'), ['10:00']);

    await page.clock.runFor('03:00');
    expect(await notificationTitles(page)).toEqual(['🧘 Пора: Разминка']);
    await expect(banners(page)).toHaveCount(0);
    expect(await permissionRequests(page)).toBe(0);

    // Клик по уведомлению фокусирует вкладку.
    const focused = await page.evaluate(() => {
      let calls = 0;
      window.focus = () => {
        calls += 1;
      };
      const n = window.__notificationInstances[0];
      if (typeof n.onclick !== 'function') return -1;
      n.onclick(new Event('click'));
      return calls;
    });
    expect(focused).toBe(1);
  });

  test('запрещено → плашка на странице, «Понятно» её закрывает', async ({ page }) => {
    await openAt(page, msk('09:58:00'), { permission: 'denied' });
    await addHabit(page, 'Разминка', '🧘');
    await saveTimesReminder(cardByName(page, 'Разминка'), ['10:00']);

    await page.clock.runFor('03:00');
    expect(await notificationTitles(page)).toEqual([]);
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page).first()).toContainText('🧘 Пора: Разминка');

    await banners(page).first().getByTestId('reminder-banner-close').click();
    await expect(banners(page)).toHaveCount(0);
  });

  test('разрешение запрашивается при первом включении напоминания, а не при загрузке', async ({ page }) => {
    await openAt(page, msk('09:58:00'), { permission: 'default', requestResult: 'granted' });
    await addHabit(page, 'Разминка', '🧘');
    const card = cardByName(page, 'Разминка');
    expect(await permissionRequests(page)).toBe(0);
    await openPanel(card);
    expect(await permissionRequests(page)).toBe(0);
    await card.locator('[data-testid="reminder-mode"][value="times"]').check();
    await card.getByTestId('reminder-time').first().fill('10:00');
    await card.getByTestId('reminder-save').click();
    await expect.poll(() => permissionRequests(page)).toBe(1);

    await page.clock.runFor('03:00');
    expect(await notificationTitles(page)).toEqual(['🧘 Пора: Разминка']);
    await expect(banners(page)).toHaveCount(0);
  });

  test('пользователь отказал в разрешении при включении → плашка', async ({ page }) => {
    await openAt(page, msk('09:58:00'), { permission: 'default', requestResult: 'denied' });
    await addHabit(page, 'Разминка', '🧘');
    await saveTimesReminder(cardByName(page, 'Разминка'), ['10:00']);
    await expect.poll(() => permissionRequests(page)).toBe(1);

    await page.clock.runFor('03:00');
    expect(await notificationTitles(page)).toEqual([]);
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page).first()).toContainText('🧘 Пора: Разминка');
  });

  test('уведомления недоступны → плашка без ошибок; название выводится как текст', async ({ page }) => {
    const errors = collectErrors(page);
    await openAt(page, msk('09:58:00'), { supported: false });
    const name = '<b>жирный</b><img src=x>';
    await addHabit(page, name);
    await saveTimesReminder(cardByName(page, name), ['10:00']);

    await page.clock.runFor('03:00');
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page).first()).toContainText(`⭐ Пора: ${name}`);
    await expect(banners(page).first().locator('b')).toHaveCount(0);
    await expect(banners(page).first().locator('img')).toHaveCount(0);
    await banners(page).first().getByTestId('reminder-banner-close').click();
    await expect(banners(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('время до открытия страницы (AC-14)', () => {
  test('напоминания, наступившие до открытия вкладки, не приходят; следующие — приходят', async ({ page }) => {
    await seedStorage(page, {
      version: 1,
      habits: [
        {
          id: 'morning', name: 'Утро', emoji: '💧', createdAt: '2026-09-01', done: [],
          reminder: { mode: 'times', times: ['08:00'] },
        },
        {
          // 10:00 — за 2 минуты до открытия страницы.
          id: 'recent', name: 'Только что', emoji: '💊', createdAt: '2026-09-01', done: [],
          reminder: { mode: 'times', times: ['10:00'] },
        },
        {
          // Включено в 07:00, каждый час: 08:00, 09:00, 10:00 — до открытия; 11:00 — после.
          id: 'hourly', name: 'Каждый час', emoji: '🏃', createdAt: '2026-09-01', done: [],
          reminder: { mode: 'interval', intervalMin: 60, start: '09:00', end: '21:00', anchor: msk('07:00:00').getTime() },
        },
      ],
    });
    await openAt(page, msk('10:02:00'), { permission: 'granted' });
    await expect(cards(page)).toHaveCount(3);

    await page.clock.runFor('01:00');
    expect(await notificationTitles(page)).toEqual([]);
    await expect(banners(page)).toHaveCount(0);

    await page.clock.runFor('58:00'); // ≈ 11:01
    expect(await notificationTitles(page)).toEqual(['🏃 Пора: Каждый час']);
  });

  test('после закрытия и повторного открытия вкладки пропущенное не досылается', async ({ context }) => {
    await context.clock.install({ time: msk('09:55:00') });
    const first = await context.newPage();
    await stubNotifications(first, { permission: 'granted' });
    await first.goto('/');
    await addHabit(first, 'Разминка', '🧘');
    await saveTimesReminder(cardByName(first, 'Разминка'), ['10:00']);
    await first.close();

    // ≈ 10:02, вкладки нет: 10:00 наступило, пока страница была закрыта (в пределах 5 минут).
    await context.clock.fastForward('07:00');
    const second = await context.newPage();
    await stubNotifications(second, { permission: 'granted' });
    await second.goto('/');
    await expect(cardByName(second, 'Разминка').getByTestId('reminder-label')).toHaveText('🔔 10:00');

    await context.clock.runFor('02:00');
    expect(await notificationTitles(second)).toEqual([]);
    await expect(banners(second)).toHaveCount(0);
  });
});

test.describe('сохранение и удаление (AC-15)', () => {
  test('настройки обоих режимов сохраняются после перезагрузки и продолжают работать', async ({ page }) => {
    await openAt(page, msk('10:15:00'), { permission: 'granted' });
    await addHabit(page, 'Разминка', '🧘');
    await addHabit(page, 'Вода', '💧');
    await saveIntervalReminder(cardByName(page, 'Разминка'), { interval: '120', start: '10:00', end: '18:00' });
    await saveTimesReminder(cardByName(page, 'Вода'), ['12:00', '08:00']);
    await expect(cardByName(page, 'Разминка').getByTestId('reminder-label')).toHaveText('🔔 каждые 2 часа, 10:00–18:00');
    await expect(cardByName(page, 'Вода').getByTestId('reminder-label')).toHaveText('🔔 08:00, 12:00');

    await page.reload();

    const warmup = cardByName(page, 'Разминка');
    await expect(warmup.getByTestId('reminder-label')).toHaveText('🔔 каждые 2 часа, 10:00–18:00');
    await expect(cardByName(page, 'Вода').getByTestId('reminder-label')).toHaveText('🔔 08:00, 12:00');
    await expect(page.getByTestId('reminder-hint')).toBeVisible();

    await openPanel(warmup);
    await expect(warmup.locator('[data-testid="reminder-mode"][value="interval"]')).toBeChecked();
    await expect(warmup.getByTestId('reminder-interval')).toHaveValue('120');
    await expect(warmup.getByTestId('reminder-start')).toHaveValue('10:00');
    await expect(warmup.getByTestId('reminder-end')).toHaveValue('18:00');
    await warmup.getByTestId('reminder-cancel').click();

    const water = cardByName(page, 'Вода');
    await openPanel(water);
    await expect(water.locator('[data-testid="reminder-mode"][value="times"]')).toBeChecked();
    const times = await water.getByTestId('reminder-time').evaluateAll((els) => els.map((el) => el.value));
    expect(times).toEqual(['08:00', '12:00']);
    await water.getByTestId('reminder-cancel').click();

    // Отсчёт «Каждые 2 часа» идёт от момента включения (≈10:15), а не от перезагрузки.
    await page.clock.runFor('02:05:00'); // ≈ 12:20
    expect((await notificationTitles(page)).sort()).toEqual(['💧 Пора: Вода', '🧘 Пора: Разминка'].sort());
  });

  test('при удалении привычки её напоминание удаляется', async ({ page }) => {
    await openAt(page, msk('09:58:00'), { permission: 'granted' });
    await addHabit(page, 'Удаляемая', '🎸');
    await addHabit(page, 'Остаётся', '🌱');
    await saveTimesReminder(cardByName(page, 'Удаляемая'), ['10:00']);
    await saveTimesReminder(cardByName(page, 'Остаётся'), ['10:00']);

    page.once('dialog', (d) => d.accept());
    await cardByName(page, 'Удаляемая').getByTestId('delete-habit').click();
    await expect(cardByName(page, 'Удаляемая')).toHaveCount(0);

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
    expect(stored.habits.map((h) => h.name)).toEqual(['Остаётся']);

    await page.clock.runFor('03:00');
    expect(await notificationTitles(page)).toEqual(['🌱 Пора: Остаётся']);

    // Новая привычка с тем же названием не получает напоминание удалённой.
    await addHabit(page, 'Удаляемая', '🎸');
    await expect(cardByName(page, 'Удаляемая').getByTestId('reminder-label')).toHaveCount(0);
    await page.reload();
    await expect(cardByName(page, 'Удаляемая').getByTestId('reminder-label')).toHaveCount(0);
    await expect(cardByName(page, 'Остаётся').getByTestId('reminder-label')).toHaveText('🔔 10:00');
  });

  test('данные первой версии (без напоминаний) открываются без ошибок, напоминание можно включить', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, {
      version: 1,
      habits: [
        { id: 'v1-a', name: 'Читать', emoji: '📚', createdAt: '2026-09-01', done: ['2026-10-12', TODAY] },
        { id: 'v1-b', name: 'Бег', emoji: '🏃', createdAt: '2026-09-01', done: [] },
      ],
    });
    await openAt(page, msk('10:15:00'));

    await expect(cards(page)).toHaveCount(2);
    const read = cardByName(page, 'Читать');
    await expect(read.getByTestId('habit-emoji')).toHaveText('📚');
    await expect(read.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(read.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(page.getByTestId('reminder-label')).toHaveCount(0);
    await expect(page.getByTestId('reminder-hint')).toBeHidden();

    await saveIntervalReminder(cardByName(page, 'Бег'), { interval: '180' });
    await page.reload();
    await expect(cardByName(page, 'Бег').getByTestId('reminder-label')).toHaveText('🔔 каждые 3 часа, 9:00–21:00');
    await expect(cardByName(page, 'Читать').getByTestId('reminder-label')).toHaveCount(0);
    await expect(cardByName(page, 'Читать').getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
    expect(stored.version).toBe(1);
    expect(errors).toEqual([]);
  });

  test('битое напоминание в хранилище не ломает страницу: привычка видна без подписи', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, {
      version: 1,
      habits: [
        {
          id: 'bad', name: 'Сломанное', emoji: '🧹', createdAt: '2026-09-01', done: [TODAY],
          reminder: { mode: 'interval', intervalMin: 7, start: '21:00', end: '09:00' },
        },
      ],
    });
    await openAt(page, msk('10:15:00'));
    const card = cardByName(page, 'Сломанное');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByTestId('reminder-label')).toHaveCount(0);
    await page.clock.runFor('02:00:00');
    expect(await notificationTitles(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
