# Проверка — итерация 006, прогон 03 (расширение)

**Статус: FAILED**

- Время проверки: 2026-10-15, ~13:17–13:18 (+03:00)
- Рабочая папка: C:\Users\1\Documents\habit-tracker (ветка feature/companion)
- base_ref: aeda80e8346df06357f02fec833c7ab6d5f97f56
- HEAD: aeda80e8346df06357f02fec833c7ab6d5f97f56 (изменения не закоммичены)
- План: plans/006-companion.md, раздел «Расширение (прогон 03)»
- Команды взяты из README.md и сверены с package.json (`test:unit` = `vitest run`,
  `test:e2e` = `playwright test`, `build` = `vite build`).

## Изменённые и новые файлы (git status, staged нет)

Изменены (unstaged): GOAL.md, README.md, STATUS.md, index.html, src/main.js, src/style.css.

Новые (untracked):
- plans/006-companion.md
- public/companions/: 1f427, 1f431, 1f438, 1f43c, 1f989, 1f98a, 1f994 (.svg и .webp), ATTRIBUTION.md
- src/companion.js, src/companion-qa.js, src/companion-tips.js, src/companion-tour.js
- tests/e2e/companion.spec.js
- tests/unit/companion.test.js, companion-qa.test.js, companion-tips.test.js, companion-tour.test.js
- reports/006-companion/01/*, 02/*, 03/* (отчёты и логи)

## Результаты

| # | Проверка | Команда | Кто запускал | Exit | Итог |
|---|----------|---------|--------------|------|------|
| 1 | Тесты логики | `npm run test:unit` | test-runner | 1 | FAILED: файлов 12 прошло, 1 упал (13); тестов 660 прошло, 1 упал (661), пропущенных нет |
| 2 | Браузерные тесты | `npm run test:e2e` | координатор, вне песочницы | 1 | FAILED: 169 passed, 1 failed (170), пропущенных не указано |
| 3 | Сборка | `npm run build` | test-runner | 0 | PASSED: 19 модулей, dist/index.html 12.92 kB, CSS 28.29 kB, JS 108.09 kB |

### 1. Тесты логики — FAILED
Полный лог: reports/006-companion/03/unit.log

```
FAIL  tests/unit/companion-tips.test.js > TIPS > не меньше 30 советов: непустые, разные, без «{…}» и упрёков
AssertionError: Подумай, зачем тебе привычка. Ясная причина помогает в ленивые дни.:
expected '...' not to match /пропуст|лентя|ленив|стыдн|позор|провал/i
 ❯ tests/unit/companion-tips.test.js:19:28
```
Совет из src/companion-tips.js:23 содержит «ленивые», а тест запрещает корень «ленив».

### 2. Браузерные тесты — FAILED (запуск координатора)
E2E в песочнице test-runner недоступен. Координатор запустил `npm run test:e2e` вне песочницы
с разрешения пользователя. Начало лога 2026-10-15T13:15:40+03:00, файл изменён в 13:17:08.
Полный лог: reports/006-companion/03/e2e.log

Проверка неизменности: среди src/, tests/, public/, index.html и playwright.config.js нет
файлов новее e2e.log (`find ... -newer e2e.log` ничего не нашёл). Последнее изменение —
tests/e2e/companion.spec.js в 13:13:46, до начала e2e (13:15:40). Значит, e2e проверял
текущее состояние этих файлов.

```
1) tests\e2e\companion.spec.js:769:3 › место помощника: правый нижний угол (AC-47) ›
   в самом низу страницы помощник не закрывает элементы последней карточки; клики по клеткам
   и «Удалить» проходят даже под облачком
   Error: expect(locator).toHaveAttribute(expected) failed
   Locator:  getByTestId('companion-bubble')
   Expected: "markPast"
   Received: "newRecord"
   at expectBubble (tests\e2e\companion.spec.js:217:30)
   at tests\e2e\companion.spec.js:809:5
```
После клика по клетке вчерашнего дня у последней карточки (h7) показана реплика `newRecord`,
а тест ожидал `markPast`. Я не выяснял, ошибка в приложении (приоритет событий) или в
ожидании теста. Это нужно решить по GOAL/плану.
Контекст ошибки от Playwright: test-results\companion-место-помощника--ca16e--проходят-даже-под-облачком-chromium\error-context.md

### 3. Сборка — PASSED
Полный лог: reports/006-companion/03/build.log. `vite build` завершился без ошибок, exit 0.

## Что не запускалось и почему
- `npm run test:e2e` test-runner не запускал: в его песочнице нельзя поднять браузер и
  сервер. Результат выше взят из лога запуска координатора.
- Дополнительных обязательных команд для прогона 03 в плане нет. Отдельные команды
  `npx vitest ...` и `npx playwright ...` из tests.md нужны только для разбора и уже
  входят в полные прогоны.
- Внешний вид не проверялся: эти команды его не проверяют.

## Вывод
FAILED: упал 1 unit-тест (совет со словом «ленивые» против запрета упрёков) и 1 e2e-тест
(AC-47, `newRecord` вместо `markPast`). Сборка прошла. Результат подтверждает только
перечисленные запуски.
