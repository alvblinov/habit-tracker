# Прогон 04 — проверка (validation)

**Статус: FAILED** — e2e: 3 из 117 тестов упали (exit 1). Unit и сборка успешны.

- Время проверки: 2026-10-14 12:43–12:45 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker` (ветка `feature/design`)
- base_ref: `43edc58775f9d76faa77f9ef889d0e411f20ddef`
- HEAD: `43edc58775f9d76faa77f9ef889d0e411f20ddef` (изменения не закоммичены)
- План: `plans/005-design.md`, раздел «Изменение AC-38 (прогон 04, решение пользователя 14.10.2026)»
- Окружение: `export PATH="/c/Program Files/nodejs:$PATH"`; команды взяты из README.md и совпадают со scripts в package.json.

## Изменённые и новые файлы (`git status --porcelain -uall`, staged нет)

Изменены (unstaged): `GOAL.md`, `README.md`, `plans/005-design.md`, `src/main.js`, `src/style.css`,
`tests/e2e/design.spec.js`, `tests/e2e/edit-best-streak.spec.js`, `tests/e2e/habits.spec.js`.
Новые (untracked): `reports/005-design/04/e2e.log`, `implementation.md`, `tests.md`
(+ созданные этой проверкой `unit.log`, `build.log`, `validation.md`).

## Результаты

| # | Команда | Кто запускал | Exit | Итог | Лог |
|---|---|---|---|---|---|
| 1 | `npm run test:unit` | test-runner | 0 | Test Files 9 passed (9); Tests 435 passed, 0 failed, 0 skipped | `reports/005-design/04/unit.log` |
| 2 | `npm run test:e2e` | координатор, вне песочницы (с разрешения пользователя), старт 12:42:11 | 1 | Running 117 tests: 114 passed, 3 failed, 0 skipped/flaky | `reports/005-design/04/e2e.log` |
| 3 | `npm run build` | test-runner | 0 | ✓ 15 modules transformed; dist/index.html 5.59 kB, CSS 17.59 kB, JS 30.48 kB; built in 171ms | `reports/005-design/04/build.log` |

### Актуальность e2e-прогона

E2E в песочнице проверяющего запустить невозможно, поэтому использован прогон координатора.
Проверено по времени изменения: в `src/`, `tests/`, `public/`, `index.html`, `playwright.config.js`,
`package.json` нет файлов новее начала e2e.log (12:42:11). Последние изменения: `tests/e2e/habits.spec.js`
и `edit-best-streak.spec.js` — 12:41:23, `tests/e2e/design.spec.js` — 12:41:00, `src/style.css` — 12:36:42,
`src/main.js` — 12:36:26. E2E-результат относится к текущей версии файлов.

### Упавшие e2e-тесты (полный контекст — `test-results/<папка>/error-context.md`)

1. `tests/e2e/design.spec.js:358` — AC-33, «…строка статистики — в цвете привычки (light)» (вариант dark прошёл).
   ```
   Error: expect(received).toContain(expected)
   Expected value: "rgb(185, 166, 242)"
   Received array: []
   > 427 |       expect(rowB).toContain(opaque(bButton));
   ```
   Для строки статистики привычки `b` `usedColors` вернул пустой массив. В прогоне 03 тест проходил.
   Контекст: `test-results/design-где-виден-цвет-прив-35533-и-—-в-цвете-привычки-light--chromium/`.

2. `tests/e2e/design.spec.js:940` — AC-37, «эмодзи вне набора в данных не ломает страницу: показывается картинка ⭐».
   ```
   Error: ⭐ (статичная)
   Expected: "emoji/2b50.svg"
   Received: "emoji/2b50.webp"
     at expectNotoImage (design.spec.js:787:27) / design.spec.js:946:5
   ```
   На карточке ожидался статичный SVG, получен WebP. Тест AC-37 по tests.md не менялся (считалось, что он
   выполняется при `reducedMotion: 'reduce'`). Фактически на карточке оказался WebP: либо этот тест не работает
   в режиме reduced motion, либо приложение его не учитывает. По логу причину определить нельзя.
   Контекст: `test-results/design-эмодзи-Noto-картинк-ec188-ицу-показывается-картинка-⭐-chromium/`.

3. `tests/e2e/design.spec.js:960` — AC-38, «сразу после загрузки на карточках 9 эмодзи — анимированные WebP…».
   ```
   Test timeout of 30000ms exceeded.
   Error: locator.evaluate: Test timeout of 30000ms exceeded.
     - waiting for locator('[data-testid="habit-card"][data-habit-id="h1"]').getByTestId('habit-emoji')
     at emojiImage (design.spec.js:725:11) / expectNotoImage (784:22) / design.spec.js:994:11
   ```
   Карточка `h1` с `habit-emoji` не найдена за 30 с.
   Контекст: `test-results/design-эмодзи-на-карточках-d179e-SVG-без-отметки-эффекта-нет-chromium/`.

Причины падений проверяющий не анализировал и не исправлял: что дефектно, приложение или тесты, должны
определить реализатор, автор тестов или аудитор.

## Что не запускалось и почему

- `npm run test:e2e` проверяющий сам не запускал: в его песочнице это невозможно. Использован лог
  координатора (см. выше).
- Внешний вид в браузере не просматривался. Ручная приёмка не проводилась.

## Вывод

FAILED. Unit-тесты (435/435) и сборка прошли успешно. Обязательная браузерная проверка упала:
3 из 117 тестов, в том числе два, которые по tests.md не менялись (AC-33 light, AC-37).
Этот результат подтверждает только перечисленные проверки.
