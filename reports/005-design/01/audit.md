# Проверка изменения

- План: `plans/005-design.md`; цель: `GOAL.md` → «Итерация 005», AC-32…AC-36.
- base_ref: `ac8c75e0289328fc36aa3c355526ab1fae42016f` = HEAD; коммитов после base_ref нет, staged нет.
  Всё изменение — unstaged + untracked (`git status --short`, `git diff ac8c75e`).
- Рассмотренные файлы: `index.html`, `src/colors.js` (новый), `src/theme.js` (новый), `src/habits.js`,
  `src/storage.js`, `src/main.js`, `src/style.css` (токены, data-color, кольцо, сетка, кнопки, статистика,
  reduced-motion), `tests/unit/habits.test.js` и `tests/unit/storage.test.js` (только добавления: 225+, 0−),
  `tests/unit/colors.test.js`, `tests/unit/theme.test.js`, `tests/e2e/design.spec.js` (структура, contrastOf,
  тема, старые данные), `README.md`, `STATUS.md`, `GOAL.md` (изменения координатора), `package.json`/
  `package-lock.json` (без изменений).
- Отчёт запуска: `reports/005-design/01/validation.md` — PASSED: unit 363/363 (`unit.log`, 09:36:58),
  e2e 98/98 (`e2e.log`, запуск координатора, 09:34:39), build (`build.log`, 09:37:06).
  Сверено: последние mtime кода и тестов — `tests/e2e/design.spec.js` 09:33:35, `src/style.css` 09:25:28,
  остальное раньше; после начала e2e ничего не менялось — результаты относятся к текущей версии.
- **Вердикт: PASS**

## Критерии приёмки

| Критерий | Доказательство | Статус |
|---|---|---|
| AC-32: новая привычка — свободный цвет палитры; выбор любого из 8 в ✏️, сохраняется после reload; старые данные — по порядку | `src/colors.js` `nextFreeColor`; `src/habits.js` `addHabit` → `color: nextFreeColor(state.habits)`, `updateHabit` с `normalizeColor`; `src/storage.js` `sanitizeHabit(raw, index)` → `normalizeColor(raw.color) ?? PALETTE[index % 8]`; `src/main.js` `renderEditForm` — 8 radio `edit-color-option`, `editDraft.color` уходит в `updateHabit`. Unit: storage (без цвета, >8, битые значения, в т.ч. попытка CSS-инъекции, save→load). E2E: `design.spec.js:211, 237, 250, 306, 323` — passed в `e2e.log` | выполнен |
| AC-33: цвет на плашке эмодзи, отмеченной кнопке «сегодня», выполненных клетках, строке статистики | `style.css` `[data-color=…]` → `--habit*`; `.toggle-today[aria-pressed='true']`, `.day-cell.is-done`, `.stats-habit` (полоска), `.stats-meter`; `data-color` на `habit-card` и `stats-row`. E2E `design.spec.js:358` (обе схемы), `:435` — сравнение computed-цветов | выполнен |
| AC-34: кольцо «X/Y», доля, «всё выполнено» при X=Y>0, «0/0» при Y=0; прежний текст сводки на месте | `index.html` `progress-ring` + `progress-ring-label`; `main.js` `renderRing` (`data-done/total/complete`, `stroke-dasharray`, label через `textContent`); `today-summary` с прежним текстом перенесён в шапку. E2E `:477, :517, :529` | выполнен |
| AC-35: тема по системе без выбора; кнопка переключает, выбор переживает reload, данные привычек не затронуты; контраст ≥ AA | inline-скрипт в `<head>` (try/catch, только `'light'`/`'dark'`); `main.js` `themeToggle` пишет только `habit-tracker:theme` в try/catch; CSS `:root[data-theme=dark]` и `@media (prefers-color-scheme: dark) :root:not([data-theme=light])`. E2E `:543, :564, :615, :624` (битое значение), `:643` (контраст ≥ 4.5 по computed style, обе темы, ручная и системная). Расчёт implementer (выборочно перепроверен, напр. `#1f1d1a` на `#afa9a0` ≈ 7.0) | выполнен |
| AC-36: прежнее поведение, тексты и data-testid сохранены; прежние тесты не ослаблены | `git diff ac8c75e -- tests/` — только добавления в двух unit-файлах, прежние e2e-файлы не менялись (mtime 13.10); `.skip/.only` нет (validation.md). Прежние 280 unit и 79 e2e в составе 363/98 passed. В `index.html` удалён только старый `<p id="today-summary">` и вставлен тот же элемент в шапку; `<h1>` сохранён | выполнен |
| Без новых зависимостей, без сети, textContent | `package.json`/lock не изменены; в `style.css` нет `url(`/`@import`/`http`; системный стек шрифтов; в `main.js` нет `innerHTML`/`insertAdjacentHTML`; `data-color` только из `PALETTE` (`colorOf` → `normalizeColor ?? PALETTE[...]`) | выполнен |
| Ручная приёмка (план, п. 4) | не выполнялась | не проверен (вне аудита) |

## Замечания

Блокеров нет. Замечания уровня NOTE:

1. NOTE — `tests/e2e/design.spec.js` (тема, `:543–:640`): нет сценария, где `localStorage.getItem`/`setItem`
   бросает исключение (например, запрет хранилища). Код устойчив (`index.html` inline-скрипт и
   `src/main.js` `readSavedTheme`/обработчик `themeToggle` в try/catch), но это подтверждено только чтением.
   Последствие: регрессия (снятие try/catch) не будет поймана. Исправление (по желанию): e2e с
   `addInitScript`, подменяющим `Storage.prototype.getItem`/`setItem` на `throw`, проверить, что страница
   отрисовалась и кнопка темы переключает тему до перезагрузки.
2. NOTE — `src/style.css:74–127` и `:130–185`: токены тёмной темы продублированы в двух селекторах
   (сейчас идентичны — проверено построчным diff). Последствие: при будущей правке одного блока системная
   и ручная тёмные темы разойдутся. Исправление (по желанию): комментарий «менять оба блока» уже есть
   по смыслу; можно добавить e2e/unit-сравнение computed `--bg`/`--text` в обоих режимах (частично это
   уже делает тест контраста).
3. NOTE — `src/storage.js:33`: цвет по позиции для старых записей без цвета не учитывает уже занятые
   сохранённые цвета, поэтому в смешанных данных возможны совпадения: `[{без цвета}, {color:'teal'}]` →
   `teal, teal`. Это соответствует плану («битый/нет → PALETTE[i % 8]»), и для реальных данных
   итерации 004 (цветов нет ни у кого) совпадений нет; изменять не требуется, пользователь может
   поменять цвет в ✏️.

## Ограничения проверки

- Тесты не перезапускались (по заданию); вывод опирается на `unit.log`, `e2e.log` (запуск координатора
  вне песочницы), `build.log` и сверку mtime файлов с временем начала e2e.
- Внешний вид в браузере аудитором не смотрелся; визуальные выводы — по CSS и e2e-проверкам computed-стилей,
  плюс сообщение координатора о просмотре (светлая, тёмная, 375px). Это не заменяет ручную приёмку.
- Контраст проверен по таблице implementer, выборочным пересчётом и e2e-тестом контраста; полный
  перерасчёт всех пар и нетекстовых элементов (кольцо, клетки) не выполнялся.
- `tests/e2e/design.spec.js` просмотрен выборочно (заголовки, контраст, тема), не построчно.
- Изменения `GOAL.md`, `STATUS.md`, `plans/005-design.md` — координатора; проверено только соответствие
  реализации им.
