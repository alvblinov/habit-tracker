# Итерация 007, прогон 02: проверка (demo-test-runner)

Статус: **PASSED**

- Время: 2026-10-23, 14:34:37–14:36:30 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`, ветка `feature/tour-demo-card`
- base_ref: `2e4b772`
- HEAD: `2e4b772a69c69eed692a958d7762a11c03decbc3`. HEAD совпадает с base_ref, все изменения не закоммичены.
- План: `plans/007-tour-demo-card.md`, раздел «Проверка»: `npm run test:unit`, `npm run test:e2e`, `npm run build`.
  Других обязательных автоматических проверок в плане нет. Ручная проверка из плана не выполнялась, это
  делает пользователь.
- Команды взяты из README.md и сверены с `package.json`: `test:unit` = `vitest run`,
  `test:e2e` = `playwright test`, `build` = `vite build`.

## Изменённые и новые файлы (git status, включая untracked)

Staged-изменений нет (`git diff --cached` пуст).

Изменены (unstaged): `GOAL.md`, `README.md`, `STATUS.md`, `src/companion-tour.js`, `src/main.js`,
`src/style.css`, `tests/e2e/companion.spec.js`, `tests/unit/companion-tour.test.js`
(8 файлов, +683/−15).

Новые (untracked):
- `plans/007-tour-demo-card.md`
- `reports/007-tour-demo-card/01/`: `audit.md`, `build.log`, `e2e-validator.log`, `e2e.log`,
  `implementation.md`, `tests.md`, `unit.log`, `validation.md`
- `reports/007-tour-demo-card/02/`: `implementation.md`, `tests.md`, `e2e.log` (лог координатора);
  в этом прогоне я создал `unit.log`, `e2e-runner.log`, `build.log` и `validation.md`

## Результаты

| # | Команда | Exit code | Итог | Лог |
|---|---|---|---|---|
| 1 | `npm run test:unit` | 0 | 13 файлов, 669 passed, 0 failed, 0 skipped | `reports/007-tour-demo-card/02/unit.log` |
| 2 | `npm run test:e2e -- --reporter=line` | 0 | 184 passed (1.5m), 0 failed; skipped и flaky нет | `reports/007-tour-demo-card/02/e2e-runner.log` |
| 3 | `npm run build` | 0 | `✓ built in 258ms`, 19 модулей; `dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js` | `reports/007-tour-demo-card/02/build.log` |

Ошибок нет, фрагментов ошибок приводить не нужно.

### Примечания

- E2E запускал demo-test-runner (я) в своём окружении. Песочница пустила на localhost, браузер Chromium был
  доступен. Флаг `--reporter=line` передан так же, как у координатора; он меняет только формат вывода.
  Набор тестов и настройки не менялись. Результат совпадает с независимым запуском координатора вне песочницы
  (`reports/007-tour-demo-card/02/e2e.log`, `npx playwright test --reporter=line`: 184 passed, exit 0).
- Число e2e-тестов: 184 (в прогоне 01 было 181, плюс 3 новых). Это совпадает с ожиданием в tests.md.
- Unit: 669, как в прогоне 01 (`reports/007-tour-demo-card/01/unit.log`). В этом прогоне unit-тесты
  не менялись, это совпадает с tests.md.
- Поиск по `skipped|flaky|failed|retry|✘` в `e2e-runner.log` ничего не нашёл.

## Три новых теста из tests.md

Все три есть в обоих логах (`e2e-runner.log` и `e2e.log` координатора) и входят в итог «184 passed»
без упавших тестов:

- `[162/184] companion.spec.js:1497` «без привычек: помощника выключили в другой вкладке во время экскурсии —
  экскурсия закрыта, примера нет, видна подсказка пустого списка; habit-tracker:v1 прежний»
- `[164/184] companion.spec.js:1537` «без привычек: в другой вкладке появилась привычка во время экскурсии —
  пример исчезает, настоящая карточка появляется, подсветка шага переходит на её элемент»
- `[165/184] companion.spec.js:1596` «плавная прокрутка (без reduced motion): список перерисован и прокрутка
  прервана во время прокрутки к шагу 2 — цель всё равно в окне и совпадает с подсветкой (AC-57)»

## Что не выполнялось

- Необязательная проверка из tests.md: ловит ли тест 3 регрессию NOTE 2 (прогон на версии `check()` до
  прогона 02). Для неё нужно менять `src/main.js`, а исходники мне менять запрещено. Поэтому не проверено,
  отличает ли тест 3 старый код от нового.
- Ручная приёмка из плана не выполнялась. Внешний вид в браузере я не смотрел.

Этот отчёт подтверждает только перечисленные запуски команд и их результаты.
