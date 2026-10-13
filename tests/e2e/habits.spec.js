import { test, expect } from '@playwright/test';

// Фиксированный часовой пояс и управляемые часы: «сегодня» не зависит от реальной даты.
test.use({ timezoneId: 'Europe/Moscow', locale: 'ru-RU' });

const TODAY = '2026-10-13';

async function openAt(page, isoLocal = `${TODAY}T12:00:00+03:00`) {
  await page.clock.setFixedTime(new Date(isoLocal));
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
const cell = (card, date) => card.locator(`[data-testid="day-cell"][data-date="${date}"]`);

test.describe('пустое состояние (AC-9)', () => {
  test('без привычек показывается подсказка, после добавления — скрывается, после удаления — снова видна', async ({ page }) => {
    await openAt(page);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state')).toHaveText('Добавьте первую привычку');
    await expect(cards(page)).toHaveCount(0);

    await addHabit(page, 'Читать');
    await expect(page.getByTestId('empty-state')).toBeHidden();

    page.once('dialog', (d) => d.accept());
    await cards(page).first().getByTestId('delete-habit').click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});

test.describe('добавление привычки (AC-1, AC-2)', () => {
  test('привычка появляется с выбранным эмодзи', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Читать книгу', '📚');
    const card = cardByName(page, 'Читать книгу');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('habit-emoji')).toHaveText('📚');
  });

  test('без выбора эмодзи ставится ⭐, в том числе после предыдущего выбора', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Первая', '💧');
    await addHabit(page, 'Вторая');
    await expect(cardByName(page, 'Первая').getByTestId('habit-emoji')).toHaveText('💧');
    await expect(cardByName(page, 'Вторая').getByTestId('habit-emoji')).toHaveText('⭐');
  });

  test('в наборе ровно 12 эмодзи из требований, включая ✍️', async ({ page }) => {
    await openAt(page);
    const options = page.getByTestId('emoji-option');
    await expect(options).toHaveCount(12);
    // Полный набор из GOAL.md: 💧📚🏃🧘🥗😴✍️💊🎸🧹🌱⭐ (✍️ = U+270D U+FE0F)
    const expected = ['💧', '📚', '🏃', '🧘', '🥗', '😴', '✍️', '💊', '🎸', '🧹', '🌱', '⭐'];
    const shown = await options.evaluateAll((els) =>
      els.map((el) => ({
        data: el.getAttribute('data-emoji'),
        value: el.querySelector('input[name="emoji"]')?.value ?? null,
        face: el.textContent.trim(),
      })),
    );
    expect(shown.map((o) => o.data).sort()).toEqual([...expected].sort());
    // Значение radio и видимый символ совпадают с data-emoji
    for (const o of shown) {
      expect(o.value).toBe(o.data);
      expect(o.face).toBe(o.data);
    }
  });

  test('привычку можно добавить с эмодзи ✍️', async ({ page }) => {
    await openAt(page);
    await page.getByTestId('habit-name-input').fill('Дневник');
    await page.locator('[data-testid="emoji-option"][data-emoji="✍️"]').click();
    await page.getByTestId('add-habit').click();
    await expect(cardByName(page, 'Дневник').getByTestId('habit-emoji')).toHaveText('✍️');
    await page.reload();
    await expect(cardByName(page, 'Дневник').getByTestId('habit-emoji')).toHaveText('✍️');
  });

  test('пустое название и только пробелы не добавляются', async ({ page }) => {
    await openAt(page);
    await page.getByTestId('add-habit').click();
    await expect(cards(page)).toHaveCount(0);

    await addHabit(page, '     ');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 0');
  });

  test('пробелы по краям названия обрезаются', async ({ page }) => {
    await openAt(page);
    await addHabit(page, '   Пить воду   ');
    await expect(cards(page)).toHaveCount(1);
    const text = await cards(page).first().getByTestId('habit-name').textContent();
    expect(text).toBe('Пить воду');
  });

  test('название длиннее 40 символов ввести нельзя', async ({ page }) => {
    await openAt(page);
    const input = page.getByTestId('habit-name-input');
    await input.pressSequentially('а'.repeat(45));
    const value = await input.inputValue();
    expect(value).toBe('а'.repeat(40));
    await page.getByTestId('add-habit').click();
    const name = await cards(page).first().getByTestId('habit-name').textContent();
    expect(name).toBe('а'.repeat(40));
  });

  test('одинаковые названия разрешены', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Йога');
    await addHabit(page, 'Йога');
    await expect(cardByName(page, 'Йога')).toHaveCount(2);
  });

  test('название с HTML выводится как текст, а не разметка', async ({ page }) => {
    await openAt(page);
    await addHabit(page, '<b>жирный</b><img src=x>');
    const card = cards(page).first();
    expect(await card.getByTestId('habit-name').textContent()).toBe('<b>жирный</b><img src=x>');
    await expect(card.locator('b')).toHaveCount(0);
    await expect(card.locator('img')).toHaveCount(0);
  });
});

test.describe('отметка за сегодня, серия и сводка (AC-3, AC-4, AC-7)', () => {
  test('нажатие «сегодня» отмечает, повторное снимает; серия и сводка пересчитываются', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Читать', '📚');
    await addHabit(page, 'Бегать', '🏃');
    const summary = page.getByTestId('today-summary');
    await expect(summary).toHaveText('Сегодня выполнено 0 из 2');

    const card = cardByName(page, 'Читать');
    const other = cardByName(page, 'Бегать');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');

    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(card, TODAY)).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
    await expect(summary).toHaveText('Сегодня выполнено 1 из 2');
    // другая привычка не затронута
    await expect(other.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expect(other.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');

    await card.getByTestId('toggle-today').click();
    await expect(card.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');
    await expect(cell(card, TODAY)).toHaveAttribute('aria-pressed', 'false');
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');
    await expect(summary).toHaveText('Сегодня выполнено 0 из 2');
  });

  test('сводка обновляется при добавлении и удалении', async ({ page }) => {
    await openAt(page);
    const summary = page.getByTestId('today-summary');
    await addHabit(page, 'A');
    await cardByName(page, 'A').getByTestId('toggle-today').click();
    await expect(summary).toHaveText('Сегодня выполнено 1 из 1');
    await addHabit(page, 'B');
    await expect(summary).toHaveText('Сегодня выполнено 1 из 2');
    page.once('dialog', (d) => d.accept());
    await cardByName(page, 'A').getByTestId('delete-habit').click();
    await expect(summary).toHaveText('Сегодня выполнено 0 из 1');
  });
});

test.describe('сетка 30 дней (AC-4, AC-5)', () => {
  test('30 клеток, последняя — сегодня, будущих дней нет', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Сетка');
    const days = cards(page).first().getByTestId('day-cell');
    await expect(days).toHaveCount(30);
    const dates = await days.evaluateAll((els) => els.map((el) => el.getAttribute('data-date')));
    expect(dates[29]).toBe(TODAY);
    expect(dates[0]).toBe('2026-09-14');
    expect(new Set(dates).size).toBe(30);
    expect(dates.every((d) => d <= TODAY)).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });

  test('клик по прошедшим дням меняет серию; пропуск дня её обрывает', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Медитация', '🧘');
    const card = cardByName(page, 'Медитация');
    const streak = card.getByTestId('habit-streak');

    // Пример из AC-4: вчера и позавчера, сегодня нет → 🔥 2
    await cell(card, '2026-10-12').click();
    await cell(card, '2026-10-11').click();
    await expect(cell(card, '2026-10-12')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(card, '2026-10-11')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(card, TODAY)).toHaveAttribute('aria-pressed', 'false');
    await expect(streak).toHaveText('🔥 2 дня подряд');
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 1');

    // Клик по сегодняшней клетке — то же, что «сегодня»
    await cell(card, TODAY).click();
    await expect(streak).toHaveText('🔥 3 дня подряд');
    await expect(card.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 1');

    // Снимаем вчера → пропуск, серия только из сегодняшнего дня
    await cell(card, '2026-10-12').click();
    await expect(cell(card, '2026-10-12')).toHaveAttribute('aria-pressed', 'false');
    await expect(streak).toHaveText('🔥 1 день подряд');

    // Снимаем сегодня → вчера пропущено → 0
    await cell(card, TODAY).click();
    await expect(streak).toHaveText('🔥 0 дней подряд');
  });

  test('отмеченные дни визуально выделены', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Цвет');
    const card = cards(page).first();
    await cell(card, '2026-10-10').click();
    await expect(cell(card, '2026-10-10')).toHaveAttribute('aria-pressed', 'true');
    const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
    const doneBg = await bg(cell(card, '2026-10-10'));
    const emptyBg = await bg(cell(card, '2026-10-09'));
    expect(doneBg).not.toBe(emptyBg);
  });

  test('на границе месяца сетка захватывает прошлый месяц и серия считается через неё', async ({ page }) => {
    await openAt(page, '2026-03-01T12:00:00+03:00');
    await addHabit(page, 'Март');
    const card = cards(page).first();
    const days = card.getByTestId('day-cell');
    await expect(days).toHaveCount(30);
    await expect(days.first()).toHaveAttribute('data-date', '2026-01-31');
    await expect(days.last()).toHaveAttribute('data-date', '2026-03-01');
    await expect(card.locator('[data-testid="day-cell"][data-date="2026-02-29"]')).toHaveCount(0);

    await cell(card, '2026-02-28').click();
    await cell(card, '2026-02-27').click();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
  });

  test('около полуночи «сегодня» — локальный день, а не UTC', async ({ page }) => {
    // 00:30 по Москве = 21:30 UTC предыдущего дня
    await openAt(page, `${TODAY}T00:30:00+03:00`);
    await addHabit(page, 'Полночь');
    const days = cards(page).first().getByTestId('day-cell');
    await expect(days.last()).toHaveAttribute('data-date', TODAY);
  });
});

test.describe('удаление (AC-6)', () => {
  test('отмена подтверждения ничего не меняет, подтверждение удаляет привычку и её отметки', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Удаляемая', '🎸');
    await addHabit(page, 'Остаётся', '🌱');
    const card = cardByName(page, 'Удаляемая');
    await card.getByTestId('toggle-today').click();
    await cell(card, '2026-10-12').click();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');

    // Отмена
    let dialogInfo;
    page.once('dialog', async (d) => {
      dialogInfo = { type: d.type(), message: d.message() };
      await d.dismiss();
    });
    await card.getByTestId('delete-habit').click();
    await expect.poll(() => dialogInfo).toBeTruthy();
    expect(dialogInfo.type).toBe('confirm');
    expect(dialogInfo.message).toContain('Удаляемая');
    await expect(cards(page)).toHaveCount(2);
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(cell(card, '2026-10-12')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 2');

    // Подтверждение
    page.once('dialog', (d) => d.accept());
    await card.getByTestId('delete-habit').click();
    await expect(cardByName(page, 'Удаляемая')).toHaveCount(0);
    await expect(cardByName(page, 'Остаётся')).toHaveCount(1);
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 1');

    // После перезагрузки удалённая не возвращается
    await page.reload();
    await expect(cardByName(page, 'Удаляемая')).toHaveCount(0);
    await expect(cardByName(page, 'Остаётся')).toHaveCount(1);
  });

  test('новая привычка с тем же названием не наследует отметки удалённой', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Повтор');
    await cards(page).first().getByTestId('toggle-today').click();
    await cell(cards(page).first(), '2026-10-12').click();
    page.once('dialog', (d) => d.accept());
    await cards(page).first().getByTestId('delete-habit').click();
    await expect(cards(page)).toHaveCount(0);

    await addHabit(page, 'Повтор');
    const card = cards(page).first();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');
    await expect(card.locator('[data-testid="day-cell"][aria-pressed="true"]')).toHaveCount(0);
  });
});

test.describe('сохранение после перезагрузки (AC-8)', () => {
  test('привычки, эмодзи и все отметки на месте после page.reload()', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Вода', '💧');
    await addHabit(page, 'Сон', '😴');
    await addHabit(page, 'Без эмодзи');

    const water = cardByName(page, 'Вода');
    await water.getByTestId('toggle-today').click();
    await cell(water, '2026-10-12').click();
    await cell(water, '2026-09-14').click();
    const sleep = cardByName(page, 'Сон');
    await cell(sleep, '2026-10-01').click();

    await expect(water.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');

    await page.reload();

    await expect(cards(page)).toHaveCount(3);
    const names = await page.getByTestId('habit-name').allTextContents();
    expect(names).toEqual(['Вода', 'Сон', 'Без эмодзи']);
    await expect(cardByName(page, 'Вода').getByTestId('habit-emoji')).toHaveText('💧');
    await expect(cardByName(page, 'Сон').getByTestId('habit-emoji')).toHaveText('😴');
    await expect(cardByName(page, 'Без эмодзи').getByTestId('habit-emoji')).toHaveText('⭐');

    const w = cardByName(page, 'Вода');
    await expect(w.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    const wDone = await w
      .locator('[data-testid="day-cell"][aria-pressed="true"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-date')));
    expect(wDone.sort()).toEqual(['2026-09-14', '2026-10-12', TODAY]);
    await expect(w.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');

    const s = cardByName(page, 'Сон');
    const sDone = await s
      .locator('[data-testid="day-cell"][aria-pressed="true"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-date')));
    expect(sDone).toEqual(['2026-10-01']);

    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 3');
    await expect(page.getByTestId('empty-state')).toBeHidden();
  });

  test('данные пишутся под своим ключом и не стирают чужие ключи localStorage', async ({ page }) => {
    await openAt(page);
    await page.evaluate(() => localStorage.setItem('other-app', 'keep me'));
    await addHabit(page, 'Ключ');
    await page.reload();
    await expect(cardByName(page, 'Ключ')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('other-app'))).toBe('keep me');
  });

  test('повреждённые данные в хранилище не ломают страницу', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00+03:00`));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('habit-tracker:v1', '{broken json');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 0');
    await addHabit(page, 'После сбоя');
    await expect(cardByName(page, 'После сбоя')).toHaveCount(1);
    await page.reload();
    await expect(cardByName(page, 'После сбоя')).toHaveCount(1);
  });
});

test.describe('две вкладки (регрессия: замечание 1 аудита 01)', () => {
  test('изменения из одной вкладки видны в другой без reload и не теряются при записи', async ({ context }) => {
    // Управляемые часы на весь контекст: обе вкладки живут в одном «сегодня».
    await context.clock.setFixedTime(new Date(`${TODAY}T12:00:00+03:00`));
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/');
    await b.goto('/');
    await expect(a.getByTestId('empty-state')).toBeVisible();
    await expect(b.getByTestId('empty-state')).toBeVisible();

    // A добавляет привычку → B видит её без перезагрузки (событие storage)
    await addHabit(a, 'Вода', '💧');
    await expect(cardByName(a, 'Вода')).toHaveCount(1);
    await expect(cardByName(b, 'Вода')).toHaveCount(1);
    await expect(cardByName(b, 'Вода').getByTestId('habit-emoji')).toHaveText('💧');
    await expect(b.getByTestId('empty-state')).toBeHidden();
    await expect(b.getByTestId('today-summary')).toHaveText('Сегодня выполнено 0 из 1');

    // B отмечает привычку (сегодня и вчера) → A видит отметки без перезагрузки
    const bWater = cardByName(b, 'Вода');
    await bWater.getByTestId('toggle-today').click();
    await cell(bWater, '2026-10-12').click();
    await expect(bWater.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    const aWater = cardByName(a, 'Вода');
    await expect(aWater.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(aWater.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');

    // A снова пишет: её запись не должна затереть отметки, сделанные в B
    await addHabit(a, 'Сон', '😴');
    await expect(cardByName(b, 'Сон')).toHaveCount(1);

    // После реальной перезагрузки A всё на месте: обе привычки и отметки из B
    await a.reload();
    await expect(cards(a)).toHaveCount(2);
    expect(await a.getByTestId('habit-name').allTextContents()).toEqual(['Вода', 'Сон']);
    const w = cardByName(a, 'Вода');
    await expect(w.getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    const done = await w
      .locator('[data-testid="day-cell"][aria-pressed="true"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-date')));
    expect(done.sort()).toEqual(['2026-10-12', TODAY]);
    await expect(w.getByTestId('habit-streak')).toHaveText('🔥 2 дня подряд');
    await expect(a.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 2');

    // И B после перезагрузки видит то же самое
    await b.reload();
    await expect(cards(b)).toHaveCount(2);
    await expect(cardByName(b, 'Вода').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
    await expect(cardByName(b, 'Сон')).toHaveCount(1);
  });

  test('удаление в одной вкладке не возвращается записью из другой', async ({ context }) => {
    await context.clock.setFixedTime(new Date(`${TODAY}T12:00:00+03:00`));
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/');
    await b.goto('/');

    await addHabit(a, 'Удалить');
    await addHabit(a, 'Оставить');
    await expect(cards(b)).toHaveCount(2);

    a.once('dialog', (d) => d.accept());
    await cardByName(a, 'Удалить').getByTestId('delete-habit').click();
    await expect(cardByName(a, 'Удалить')).toHaveCount(0);
    await expect(cardByName(b, 'Удалить')).toHaveCount(0);

    // B отмечает оставшуюся — удалённая не должна воскреснуть
    await cardByName(b, 'Оставить').getByTestId('toggle-today').click();
    await a.reload();
    await expect(cards(a)).toHaveCount(1);
    await expect(cardByName(a, 'Оставить').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('фокус клавиатуры после действия (регрессия: замечание 5 аудита 01)', () => {
  test('после Enter/Space на «Сегодня» фокус остаётся на кнопке «Сегодня» той же привычки', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Первая');
    await addHabit(page, 'Вторая');
    const card = cardByName(page, 'Вторая');
    const btn = card.getByTestId('toggle-today');

    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toBeFocused();
    await expect(cardByName(page, 'Первая').getByTestId('toggle-today')).toHaveAttribute('aria-pressed', 'false');

    // Повторно с клавиатуры, не трогая фокус: Space снимает отметку, фокус на месте
    await page.keyboard.press('Space');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(btn).toBeFocused();

    // И ещё раз Enter — снова отмечает: значит, фокус действительно на этой кнопке
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toBeFocused();
    await expect(page.getByTestId('today-summary')).toHaveText('Сегодня выполнено 1 из 2');
  });

  test('после Enter/Space на клетке сетки фокус остаётся на той же клетке той же привычки', async ({ page }) => {
    await openAt(page);
    await addHabit(page, 'Первая');
    await addHabit(page, 'Вторая');
    const card = cardByName(page, 'Первая');
    const day = cell(card, '2026-10-12');

    await day.focus();
    await page.keyboard.press('Space');
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(day).toBeFocused();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 1 день подряд');
    // У другой привычки та же дата не отмечена и не в фокусе
    await expect(cell(cardByName(page, 'Вторая'), '2026-10-12')).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Enter');
    await expect(day).toHaveAttribute('aria-pressed', 'false');
    await expect(day).toBeFocused();
    await expect(card.getByTestId('habit-streak')).toHaveText('🔥 0 дней подряд');

    // Tab после перерисовки уводит на следующую клетку (фокус не сбросился на body)
    await page.keyboard.press('Tab');
    await expect(cell(card, TODAY)).toBeFocused();
  });
});
