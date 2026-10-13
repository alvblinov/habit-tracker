# Проверка — план 002 «Напоминания», прогон 01

**Статус: FAILED** — e2e: 1 из 45 тестов упал (запуск координатора). Unit и сборка прошли.

- Время проверки: 2026-10-13 14:00–14:01 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`, ветка `feature/reminders`
- base_ref: `8ba7c2b641ff8ce43cd203062d302faeb8c39580`
- HEAD: `8ba7c2b641ff8ce43cd203062d302faeb8c39580` (изменения итерации 002 не закоммичены)
- Node: `/c/Program Files/nodejs` (через `export PATH="/c/Program Files/nodejs:$PATH"`)
- Команды взяты из README.md и сверены со `scripts` в package.json (`test:unit` = `vitest run`, `test:e2e` = `playwright test`, `build` = `vite build`). Обязательные проверки плана (раздел «Проверка», п. 1): те же три команды.

## Изменённые и новые файлы (git status до записи этого отчёта)

Staged: нет.

Изменённые (unstaged): `GOAL.md`, `README.md`, `STATUS.md`, `index.html`, `src/habits.js`, `src/main.js`, `src/storage.js`, `src/style.css`, `tests/unit/storage.test.js`.

Новые (untracked): `plans/002-reminders.md`, `src/notify.js`, `src/reminders.js`, `tests/e2e/reminders.spec.js`, `tests/unit/reminders.test.js`, `reports/002-reminders/01/` (`implementation.md`, `tests.md`, `e2e.log`; затем добавлены `unit.log`, `build.log`, `validation.md`).

## Результаты

| # | Команда | Кто запускал | Exit code | Итог | Лог |
|---|---|---|---|---|---|
| 1 | `npm run test:unit` | test-runner | 0 | 4 файла, 143 passed, 0 failed, 0 skipped | `reports/002-reminders/01/unit.log` |
| 2 | `npm run test:e2e` | координатор, вне песочницы (с разрешения пользователя) | 1 | 45 тестов: 44 passed, 1 failed, skipped не сообщается (0) | `reports/002-reminders/01/e2e.log` |
| 3 | `npm run build` | test-runner | 0 | `vite build` успешно: `dist/index.html` 1.68 kB, `dist/assets/index-*.css` 5.05 kB, `dist/assets/index-*.js` 16.62 kB, 10 модулей | `reports/002-reminders/01/build.log` |

### Упавший e2e-тест

`tests/e2e/reminders.spec.js:208` — «Каждые N» (AC-11) › вне активных часов напоминаний нет

```
Error: expect(received).toEqual(expected) // deep equality
- Expected  - 1
+ Received  + 0
  Array [
    "💧 Пора: Контроль",
    "💧 Пора: Контроль",
-   "💧 Пора: Контроль",
  ]
  216 |     await page.clock.runFor('03:00:00'); // 11:15, 12:15, 13:15
> 218 |     expect(await notificationTitles(page)).toEqual(['💧 Пора: Контроль', '💧 Пора: Контроль', '💧 Пора: Контроль']);
    at tests/e2e/reminders.spec.js:218:44
```

Ожидалось 3 уведомления контрольной привычки за 3 часа, получено 2. Лишних уведомлений привычки «Вне часов» в выводе нет. Причина не диагностировалась (дефект приложения или неточность теста — не установлено); Playwright error context: `test-results/reminders-«Каждые-N»-AC-11-43785-ивных-часов-напоминаний-нет-chromium/error-context.md`.

### Актуальность e2e-лога

Лог `e2e.log` начат 2026-10-13T13:59:24+03:00, файл записан в 14:00:11. Последние изменения проверяемых файлов раньше начала прогона: `tests/e2e/reminders.spec.js` 13:58:30, `tests/unit/storage.test.js` 13:56:47, `src/style.css` 13:51:27, `src/main.js` 13:51:26, `index.html` 13:49:32, `playwright.config.js` 11:43:29 (также `vite.config.js`, `package.json`, `package-lock.json` — 10:01–10:03). `find src tests -newer e2e.log` — пусто. Значит, e2e-результат относится к текущим файлам.

## Что не запускалось

- `npm run test:e2e` в песочнице test-runner не запускался: подключения к localhost/127.0.0.1 запрещены. Использован результат координатора (выше).
- Аудит (п. 2 плана) и ручная приёмка (п. 3) — вне задачи этой роли.
- Внешний вид в браузере не проверялся.

Этот отчёт подтверждает только результаты перечисленных команд.
