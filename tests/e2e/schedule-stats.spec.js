import { test, expect } from '@playwright/test';

// Итерация 004: расписание по дням недели (AC-23…AC-27) и статистика (AC-28…AC-30).
// Фиксированный часовой пояс и управляемые часы: «сегодня» = 2026-10-13 (вторник),
// сетка 30 дней — с 2026-09-14 (пн) по 2026-10-13.
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';
const msk = (time, day = TODAY) => new Date(`${day}T${time}+03:00`);
const KEY = 'habit-tracker:v1';
const ALL7 = [1, 2, 3, 4, 5, 6, 7];
const MWF = [1, 3, 5];

/** Заглушка window.Notification (как в reminders.spec.js): вызовы пишутся в window.__notifications. */
async function stubNotifications(page) {
  await page.addInitScript(() => {
    window.__notifications = [];
    class FakeNotification {
      constructor(title, options = {}) {
        this.title = title;
        this.tag = options.tag ?? null;
        this.onclick = null;
        window.__notifications.push({ title, tag: this.tag });
      }
      close() {}
      static get permission() {
        return 'granted';
      }
      static requestPermission(callback) {
        if (typeof callback === 'function') callback('granted');
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  });
}

/** Записывает данные в localStorage один раз (до первой загрузки); reload их не перезаписывает. */
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

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Открыть страницу в фиксированный момент (без хода времени — для тестов без напоминаний). */
async function openFixed(page, time = msk('12:00:00')) {
  await page.clock.setFixedTime(time);
  await page.goto('/');
}

function habit(id, name, emoji, done, { days = ALL7, createdAt = '2026-08-01', reminder = null } = {}) {
  return { id, name, emoji, createdAt, done, reminder, days };
}

const seed = (...habits) => ({ version: 1, habits });

const cardById = (page, id) => page.locator(`[data-testid="habit-card"][data-habit-id="${id}"]`);
const cell = (card, date) => card.locator(`[data-testid="day-cell"][data-date="${date}"]`);
const dayBox = (card, day) => card.locator(`[data-testid="edit-day"][value="${day}"]`);
const storedHabits = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).habits, KEY);
const notificationTitles = (page) => page.evaluate(() => window.__notifications.map((n) => n.title));
const statsRows = (page) => page.getByTestId('stats-row');
const statsRow = (page, id) => page.locator(`[data-testid="stats-row"][data-habit-id="${id}"]`);
const period = (page, value) => page.locator(`[data-testid="stats-period"][data-period="${value}"]`);

async function openEdit(card) {
  await card.getByTestId('edit-habit').click();
  await expect(card.getByTestId('edit-form')).toBeVisible();
}

async function openStats(page) {
  await page.getByTestId('stats-toggle').click();
  await expect(page.getByTestId('stats-panel')).toBeVisible();
}

/** Даты подряд от from до to включительно (локальные календарные дни). */
function range(from, to) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; ; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const key = dt.toISOString().slice(0, 10); // UTC-полночь календарного числа — без сдвига пояса.
    out.push(key);
    if (key === to) return out;
  }
}

test.describe('расписание в форме ✏️ (AC-23)', () => {
  test('снять вт, чт, сб, вс → «Сохранить» → подпись «пн, ср, пт»; после перезагрузки на месте', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seed(habit('h1', 'Спортзал', '🏃', [])));
    await openFixed(page);
    const card = cardById(page, 'h1');
    await expect(card.getByTestId('habit-days')).toHaveCount(0);

    await openEdit(card);
    await expect(card.getByTestId('edit-day')).toHaveCount(7);
    for (const day of ALL7) {
      await expect(dayBox(card, day)).toBeChecked();
      await expect(dayBox(card, day)).toBeEnabled();
    }
    for (const day of [2, 4, 6, 7]) await dayBox(card, day).uncheck();
    await card.getByTestId('edit-save').click();

    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-days')).toHaveText('пн, ср, пт');
    await expect(card.getByTestId('habit-name')).toHaveText('Спортзал');
    expect((await storedHabits(page))[0].days).toEqual(MWF);

    await page.reload();
    const after = cardById(page, 'h1');
    await expect(after.getByTestId('habit-days')).toHaveText('пн, ср, пт');
    await openEdit(after);
    for (const day of ALL7) {
      if (MWF.includes(day)) await expect(dayBox(after, day)).toBeChecked();
      else await expect(dayBox(after, day)).not.toBeChecked();
    }
    expect(errors).toEqual([]);
  });

  test('снять все дни нельзя: последний отмеченный день не снимается', async ({ page }) => {
    await seedStorage(page, seed(habit('h1', 'Спортзал', '🏃', [], { days: MWF })));
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    await dayBox(card, 1).uncheck();
    await dayBox(card, 3).uncheck();

    // Остался только пт — его снять нельзя.
    await expect(dayBox(card, 5)).toBeChecked();
    await expect(dayBox(card, 5)).toBeDisabled();
    await expect(card.locator('[data-testid="edit-day"]:checked')).toHaveCount(1);

    // Вернули пн — пт снова можно снять.
    await dayBox(card, 1).check();
    await expect(dayBox(card, 5)).toBeEnabled();
    await dayBox(card, 1).uncheck();

    await card.getByTestId('edit-save').click();
    await expect(card.getByTestId('habit-days')).toHaveText('пт');
    const [saved] = await storedHabits(page);
    expect(saved.days).toEqual([5]);
  });

  test('«Отмена» не меняет дни; вернуть все дни → подпись исчезает, и после перезагрузки тоже', async ({ page }) => {
    await seedStorage(page, seed(habit('h1', 'Спортзал', '🏃', ['2026-10-12'], { days: MWF })));
    await openFixed(page);
    const card = cardById(page, 'h1');
    await expect(card.getByTestId('habit-days')).toHaveText('пн, ср, пт');

    await openEdit(card);
    await dayBox(card, 1).uncheck();
    await card.getByTestId('edit-cancel').click();
    await expect(card.getByTestId('habit-days')).toHaveText('пн, ср, пт');
    expect((await storedHabits(page))[0].days).toEqual(MWF);

    await openEdit(card);
    for (const day of [2, 4, 6, 7]) await dayBox(card, day).check();
    await card.getByTestId('edit-save').click();
    await expect(card.getByTestId('habit-days')).toHaveCount(0);
    await expect(card.locator('[data-testid="day-cell"][data-scheduled="false"]')).toHaveCount(0);
    expect((await storedHabits(page))[0].days).toEqual(ALL7);

    await page.reload();
    const after = cardById(page, 'h1');
    await expect(after.getByTestId('habit-days')).toHaveCount(0);
    await expect(cell(after, '2026-10-12')).toHaveAttribute('aria-pressed', 'true');
  });

  test('старые данные без расписания открываются как «каждый день» (AC-23, AC-31)', async ({ page }) => {
    const errors = collectErrors(page);
    // Данные первой версии: без полей days и reminder.
    await seedStorage(page, {
      version: 1,
      habits: [{ id: 'old', name: 'Вода', emoji: '💧', createdAt: '2026-08-01', done: ['2026-10-11', '2026-10-12'] }],
    });
    await openFixed(page);
    const card = cardById(page, 'old');
    await expect(card.getByTestId('habit-name')).toHaveText('Вода');
    await expect(card.getByTestId('habit-days')).toHaveCount(0);
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(card.getByTestId('day-cell')).toHaveCount(30);
    await expect(card.locator('[data-testid="day-cell"][data-scheduled="true"]')).toHaveCount(30);
    await expect(card.locator('.day-cell.is-off')).toHaveCount(0);
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 1');

    await openEdit(card);
    for (const day of ALL7) await expect(dayBox(card, day)).toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe('серия по расписанию на карточке (AC-24)', () => {
  test('«пн, ср, пт», сегодня суббота: пн+ср+пт → 🔥 3; без среды → 🔥 1 и рекорд по тем же правилам; отметка в вс → +1', async ({ page }) => {
    await seedStorage(
      page,
      seed(
        habit('full', 'Полная неделя', '🏃', ['2026-10-12', '2026-10-14', '2026-10-16'], { days: MWF }),
        // Цепочка пн 05, ср 07, пт 09, пн 12 (сб/вс без отметок не рвут), ср 14 пропущена.
        habit('noWed', 'Без среды', '🧘', ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-16'], { days: MWF }),
        habit('sunday', 'С воскресеньем', '💧', ['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-16'], { days: MWF }),
      ),
    );
    await openFixed(page, msk('12:00:00', '2026-10-17'));

    await expect(cardById(page, 'full').getByTestId('habit-streak')).toHaveText('🔥 3 дня подряд');
    await expect(cardById(page, 'full').getByTestId('habit-best-streak')).toHaveText('🏆 рекорд!');

    await expect(cardById(page, 'noWed').getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
    await expect(cardById(page, 'noWed').getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 4');

    await expect(cardById(page, 'sunday').getByTestId('habit-streak')).toHaveText('🔥 4 дня подряд');
  });
});

test.describe('выходные дни в сетке (AC-25)', () => {
  test('выходные выглядят иначе, кликабельны и пересчитывают серию; после перезагрузки отметка на месте', async ({ page }) => {
    await seedStorage(page, seed(habit('h1', 'Спортзал', '🏃', ['2026-10-09', '2026-10-12'], { days: MWF })));
    await openFixed(page);
    const card = cardById(page, 'h1');

    // 14.09…13.10: пн — 5, ср — 4, пт — 4 → 13 дней по расписанию, 17 выходных.
    await expect(card.getByTestId('day-cell')).toHaveCount(30);
    await expect(card.locator('[data-testid="day-cell"][data-scheduled="false"]')).toHaveCount(17);
    await expect(card.locator('.day-cell.is-off')).toHaveCount(17);
    for (const date of ['2026-10-10', '2026-10-11', TODAY]) {
      await expect(cell(card, date)).toHaveAttribute('data-scheduled', 'false');
      await expect(cell(card, date)).toHaveClass(/\bis-off\b/);
    }
    for (const date of ['2026-10-07', '2026-10-09', '2026-10-12']) {
      await expect(cell(card, date)).toHaveAttribute('data-scheduled', 'true');
      await expect(cell(card, date)).not.toHaveClass(/\bis-off\b/);
    }

    // Визуальное отличие: неотмеченный выходной (вс 11) и неотмеченный день по расписанию (ср 07).
    const look = (loc) => loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.opacity}|${s.backgroundImage}|${s.backgroundColor}`;
    });
    expect(await look(cell(card, '2026-10-11'))).not.toBe(await look(cell(card, '2026-10-07')));

    // Серия: пн 12, (сб/вс), пт 09, (чт), ср 07 не отмечена → 2.
    const streak = card.getByTestId('habit-streak');
    await expect(streak).toHaveText('🔥 2 дня подряд');

    await cell(card, '2026-10-11').click();
    await expect(cell(card, '2026-10-11')).toHaveAttribute('aria-pressed', 'true');
    await expect(streak).toHaveText('🔥 3 дня подряд');

    await cell(card, '2026-10-11').click();
    await expect(cell(card, '2026-10-11')).toHaveAttribute('aria-pressed', 'false');
    await expect(streak).toHaveText('🔥 2 дня подряд');

    // Сегодня (вт) — выходной, отметка добавляет +1.
    await cell(card, TODAY).click();
    await expect(cell(card, TODAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(streak).toHaveText('🔥 3 дня подряд');

    await page.reload();
    const after = cardById(page, 'h1');
    await expect(cell(after, TODAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(after, TODAY)).toHaveAttribute('data-scheduled', 'false');
    await expect(after.getByTestId('habit-streak')).toHaveText('🔥 3 дня подряд');
  });
});

test.describe('сводка дня с расписанием (AC-26)', () => {
  test('неотмеченная привычка с выходным сегодня не входит в Y; отмеченная в выходной — входит в X и Y', async ({ page }) => {
    await seedStorage(
      page,
      seed(
        habit('off', 'Спортзал', '🏃', [], { days: MWF }),
        habit('daily', 'Вода', '💧', []),
      ),
    );
    await openFixed(page);
    const summary = page.getByTestId('today-summary');
    await expect(summary).toHaveText('Сегодня выполнено 0 из 1');

    await cardById(page, 'off').getByTestId('toggle-today').click();
    await expect(summary).toHaveText('Сегодня выполнено 1 из 2');

    await cardById(page, 'daily').getByTestId('toggle-today').click();
    await expect(summary).toHaveText('Сегодня выполнено 2 из 2');

    await cardById(page, 'off').getByTestId('toggle-today').click();
    await expect(summary).toHaveText('Сегодня выполнено 1 из 1');

    await page.reload();
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 1');
  });
});

test.describe('напоминания только в дни по расписанию (AC-27)', () => {
  // Две привычки «пн, ср, пт» и две «вт, чт»; в каждой паре — оба режима.
  // «Каждые N» включены в пн 12.10 07:00, каждый час, активные часы 07:00–21:00.
  const interval = { mode: 'interval', intervalMin: 60, start: '07:00', end: '21:00', anchor: msk('07:00:00', '2026-10-12').getTime() };
  const times = { mode: 'times', times: ['08:00'] };
  const data = () => seed(
    habit('mwfTimes', 'Зал утром', '🏃', [], { days: MWF, reminder: times }),
    habit('mwfInterval', 'Вода', '💧', [], { days: MWF, reminder: interval }),
    habit('ttTimes', 'Йога', '🧘', [], { days: [2, 4], reminder: times }),
    habit('ttInterval', 'Чтение', '📚', [], { days: [2, 4], reminder: interval }),
  );

  test('вторник: приходят только напоминания привычек «вт, чт» (оба режима)', async ({ page }) => {
    await seedStorage(page, data());
    await stubNotifications(page);
    await page.clock.install({ time: msk('07:55:00') });
    await page.goto('/');
    await expect(page.getByTestId('habit-card')).toHaveCount(4);

    // Запас ≥ 1 мин после 08:00 на тик планировщика (15 с).
    await page.clock.runFor('07:00'); // ≈ 08:02
    expect((await notificationTitles(page)).sort()).toEqual(['📚 Пора: Чтение', '🧘 Пора: Йога'].sort());
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
  });

  test('среда: приходят только напоминания привычек «пн, ср, пт» (оба режима)', async ({ page }) => {
    await seedStorage(page, data());
    await stubNotifications(page);
    await page.clock.install({ time: msk('07:55:00', '2026-10-14') });
    await page.goto('/');
    await expect(page.getByTestId('habit-card')).toHaveCount(4);

    await page.clock.runFor('07:00'); // ≈ 08:02
    expect((await notificationTitles(page)).sort()).toEqual(['💧 Пора: Вода', '🏃 Пора: Зал утром'].sort());
  });
});

test.describe('блок статистики (AC-28)', () => {
  // «Каждый день», создана 01.09, первая отметка 15.08 (начало истории).
  // Отмечены: 15.08, 16.08, 01.09, 14.09…21.09 (8), 07.10…13.10 (7, включая сегодня) — 18 отметок.
  //   7 дней:  07.10…13.10 — 7 из 7 → 100%, отметок 7;
  //   30 дней: 14.09…13.10 — 15 из 30 → 50%, отметок 15;
  //   всё время: 15.08…13.10 — 18 из 60 → 30%, отметок 18.
  // Серия 7 (07.10…13.10), рекорд 8 (14.09…21.09).
  const done = [
    '2026-08-15', '2026-08-16', '2026-09-01',
    ...range('2026-09-14', '2026-09-21'),
    ...range('2026-10-07', TODAY),
  ];

  test('«📊 Статистика» открывает блок с периодом 30 дней; переключение периода пересчитывает; повторное нажатие закрывает', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seed(habit('a', 'Вода', '💧', done, { createdAt: '2026-09-01' })));
    await openFixed(page);

    const toggle = page.getByTestId('stats-toggle');
    const panel = page.getByTestId('stats-panel');
    await expect(toggle).toHaveText('📊 Статистика');
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(period(page, '30')).toHaveAttribute('aria-pressed', 'true');
    await expect(period(page, '7')).toHaveAttribute('aria-pressed', 'false');
    await expect(period(page, 'all')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 50%');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 15');
    await expect(statsRows(page)).toHaveCount(1);
    const row = statsRow(page, 'a');
    await expect(row).toContainText('💧');
    await expect(row).toContainText('Вода');
    await expect(row).toContainText('50%');
    await expect(row).toContainText('15 из 30');
    await expect(row).toContainText('🔥 7');
    await expect(row).toContainText('🏆 8');

    await period(page, '7').click();
    await expect(period(page, '7')).toHaveAttribute('aria-pressed', 'true');
    await expect(period(page, '30')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 100%');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 7');
    await expect(row).toContainText('7 из 7');

    await period(page, 'all').click();
    await expect(period(page, 'all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 30%');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 18');
    await expect(row).toContainText('18 из 60');

    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // В карточки статистика не добавляется.
    await expect(cardById(page, 'a').locator('[data-testid^="stats"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('процент и отметки по расписанию (AC-29)', () => {
  test('процент и «N из M» — по дням расписания с начала истории; отметки в выходные — во «всего отметок»', async ({ page }) => {
    // «пн, ср, пт», создана пт 25.09. Дни по расписанию 25.09…12.10 — 8; отмечены 6 из них
    // и две субботы (03.10, 10.10). Сегодня вторник — выходной.
    await seedStorage(page, seed(habit('gym', 'Спортзал', '🏃', [
      '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-03',
      '2026-10-05', '2026-10-09', '2026-10-10', '2026-10-12',
    ], { days: MWF, createdAt: '2026-09-25' })));
    await openFixed(page);
    await openStats(page);

    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 75%');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 8');
    await expect(statsRow(page, 'gym')).toContainText('6 из 8');

    // Отметка сегодня в выходной: только «всего отметок» меняется; блок пересчитывается сразу.
    await cardById(page, 'gym').getByTestId('toggle-today').click();
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 9');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 75%');
    await expect(statsRow(page, 'gym')).toContainText('6 из 8');
  });

  test('неотмеченное сегодня не занижает процент; отметка сегодня учитывается', async ({ page }) => {
    await seedStorage(page, seed(habit('a', 'Вода', '💧', ['2026-10-10', '2026-10-11', '2026-10-12'], { createdAt: '2026-10-10' })));
    await openFixed(page);
    await openStats(page);

    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 100%');
    await expect(statsRow(page, 'a')).toContainText('3 из 3');

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 100%');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 4');
    await expect(statsRow(page, 'a')).toContainText('4 из 4');

    await cardById(page, 'a').getByTestId('toggle-today').click();
    await expect(statsRow(page, 'a')).toContainText('3 из 3');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: 100%');
  });
});

test.describe('лучший день недели, сортировка, пустое состояние (AC-30)', () => {
  test('лучший день — с наибольшим процентом выполнения, а не с наибольшим числом отметок', async ({ page }) => {
    await seedStorage(
      page,
      seed(
        // Только пн с 14.09: 3 из 5 (60%).
        habit('mon', 'Понедельник', '📚', ['2026-09-14', '2026-09-21', '2026-09-28'], { days: [1], createdAt: '2026-09-14' }),
        // Только пт с 09.10: 1 из 1 (100%).
        habit('fri', 'Пятница', '🎸', ['2026-10-09'], { days: [5], createdAt: '2026-10-09' }),
      ),
    );
    await openFixed(page);
    await openStats(page);
    await expect(page.getByTestId('stats-best-weekday')).toHaveText('Лучший день: пятница');
  });

  test('нет данных (привычка создана сегодня, отметок нет) → «Лучший день: —»', async ({ page }) => {
    await seedStorage(page, seed(habit('new', 'Новая', '🌱', [], { createdAt: TODAY })));
    await openFixed(page);
    await openStats(page);
    await expect(page.getByTestId('stats-best-weekday')).toHaveText('Лучший день: —');
    await expect(page.getByTestId('stats-percent')).toHaveText('Выполнено: —');
    await expect(page.getByTestId('stats-total')).toHaveText('Всего отметок: 0');
    await expect(statsRow(page, 'new')).toContainText('0 из 0');
  });

  // Спорный случай (см. reports/004-schedule-stats/01/tests.md): дни по расписанию в периоде есть,
  // но ни одной отметки — выполнения нет, лучшего дня нет.
  test('дни по расписанию есть, но ни одной отметки за период → «Лучший день: —»', async ({ page }) => {
    await seedStorage(page, seed(habit('idle', 'Спортзал', '🏃', [], { days: MWF, createdAt: '2026-10-01' })));
    await openFixed(page);
    await openStats(page);
    await expect(statsRow(page, 'idle')).toContainText('0 из 5');
    await expect(page.getByTestId('stats-best-weekday')).toHaveText('Лучший день: —');
  });

  test('таблица отсортирована по проценту; название выводится как текст', async ({ page }) => {
    const errors = collectErrors(page);
    const htmlName = '<b>Жирный</b><img src=x>';
    // Все, кроме «none», созданы 10.10: дни по расписанию 10.10…12.10 — 3.
    await seedStorage(
      page,
      seed(
        habit('low', 'Мало', '📚', ['2026-10-10'], { createdAt: '2026-10-10' }),
        habit('none', 'Новая', '🌱', [], { createdAt: TODAY }),
        habit('high', htmlName, '💧', ['2026-10-10', '2026-10-11', '2026-10-12'], { createdAt: '2026-10-10' }),
        habit('mid', 'Средне', '🧘', ['2026-10-11', '2026-10-12'], { createdAt: '2026-10-10' }),
      ),
    );
    await openFixed(page);
    await openStats(page);

    await expect(statsRows(page)).toHaveCount(4);
    const ids = await statsRows(page).evaluateAll((rows) => rows.map((r) => r.dataset.habitId));
    expect(ids).toEqual(['high', 'mid', 'low', 'none']);
    await expect(statsRow(page, 'high')).toContainText('3 из 3');
    await expect(statsRow(page, 'mid')).toContainText('2 из 3');
    await expect(statsRow(page, 'low')).toContainText('1 из 3');
    await expect(statsRow(page, 'none')).toContainText('0 из 0');

    await expect(statsRow(page, 'high')).toContainText(htmlName);
    await expect(statsRow(page, 'high').locator('b, img')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('без привычек — подсказка вместо таблицы; после добавления привычки — строка таблицы', async ({ page }) => {
    await openFixed(page);
    await openStats(page);
    const empty = page.getByTestId('stats-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toHaveText('Добавьте привычку, чтобы увидеть статистику');
    await expect(statsRows(page)).toHaveCount(0);
    await expect(page.locator('#stats-table')).toBeHidden();

    await page.getByTestId('habit-name-input').fill('Читать');
    await page.getByTestId('add-habit').click();
    await expect(empty).toBeHidden();
    await expect(statsRows(page)).toHaveCount(1);
    await expect(statsRows(page).first()).toContainText('Читать');
  });
});
