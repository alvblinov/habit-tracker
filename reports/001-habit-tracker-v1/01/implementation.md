# Реализация — план 001, прогон 01

Статус: IMPLEMENTED (код написан; независимая проверка тестами не выполнялась — тестов пока нет,
их пишет demo-test-writer, запускает demo-test-runner).

- План: `plans/001-habit-tracker-v1.md` (утверждён пользователем 13.10.2026, см. STATUS.md/GOAL.md)
- base_ref: `4886a039b8f1084c2bd2cfb6d8b2505f213a7924`
- Чужие изменения (`STATUS.md`, `plans/001-habit-tracker-v1.md`) не трогались. Commit/push не делались.

## Изменённые файлы

| Файл | Статус |
|---|---|
| `src/dates.js` | новый |
| `src/habits.js` | новый |
| `src/storage.js` | новый |
| `src/main.js` | переписан (был заглушкой каркаса) |
| `index.html` | статическая разметка формы, сводки, пустого состояния, списка |
| `src/style.css` | стили карточек, формы, сетки, адаптив |

Тесты, GOAL.md, STATUS.md, план, роли и скиллы не менялись. Зависимости не добавлялись.

## По пунктам плана

- **Модель данных** — `{ version: 1, habits: [{ id, name, emoji, createdAt, done: [...] }] }`,
  ключ `habit-tracker:v1` (`STORAGE_KEY`). `done` хранится отсортированным без дублей.
- **`src/dates.js`** — `toDateKey(date)` через getFullYear/getMonth/getDate (без toISOString);
  `addDays(key, n)` через `new Date(y, m-1, d+n)`; `lastNDays(todayKey, n)` — от старого к сегодня.
  Дополнительно (вспомогательные): `fromDateKey(key)` (ключ → локальный Date, для подписи клеток)
  и `isDateKey(value)` (проверка существующей даты YYYY-MM-DD, используется в storage).
- **`src/habits.js`** — `EMOJIS` (12), `DEFAULT_EMOJI='⭐'`, `MAX_NAME_LENGTH=40`, `createEmptyState`,
  `normalizeName` (trim, пусто/не строка → `null`), `addHabit` (невалидное имя → тот же объект состояния;
  имя `trim → slice(0,40) → trim`; неизвестный эмодзи → ⭐; дубликаты названий разрешены),
  `toggleDay` (дата > сегодня или неизвестный id → тот же объект состояния), `removeHabit`, `isDone`,
  `getStreak` (старт с сегодня, если отмечено, иначе со вчера; назад до первого пропуска),
  `getTodaySummary` → `{done, total}`. Дополнительно экспортирован `normalizeEmoji` (используется в storage).
  Функции чистые, без DOM и без `new Date()`.
- **`src/storage.js`** — `loadState(storage)`: отсутствие ключа, исключение `getItem`, битый JSON,
  `version !== 1`, не-массив `habits` → пустое состояние. Привычки без строкового id, с пустым именем
  или некорректной `createdAt` отбрасываются; повторяющиеся id отбрасываются; некорректные даты в `done`
  отфильтровываются; неизвестный эмодзи → ⭐; имя обрезается до 40. `saveState(storage, state)` пишет
  только свой ключ, ошибки ловит и возвращает `false` (успех — `true`).
- **`src/main.js`** — состояние загружается из `localStorage` (доступ к нему тоже в try);
  `today = toDateKey(new Date())` на каждом рендере и в обработчиках; действия → функция `habits.js`
  → `saveState` → `render()`. Перерисовка при `focus` и `visibilitychange` (visible). Удаление —
  `window.confirm('Удалить привычку «<название>»?')`. id — `crypto.randomUUID()` (с простым запасным
  вариантом, если API недоступен вне secure context). Пользовательский текст — только `textContent`.
  Серия: «🔥 N день/дня/дней подряд» со склонением. Кнопка «Сегодня» / «Сегодня ✓» с `aria-pressed`.
  Сетка — 30 кнопок, `aria-pressed`, `title` и `aria-label` с датой по-русски, `data-date`, сегодня — последняя.
- **`index.html`** — заголовок, форма (input `maxlength="40"`, fieldset эмодзи, кнопка «Добавить»),
  сводка, пустое состояние «Добавьте первую привычку», список `<ul>`.
- **`src/style.css`** — карточки, кнопка «сегодня», сетка CSS grid 10×3 (узкий экран) / 15×2
  (≥ 560px), выделение отмеченных (`.is-done`) и сегодняшней (`.is-today`) клеток, `min-width: 320px`.

### data-testid

`habit-name-input` (input), `emoji-option` (на `<label>` варианта, содержит скрытый `input[type=radio]
name=emoji value=<эмодзи>` и атрибут `data-emoji`), `add-habit`, `habit-card` (`<li>`, также
`data-habit-id`), `habit-streak`, `toggle-today`, `day-cell` (+ `data-date`), `delete-habit`,
`today-summary`, `empty-state` (элемент всегда в DOM, при наличии привычек — атрибут `hidden`).
Дополнительно: `habit-name` и `habit-emoji` внутри карточки.

## Отклонения от плана

1. Варианты эмодзи не прописаны статически в `index.html`, а генерируются в `main.js` один раз из
   `EMOJIS` в статический контейнер `#emoji-options` — чтобы список не дублировался в двух местах.
2. Форма не перестраивается в `render()` (строится один раз), чтобы не терять ввод; `render()`
   перестраивает сводку, пустое состояние и список.
3. Небольшие дополнительные экспорты: `fromDateKey`, `isDateKey` (dates.js), `normalizeEmoji` (habits.js);
   дополнительные testid `habit-name`, `habit-emoji`. Новой функциональности не добавлено.
4. После неудачной попытки добавления (пустое имя/пробелы) поле очищается и получает фокус;
   после успешного — поле очищается, выбор эмодзи сбрасывается на ⭐.

## Выполненные команды

1. `npm run build` (с `PATH="/c/Program Files/nodejs:$PATH"`) — успешно:
   8 modules transformed, `dist/index.html 1.42 kB`, `dist/assets/index-*.css 3.14 kB`,
   `dist/assets/index-*.js 6.60 kB`, built in 89ms.
2. Ручной smoke-скрипт `node --input-type=module -e "..."` по логике (не тесты проекта), фактический вывод:
   - `addDays('2026-03-01',-1)` → `2026-02-28`; `addDays('2025-12-31',1)` → `2026-01-01`;
     `isDateKey('2026-02-29')` → false; `isDateKey('2028-02-29')` → true;
   - `lastNDays('2026-10-13',30)` → 30 элементов, `2026-09-14` … `2026-10-13`;
   - имя из пробелов не добавляется; `'  Вода  '` с неизвестным эмодзи → `{"name":"Вода","emoji":"⭐",...}`;
   - отмечены 11.10 и 12.10, сегодня 13.10 не отмечено, попытка отметить 14.10 игнорируется →
     серия 2, сводка `{"done":0,"total":1}`;
   - save→load круговой — совпадает; чужой ключ `other` не тронут; битый JSON → пустое состояние.

## Что не проверялось

- `npm run test:unit`, `npm run test:e2e` — не запускались (тестов в проекте ещё нет).
- Внешний вид и поведение в браузере не смотрелись (страница в браузере не открывалась).
