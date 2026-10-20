# Проверка — итерация 006 «Помощник с выбором персонажа» (прогон 01)

Статус: **FAILED** — `npm run test:e2e` завершился с exit 1 (1 упавший тест из 145).

- Время проверки: 2026-10-15 09:34–09:36 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`, ветка `feature/companion`
- base_ref: `aeda80e8346df06357f02fec833c7ab6d5f97f56`
- HEAD: `aeda80e8346df06357f02fec833c7ab6d5f97f56` (изменения итерации не закоммичены)
- План: `plans/006-companion.md` (раздел «Порядок»: `test:unit`, `test:e2e` координатором вне песочницы, `build` с 14 картинками в `dist/companions/`)
- Node: `/c/Program Files/nodejs` (добавлен в PATH)

## Изменённые и новые файлы (git status, staged нет)

Изменённые (unstaged): `GOAL.md`, `README.md`, `STATUS.md`, `index.html`, `src/main.js`, `src/style.css`
(diff --stat: 6 файлов, +739 / −3).

Новые (untracked):
- `plans/006-companion.md`
- `public/companions/` — `1f427`, `1f431`, `1f438`, `1f43c`, `1f989`, `1f98a`, `1f994` (`.svg` и `.webp`), `ATTRIBUTION.md`
- `src/companion.js`
- `tests/unit/companion.test.js`
- `tests/e2e/companion.spec.js`
- `reports/006-companion/01/` — `implementation.md`, `tests.md`, `e2e.log`, а также `unit.log`, `build.log`, `validation.md` этого прогона

Staged: нет.

## Результаты

| # | Команда | Кто запускал | Exit | Итог | Лог |
|---|---|---|---|---|---|
| 1 | `npm run test:unit` (`vitest run`) | test-runner | 0 | 10 файлов, 527 тестов: 527 passed, 0 failed, 0 skipped | `reports/006-companion/01/unit.log` |
| 2 | `npm run test:e2e` (`playwright test`, Chromium) | координатор вне песочницы (с разрешения пользователя), начало 09:33:13 | 1 | 145 тестов: 144 passed, 1 failed, пропущенных не сообщено | `reports/006-companion/01/e2e.log` |
| 3 | `npm run build` (`vite build`) | test-runner | 0 | собрано (16 модулей): `dist/index.html`, `assets/index-*.css`, `assets/index-*.js`; в `dist/companions/` 14 картинок (7 SVG + 7 WebP) + `ATTRIBUTION.md`, все побайтно совпадают с `public/companions/` (`cmp`) | `reports/006-companion/01/build.log` |

### Упавший тест (e2e)

`tests/e2e/companion.spec.js:478` › реплики на поводы (AC-43, AC-44) › HTML и «{name}» в названии выводятся как текст

```
Error: expect(received).not.toMatch(expected)
Expected pattern: not /[{}]/
Received string:      "«<b>Жирный</b> {name}» отмечено. Мурлычу от гордости за тебя."
  > 127 |   expect(text).not.toMatch(/[{}]/);
    at expectBubble (tests/e2e/companion.spec.js:127:20)
    at tests/e2e/companion.spec.js:486:18
```

Наблюдение (не исправлялось): общий хелпер `expectBubble` (строки 120–129) запрещает `{`/`}` в тексте облачка,
а этот тест намеренно задаёт название привычки `<b>Жирный</b> {name}`, которое должно попасть в реплику дословно.
Фактический текст содержит название целиком как текст; до проверок `toContain(name)` и «нет дочерних элементов»
выполнение не дошло, поэтому они в этом прогоне **не проверены**. Похоже на противоречие внутри теста, а не на
дефект приложения, но это решает автор тестов; повторный запуск e2e обязателен после исправления.

### Актуальность e2e-прогона

`find src tests public index.html playwright.config.js vite.config.js package.json -newermt "2026-10-15 09:33:13"` —
пусто: после начала e2e.log эти файлы не менялись. Последние изменения: `tests/e2e/companion.spec.js` 09:31:53,
`tests/unit/companion.test.js` 09:30:29, `src/main.js` 09:25:05. Значит, e2e.log относится к текущему состоянию файлов.

## Что не запускалось и почему

- `npm run test:e2e` в песочнице test-runner не запускался (браузер/порт недоступны в песочнице); использован
  прогон координатора, результат взят из `e2e.log`.
- Просмотр в браузере, аудит и ручная приёмка (пункты 2–4 плана) — вне задачи этой проверки; внешний вид не проверялся.

## Вывод

Unit-тесты и сборка прошли; браузерные тесты — 1 падение. Итог: **FAILED**.
Результат подтверждает только перечисленные выполненные команды.
