import { test, expect } from '@playwright/test';

// Итерация 003: рекорд серии (AC-17, AC-18) и редактирование привычки (AC-19…AC-21).
// Фиксированный часовой пояс и управляемые часы: «сегодня» = 2026-10-13 (вторник),
// сетка 30 дней — с 2026-09-14 по 2026-10-13.
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';
const msk = (time, day = TODAY) => new Date(`${day}T${time}+03:00`);
const KEY = 'habit-tracker:v1';

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

async function addHabit(page, name, emoji) {
  await page.getByTestId('habit-name-input').fill(name);
  if (emoji) {
    await page.getByTestId('emoji-option').filter({ hasText: emoji }).click();
  }
  await page.getByTestId('add-habit').click();
}

function habit(id, name, emoji, done, reminder = null) {
  return { id, name, emoji, createdAt: '2026-08-01', done, reminder };
}

const cards = (page) => page.getByTestId('habit-card');
// Во время редактирования habit-name в карточке нет, поэтому карточку ищем по id привычки.
const cardById = (page, id) => page.locator(`[data-testid="habit-card"][data-habit-id="${id}"]`);
const cell = (card, date) => card.locator(`[data-testid="day-cell"][data-date="${date}"]`);
const editOption = (card, emoji) => card.locator(`[data-testid="edit-emoji-option"][data-emoji="${emoji}"]`);
const notificationTitles = (page) => page.evaluate(() => window.__notifications.map((n) => n.title));
const storedHabits = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).habits, KEY);

async function openEdit(card) {
  await card.getByTestId('edit-habit').click();
  await expect(card.getByTestId('edit-form')).toBeVisible();
}

test.describe('рекорд серии (AC-17)', () => {
  test('5 дней подряд месяц назад и 2 дня до сегодня → «🔥 2 …» и «🏆 рекорд: 5»; цепочки вне сетки учитываются', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, {
      version: 1,
      habits: [
        // Цепочка 5 дней целиком за пределами 30 дней сетки (сетка начинается 2026-09-14).
        habit('outside', 'Вне сетки', '📚', [
          '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
          '2026-10-12', '2026-10-13',
        ]),
        // Цепочка 5 дней через левую границу сетки: 09-11…09-13 вне сетки, 09-14…09-15 в сетке.
        habit('border', 'На границе', '💧', [
          '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
          '2026-10-12', '2026-10-13',
        ]),
      ],
    });
    await openFixed(page);

    const outside = cardById(page, 'outside');
    await expect(outside.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(outside.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 5');
    // Дни рекордной цепочки действительно не показаны в сетке.
    await expect(outside.getByTestId('day-cell')).toHaveCount(30);
    await expect(cell(outside, '2026-09-05')).toHaveCount(0);
    await expect(cell(outside, '2026-09-14')).toHaveCount(1);

    const border = cardById(page, 'border');
    await expect(border.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(border.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 5');
    await expect(cell(border, '2026-09-13')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('рекорд через смену месяца и через 29 февраля не ломается', async ({ page }) => {
    await seedStorage(page, {
      version: 1,
      habits: [
        habit('leap', 'Високосный', '🌱', ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', TODAY]),
        habit('month', 'Месяц', '🧘', ['2026-09-29', '2026-09-30', '2026-10-01', TODAY]),
      ],
    });
    await openFixed(page);
    await expect(cardById(page, 'leap').getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 4');
    await expect(cardById(page, 'month').getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 3');
    await expect(cardById(page, 'month').getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
  });
});

test.describe('рекорд: «🏆 рекорд!», отсутствие и пересчёт (AC-18)', () => {
  test('без отметок рекорда нет; отметка сегодня → «🏆 рекорд!»; снятие → рекорда снова нет', async ({ page }) => {
    await openFixed(page);
    await addHabit(page, 'Читать', '📚');
    const card = cards(page).first();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');
    await expect(card.getByTestId('habit-best-streak')).toHaveCount(0);

    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
    await expect(card.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд!');

    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('habit-best-streak')).toHaveCount(0);
  });

  test('рекорд равен серии, заканчивающейся вчера (сегодня не отмечено) → «🏆 рекорд!»', async ({ page }) => {
    await seedStorage(page, {
      version: 1,
      habits: [habit('h1', 'Бег', '🏃', ['2026-10-01', '2026-10-11', '2026-10-12'])],
    });
    await openFixed(page);
    const card = cardById(page, 'h1');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(card.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд!');
  });

  test('снятие отметки в сетке пересчитывает рекорд вниз; отметка — вверх', async ({ page }) => {
    await seedStorage(page, {
      version: 1,
      habits: [
        habit('h1', 'Вода', '💧', [
          '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
          '2026-10-10', '2026-10-11',
          TODAY,
        ]),
      ],
    });
    await openFixed(page);
    const card = cardById(page, 'h1');
    const best = card.getByTestId('habit-best-streak');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
    await expect(best).toHaveText('🏆 рекорд: 4');

    // Разрываем цепочку из 4 дней: остаются 1, 2, 2, 1 → рекорд 2.
    await cell(card, '2026-10-06').click();
    await expect(cell(card, '2026-10-06')).toHaveAttribute('aria-pressed', 'false');
    await expect(best).toHaveText('🏆 рекорд: 2');

    // Отмечаем 12-е: 10, 11, 12, 13 → серия 4 = рекорд.
    await cell(card, '2026-10-12').click();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 4 дня подряд');
    await expect(best).toHaveText('🏆 рекорд!');

    // Снимаем сегодня: серия 3 (до вчера) = рекорд 3.
    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 3 дня подряд');
    await expect(best).toHaveText('🏆 рекорд!');

    // Пересчёт сохраняется после перезагрузки.
    await page.reload();
    await expect(cardById(page, 'h1').getByTestId('habit-best-streak')).toHaveText('🏆 рекорд!');
    await expect(cardById(page, 'h1').getByTestId('habit-streak')).toHaveText('🔥 3 дня подряд');
  });
});

test.describe('редактирование: сохранение и отмена (AC-19)', () => {
  const seeded = () => ({
    version: 1,
    habits: [
      habit('h1', 'Читать', '📚', ['2026-10-12', TODAY]),
      habit('h2', 'Другая', '💧', []),
    ],
  });

  test('✏️ открывает форму с текущими значениями; «Сохранить» → карточка с новыми названием и эмодзи', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await expect(card.getByTestId('edit-habit')).toHaveAttribute('aria-expanded', 'false');

    await openEdit(card);
    await expect(card.getByTestId('edit-habit')).toHaveAttribute('aria-expanded', 'true');
    const input = card.getByTestId('edit-name-input');
    await expect(input).toHaveValue('Читать');
    await expect(input).toBeFocused();
    await expect(card.getByTestId('edit-emoji-option')).toHaveCount(12);
    await expect(editOption(card, '📚').locator('input[type="radio"]')).toBeChecked();
    // Заголовок заменён формой.
    await expect(card.getByTestId('habit-name')).toHaveCount(0);

    await input.fill('Читать книгу');
    await editOption(card, '🎸').click();
    await card.getByTestId('edit-save').click();

    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-name')).toHaveText('Читать книгу');
    await expect(card.getByTestId('habit-emoji')).toHaveText('🎸');
    await expect(card.getByTestId('edit-habit')).toBeFocused();
    await expect(card.getByTestId('edit-habit')).toHaveAttribute('aria-expanded', 'false');

    // Другая привычка не изменилась.
    await expect(cardById(page, 'h2').getByTestId('habit-name')).toHaveText('Другая');
    await expect(cardById(page, 'h2').getByTestId('habit-emoji')).toHaveText('💧');
    // Форма добавления не затронута выбором эмодзи в форме редактирования.
    await expect(page.locator('#add-form input[name="emoji"][value="⭐"]')).toBeChecked();
  });

  test('Enter в поле названия сохраняет', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    await editOption(card, '🌱').click();
    const input = card.getByTestId('edit-name-input');
    await input.fill('Читать по вечерам');
    await input.press('Enter');

    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-name')).toHaveText('Читать по вечерам');
    await expect(card.getByTestId('habit-emoji')).toHaveText('🌱');
  });

  test('«Отмена» — ничего не меняется, в том числе после перезагрузки', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('Не сохранять');
    await editOption(card, '🎸').click();
    await card.getByTestId('edit-cancel').click();

    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-name')).toHaveText('Читать');
    await expect(card.getByTestId('habit-emoji')).toHaveText('📚');
    await expect(card.getByTestId('edit-habit')).toBeFocused();

    // Повторное открытие показывает исходные значения, а не брошенный черновик.
    await openEdit(card);
    await expect(card.getByTestId('edit-name-input')).toHaveValue('Читать');
    await expect(editOption(card, '📚').locator('input[type="radio"]')).toBeChecked();
    await card.getByTestId('edit-cancel').click();

    await page.reload();
    await expect(cardById(page, 'h1').getByTestId('habit-name')).toHaveText('Читать');
    await expect(cardById(page, 'h1').getByTestId('habit-emoji')).toHaveText('📚');
  });

  test('Esc — ничего не меняется (из поля и после выбора эмодзи)', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');

    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('Не сохранять');
    await card.getByTestId('edit-name-input').press('Escape');
    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-name')).toHaveText('Читать');
    await expect(card.getByTestId('habit-emoji')).toHaveText('📚');

    await openEdit(card);
    await editOption(card, '🎸').click();
    await editOption(card, '🎸').locator('input[type="radio"]').press('Escape');
    await expect(card.getByTestId('edit-form')).toHaveCount(0);
    await expect(card.getByTestId('habit-emoji')).toHaveText('📚');

    expect((await storedHabits(page)).find((h) => h.id === 'h1')).toMatchObject({ name: 'Читать', emoji: '📚' });
  });

  test('перерисовка во время редактирования (клик в сетке) не теряет введённое', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('Черновик');
    await editOption(card, '🧹').click();

    await cell(card, '2026-10-10').click();
    await expect(cell(card, '2026-10-10')).toHaveAttribute('aria-pressed', 'true');

    await expect(card.getByTestId('edit-form')).toBeVisible();
    await expect(card.getByTestId('edit-name-input')).toHaveValue('Черновик');
    await expect(editOption(card, '🧹').locator('input[type="radio"]')).toBeChecked();

    await card.getByTestId('edit-save').click();
    await expect(card.getByTestId('habit-name')).toHaveText('Черновик');
    await expect(card.getByTestId('habit-emoji')).toHaveText('🧹');
    await expect(cell(card, '2026-10-10')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('редактирование: правила названия (AC-20)', () => {
  const seeded = () => ({ version: 1, habits: [habit('h1', 'Читать', '📚', [TODAY])] });

  for (const [label, value] of [['пустое', ''], ['только пробелы', '    ']]) {
    test(`${label} название не сохраняется, форма остаётся открытой`, async ({ page }) => {
      await seedStorage(page, seeded());
      await openFixed(page);
      const card = cardById(page, 'h1');
      await openEdit(card);
      await card.getByTestId('edit-name-input').fill(value);
      await editOption(card, '🎸').click();
      await card.getByTestId('edit-save').click();

      await expect(card.getByTestId('edit-form')).toBeVisible();
      expect((await storedHabits(page))[0]).toMatchObject({ name: 'Читать', emoji: '📚' });

      // Enter тоже не сохраняет.
      await card.getByTestId('edit-name-input').fill(value);
      await card.getByTestId('edit-name-input').press('Enter');
      await expect(card.getByTestId('edit-form')).toBeVisible();

      await card.getByTestId('edit-cancel').click();
      await expect(card.getByTestId('habit-name')).toHaveText('Читать');
      await expect(card.getByTestId('habit-emoji')).toHaveText('📚');

      await page.reload();
      await expect(cardById(page, 'h1').getByTestId('habit-name')).toHaveText('Читать');
    });
  }

  test('пробелы по краям обрезаются', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('   Пить воду   ');
    await card.getByTestId('edit-save').click();
    expect(await card.getByTestId('habit-name').textContent()).toBe('Пить воду');
    expect((await storedHabits(page))[0].name).toBe('Пить воду');
  });

  test('название длиннее 40 символов ввести нельзя', async ({ page }) => {
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    const input = card.getByTestId('edit-name-input');
    await input.fill('');
    await input.pressSequentially('ж'.repeat(45));
    expect(await input.inputValue()).toBe('ж'.repeat(40));
    await card.getByTestId('edit-save').click();
    expect(await card.getByTestId('habit-name').textContent()).toBe('ж'.repeat(40));
  });

  /**
   * Название — только текст: у названия нет дочерних элементов, <b> и <img src=x> нет;
   * единственная картинка в карточке — эмодзи Noto 📚 (AC-37) в месте эмодзи; на карточке —
   * анимированный WebP (AC-38 в редакции 14.10.2026; reducedMotion по умолчанию no-preference).
   */
  async function expectNameIsPlainText(card) {
    await expect(card.locator('[data-testid="habit-name"] *')).toHaveCount(0);
    await expect(card.locator('b')).toHaveCount(0);
    await expect(card.locator('img[src="x"]')).toHaveCount(0);
    await expect(card.locator('img')).toHaveCount(1);
    const emojiImg = card.locator('[data-testid="habit-emoji"] img.emoji-img');
    await expect(emojiImg).toHaveCount(1);
    await expect(emojiImg).toHaveAttribute('src', 'emoji/1f4da.webp');
  }

  test('HTML в новом названии выводится как текст', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, seeded());
    await openFixed(page);
    const card = cardById(page, 'h1');
    await openEdit(card);
    const name = '<b>жирный</b><img src=x>';
    await card.getByTestId('edit-name-input').fill(name);
    await card.getByTestId('edit-save').click();
    expect(await card.getByTestId('habit-name').textContent()).toBe(name);
    await expectNameIsPlainText(card);

    await page.reload();
    expect(await cardById(page, 'h1').getByTestId('habit-name').textContent()).toBe(name);
    await expectNameIsPlainText(cardById(page, 'h1'));
    expect(errors).toEqual([]);
  });
});

test.describe('после редактирования всё сохраняется (AC-21)', () => {
  test('отметки, серия, рекорд и напоминание на месте; уведомление — с новыми названием и эмодзи; после reload — изменения', async ({ page }) => {
    const errors = collectErrors(page);
    const reminder = { mode: 'times', times: ['10:00'] };
    await seedStorage(page, {
      version: 1,
      habits: [
        // Сегодня не отмечено → напоминание «в определённое время» придёт в 10:00.
        habit('h1', 'Читать', '📚', ['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-11', '2026-10-12'], reminder),
      ],
    });
    await stubNotifications(page);
    await page.clock.install({ time: msk('09:30:00') });
    await page.goto('/');

    const card = cardById(page, 'h1');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(card.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 3');
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 10:00');

    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('Читать книгу');
    await editOption(card, '🎸').click();
    await card.getByTestId('edit-name-input').press('Enter');
    await expect(card.getByTestId('habit-name')).toHaveText('Читать книгу');
    await expect(card.getByTestId('habit-emoji')).toHaveText('🎸');

    // Отметки, серия, рекорд и напоминание не потерялись.
    await expect(cell(card, '2026-10-11')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(card, '2026-10-12')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(card, TODAY)).toHaveAttribute('aria-pressed', 'false');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(card.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 3');
    await expect(card.getByTestId('reminder-label')).toHaveText('🔔 10:00');

    const [saved] = await storedHabits(page);
    expect(saved).toMatchObject({
      id: 'h1',
      name: 'Читать книгу',
      emoji: '🎸',
      createdAt: '2026-08-01',
      done: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-11', '2026-10-12'],
      reminder,
    });

    // Следующее уведомление (10:00) — с новыми названием и эмодзи. Запас ≥ 1 мин на тик планировщика.
    expect(await notificationTitles(page)).toEqual([]);
    await page.clock.runFor('31:00'); // ≈ 10:01
    expect(await notificationTitles(page)).toEqual(['🎸 Пора: Читать книгу']);

    // Перезагрузка: изменения на месте.
    await page.reload();
    const after = cardById(page, 'h1');
    await expect(after.getByTestId('habit-name')).toHaveText('Читать книгу');
    await expect(after.getByTestId('habit-emoji')).toHaveText('🎸');
    await expect(cell(after, '2026-10-11')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(after, '2026-10-12')).toHaveAttribute('aria-pressed', 'true');
    await expect(after.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(after.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд: 3');
    await expect(after.getByTestId('reminder-label')).toHaveText('🔔 10:00');

    expect(errors).toEqual([]);
  });

  test('редактирование привычки, добавленной через интерфейс, сохраняется после перезагрузки', async ({ page }) => {
    await openFixed(page);
    await addHabit(page, 'Опечтака', '⭐');
    const card = cards(page).first();
    await card.getByTestId('toggle-today').click();
    await openEdit(card);
    await card.getByTestId('edit-name-input').fill('Опечатка');
    await editOption(card, '✍️').click();
    await card.getByTestId('edit-save').click();
    await expect(card.getByTestId('habit-name')).toHaveText('Опечатка');

    await page.reload();
    const after = cards(page).first();
    await expect(cards(page)).toHaveCount(1);
    await expect(after.getByTestId('habit-name')).toHaveText('Опечатка');
    await expect(after.getByTestId('habit-emoji')).toHaveText('✍️');
    await expect(after.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(after.getByTestId('habit-best-streak')).toHaveText('🏆 рекорд!');
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 1');
  });
});
