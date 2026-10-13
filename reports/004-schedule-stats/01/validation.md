# Валидация — итерация 004 (schedule-stats), прогон 01

**Итог: FAILED**

- Время: 2026-10-13, ~17:40 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`, ветка `feature/schedule-stats`
- base_ref: `35879173d3da8a188c81ca555bdb312f55499da4`
- HEAD: `35879173d3da8a188c81ca555bdb312f55499da4` (изменения итерации 004 не закоммичены)
- План: `plans/004-schedule-stats.md`. Обязательные проверки (раздел «Проверки», п. 1): `npm run test:unit`, `npm run test:e2e`, `npm run build`. Команды сверены с README.md и `package.json` (`vitest run`, `playwright test`, `vite build`).

## Изменённые и новые файлы (git status, staged не обнаружено)

Изменённые (unstaged): `GOAL.md`, `README.md`, `STATUS.md`, `index.html`, `src/habits.js`, `src/main.js`,
`src/reminders.js`, `src/storage.js`, `src/style.css`, `tests/unit/habits.test.js`,
`tests/unit/reminders.test.js`, `tests/unit/storage.test.js`.

Новые (untracked): `plans/004-schedule-stats.md`, `src/schedule.js`, `src/stats.js`,
`tests/e2e/schedule-stats.spec.js`, `tests/unit/schedule.test.js`, `tests/unit/stats.test.js`,
`reports/004-schedule-stats/01/` (implementation.md, tests.md, e2e.log, а также unit.log, build.log, validation.md этого прогона).

## 1. Тесты логики

- Команда: `npm run test:unit` (`vitest run`), запущена мной
- Exit code: **1**
- Итог: Test Files 1 failed | 5 passed (6); Tests **276 passed, 1 failed, 0 skipped** (277)
- Лог: `reports/004-schedule-stats/01/unit.log`
- Ошибка:

```
FAIL tests/unit/stats.test.js > лучший день недели (AC-30) > дни по расписанию есть, но ни одной отметки за период → нет лучшего дня
AssertionError: expected 1 to be null
 ❯ tests/unit/stats.test.js:252:27
    252|     expect(s.bestWeekday).toBeNull();
```

## 2. Браузерные тесты

- Команда: `npm run test:e2e` (`playwright test`) — **запускал координатор вне песочницы** с разрешения пользователя (в песочнице этого агента e2e невозможен); мной не перезапускалась.
- Начало прогона по логу: 2026-10-13T17:39:22+03:00
- Exit code: **1**
- Итог: **78 passed, 1 failed**, пропущенных не сообщено (45.7s)
- Лог: `reports/004-schedule-stats/01/e2e.log`
- Ошибка:

```
[chromium] › tests\e2e\schedule-stats.spec.js:476:3 › лучший день недели, сортировка, пустое состояние (AC-30)
  › дни по расписанию есть, но ни одной отметки за период → «Лучший день: —»
Locator:  getByTestId('stats-best-weekday')
Expected: "Лучший день: —"
Received: "Лучший день: понедельник"
  > 481 | await expect(page.getByTestId('stats-best-weekday')).toHaveText('Лучший день: —');
```

- Актуальность лога: проверено по времени изменения — файлы в `src/`, `tests/`, `index.html`, `playwright.config.js`, `package.json` не изменялись после 17:39:22 (самый поздний — `tests/e2e/schedule-stats.spec.js`, 17:37:58). Результат e2e относится к текущему состоянию файлов.

## 3. Сборка

- Команда: `npm run build` (`vite build`), запущена мной
- Exit code: **0**
- Итог: 12 модулей, `dist/index.html` 3.47 kB, `dist/assets/index-*.css` 7.54 kB, `dist/assets/index-*.js` 25.70 kB
- Лог: `reports/004-schedule-stats/01/build.log`

## Что не запускалось

- E2E не запускался в песочнице этого агента (невозможно в окружении); использован результат прогона координатора (см. выше).
- Ручная приёмка (план, п. 3) — не выполнялась, это проверка пользователя.

## Вывод

Оба падения (1 unit, 1 e2e) — один и тот же случай AC-30: при наличии дней по расписанию и нуле отметок
за период реализация возвращает лучший день «понедельник» (`bestWeekday = 1`), тесты ожидают «—» / `null`.
tests.md заранее отмечает это как спорное расхождение прочтения требований между implementer и test-writer;
решение — за аудитором/пользователем. Остальные проверки прошли. Результат подтверждает только перечисленные
выполненные команды.
