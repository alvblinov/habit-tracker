# Проверка — итерация 005, дополнение (прогон 02)

**Статус: FAILED**

Подтверждено только то, что перечислено ниже. Внешний вид в браузере не смотрел.

## Контекст

- Время проверки: 2026-10-14, 10:25:07–10:25:11 (+03:00) — unit и сборка; e2e — запуск координатора, 10:23:24 (+03:00).
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`, ветка `feature/design`.
- base_ref: `ac8c75e0289328fc36aa3c355526ab1fae42016f`.
- HEAD: `ac8c75e0289328fc36aa3c355526ab1fae42016f` (совпадает с base_ref; все изменения не закоммичены).
- Node: v24.20.0 (`export PATH="/c/Program Files/nodejs:$PATH"`).
- План: `plans/005-design.md`, раздел «Дополнение (прогон 02)». Команды взяты из README.md и сверены с `package.json` (`test:unit` = `vitest run`, `test:e2e` = `playwright test`, `build` = `vite build`).

## Изменённые и новые файлы (относительно HEAD)

Staged: нет.

Изменены (unstaged): `AGENTS.md`, `GOAL.md`, `README.md`, `STATUS.md`, `index.html`, `src/habits.js`, `src/main.js`, `src/storage.js`, `src/style.css`, `tests/unit/habits.test.js`, `tests/unit/storage.test.js`.

Новые (untracked): `plans/005-design.md`, `src/colors.js`, `src/emoji-assets.js`, `src/theme.js`, `tests/e2e/design.spec.js`, `tests/unit/colors.test.js`, `tests/unit/emoji-assets.test.js`, `tests/unit/theme.test.js`, `public/emoji/` (12 `.svg`, 9 `.webp`, `ATTRIBUTION.md`), `reports/005-design/` (отчёты прогонов 01 и 02).

## Результаты

| # | Проверка | Команда | Кто запускал | Exit | Итог |
|---|---|---|---|---|---|
| 1 | Тесты логики | `npm run test:unit` | я | 0 | 9 файлов, 435 passed, 0 failed, 0 skipped |
| 2 | Браузерные тесты | `npm run test:e2e` | координатор, вне песочницы | 1 | 115 тестов: 103 passed, 12 failed, 0 skipped |
| 3 | Сборка | `npm run build` | я | 0 | `✓ built in 218ms`, 15 модулей; в `dist/emoji/` 22 файла (12 svg, 9 webp, ATTRIBUTION.md), как требует план |

Логи: `reports/005-design/02/unit.log`, `reports/005-design/02/e2e.log`, `reports/005-design/02/build.log`.

### 1. Unit

435 = 363 прежних + 72 новых (`tests/unit/emoji-assets.test.js`), что совпадает с числом из `tests.md`.

### 2. E2E (запуск координатора)

В моей песочнице e2e запустить нельзя. Его запустил координатор вне песочницы с разрешения пользователя. Здесь использован его лог `e2e.log` (время записи 10:23:24, изменён в 10:24:22). Шапка лога: `command: npm run test:e2e (run by coordinator outside sandbox)`, `Running 115 tests using 4 workers`, в конце `12 failed`, `103 passed (56.4s)`, `exit code: 1`.

Проверил время изменения файлов. Новее `e2e.log` нет ни одного файла в `src/`, `tests/`, `public/`, а также `index.html`, `playwright.config.js`, `vite.config.js`, `package.json`. Последние правки: `tests/e2e/design.spec.js` в 10:22:14, `tests/unit/emoji-assets.test.js` в 10:18:45, `index.html`/`src/style.css` в 10:12:38, `src/main.js` в 10:12:19. Все они раньше начала e2e (10:23:24), то есть лог относится к текущему коду.

Упавшие тесты:

**A. Новые тесты в `tests/e2e/design.spec.js` (9 шт.)**: 807, 856, 895 (AC-37); 913, 952, 969, 995, 1026, 1046 (AC-38). Во всех одна ошибка — в хелпере `expectNotoImage`:

```
Error: 💧 (статичная): символ не рисуется системным шрифтом
Expected: false
Received: true
> 788 |   expect(info.visibleText, `${where}: символ не рисуется системным шрифтом`).toBe(false);
    at expectNotoImage (tests/e2e/design.spec.js:788:78)
```

(в других тестах то же самое с ⭐, 📚, 🌱 (анимация), 🏃). Тесты падают на первом вызове хелпера, поэтому проверки после него (анимация WebP, `data-animating`, reduced-motion, внешние запросы) в этом прогоне **не выполнены**. Их результат неизвестен.

**B. Прежние тесты (3 шт., регрессия к прежним ожиданиям)** — «название с HTML выводится как текст»:

- `tests/e2e/habits.spec.js:131` — `getByTestId('habit-card').first().locator('img')`: Expected 0, Received 1.
- `tests/e2e/edit-best-streak.spec.js:382` (строка 392) — `habit-card[data-habit-id="h1"]` → `locator('b, img')`: Expected 0, Received 1.
- `tests/e2e/schedule-stats.spec.js:484` — `stats-row[data-habit-id="high"]` → `locator('b, img')`: Expected 0, Received 1.

Найденный в карточке и строке статистики `<img>` выглядит как картинка эмодзи из `renderEmoji`, а не как разметка из названия. Но это я не проверял. Что править, тест или реализацию, здесь не решается: исходники и тесты не менялись и не диагностировались правкой. План требовал «Прежние … 98 e2e — без изменения ожиданий», а эти 3 прежних теста не прошли.

Полные трассы — в `e2e.log` (строки 128–397) и в `test-results/*/error-context.md`.

AC-39 (подвал) и AC-40 (пятна, контраст) в списке упавших нет. Отдельной разбивки по прошедшим тестам в логе нет, поэтому только по номерам строк их прохождение не утверждаю.

### 3. Сборка

`vite build` выполнен без ошибок и предупреждений. Собраны `dist/index.html` (5.59 kB), `dist/assets/index-*.css` (17.59 kB), `dist/assets/index-*.js` (30.28 kB). Содержимое `public/emoji/` скопировано в `dist/emoji/` полностью.

## Что не выполнено

- `npm run test:e2e` в моей песочнице: браузер и сервер Playwright здесь недоступны. Использован лог запуска координатора, см. выше.
- Аудит, скриншоты и ручная приёмка пользователем — по плану это не моя задача.

## Вывод

FAILED: `npm run test:e2e` завершился с exit 1, 12 тестов упали. Из них 9 новых тестов AC-37/AC-38 (проверка «символ не рисуется системным шрифтом») и 3 прежних теста, у которых изменилось поведение («нет `<img>` в карточке/строке при названии с HTML»). Unit (435/435) и сборка прошли.
