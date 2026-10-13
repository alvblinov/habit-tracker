# Реализация — цикл 02 (исправления по аудиту 01)

- План: `plans/002-reminders.md`
- Аудит: `reports/002-reminders/01/audit.md` (вердикт FIX)
- base_ref: `8ba7c2b641ff8ce43cd203062d302faeb8c39580`, ветка `feature/reminders`

## Итог

Код приложения в этом цикле **не менялся**. Изменённых файлов `src/`, `index.html`,
настроек и документации нет. Создан только этот отчёт.

## Что проверено по коду

### Замечание 1 (BLOCKER, `tests/e2e/reminders.spec.js:216`): дефект теста, а не приложения

Вывод аудитора подтверждается.
- `src/main.js:52`: `CHECK_EVERY_MS = 15000`. Планировщик (`setInterval(checkReminders, CHECK_EVERY_MS)`)
  и `lastCheck = Date.now()` запускаются при загрузке модуля. Это соответствует плану: «`lastCheck = Date.now()` при загрузке;
  `setInterval(check, 15000)`». Значит, задержка срабатывания до 15 с допустима по плану.
- `src/main.js` `saveDraft` → `setReminder(state, habitId, input, Date.now())`, а `src/reminders.js` `setReminder`
  ставит `anchor = nowMs` для режима interval. План, строка 25: «`anchor` — момент включения/сохранения».
  Поэтому `anchor` позже загрузки на время заполнения формы, и момент `anchor + 3 ч` попадает
  в тик, который наступает после конца `runFor('03:00:00')`.
- `findDueReminders` (`src/reminders.js`): окно `(lower, upper]`, где `lower = max(from, to − grace − 1)`,
  `DEFAULT_GRACE_MS = 5 мин`. В `checkReminders` окна идут подряд (`lastCheck = now` после каждого тика),
  поэтому момент не теряется и не дублируется. Опоздание тика до 15 с меньше grace, и следующий тик
  нашёл бы третий момент. Ошибки в логике нет.
- Исправление нужно в тесте: добавить запас в `runFor`. Тесты я не менял, это задача demo-test-writer.

### Замечание 2 (NOTE): повторное сохранение переставляет `anchor`

Так задано планом («момент включения/сохранения»). Это зафиксировано unit-тестом и README.
Изменения не нужны, поведение стоит показать на ручной приёмке.

### Замечание 3 (NOTE): тик, опоздавший больше чем на 5 мин, не досылает напоминание

Так задано AC-14 и планом («пропущенные не досылаются», grace 5 мин). Кроме того, при `focus` и `visibilitychange`
вызывается `refresh()` → `checkReminders()` (`src/main.js:567-575`), как требует план.
Изменения не нужны, ограничение стоит упомянуть в сценарии ручной приёмки.

## Отклонения от плана

Нет.

## Выполненные команды

```
export PATH="/c/Program Files/nodejs:$PATH"; npm run build
```
Результат: exit 0, `vite v8.3.4`, 10 modules transformed, `dist/index.html` 1.68 kB,
`dist/assets/index-CJXtgGf5.css` 5.05 kB, `dist/assets/index-9hMSmgrs.js` 16.62 kB, built in 115ms.

`git status --short` до и после совпадает: изменений в отслеживаемых файлах нет,
добавлен только `reports/002-reminders/02/implementation.md`.

Unit- и e2e-тесты я не запускал. Полный прогон после исправления теста выполнит demo-test-runner.
Сборка проходит, но это не значит, что поведение проверено.
