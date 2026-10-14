# Реализация — итерация 005 «Визуал и дизайн», прогон 01

План: `plans/005-design.md` (утверждён пользователем 14.10.2026). Ветка `feature/design`,
base_ref `ac8c75e`. Статус: **реализовано** (не проверено независимо: e2e, аудит и
просмотр в браузере не выполнялись).

## Изменённые файлы

| Файл | Что |
|---|---|
| `src/colors.js` (новый) | `PALETTE`, `COLOR_LABELS`, `normalizeColor`, `nextFreeColor` |
| `src/theme.js` (новый) | `THEME_KEY = 'habit-tracker:theme'`, `normalizeTheme`, `resolveTheme`, `toggleTheme` |
| `src/habits.js` | `addHabit` → `color: nextFreeColor(state.habits)`; `updateHabit(..., { name, emoji, days, color })` |
| `src/storage.js` | `sanitizeHabit(raw, index)` → `color: normalizeColor(raw.color) ?? PALETTE[index % 8]` |
| `src/main.js` | `data-color` у карточки и строки статистики; выбор цвета в форме ✏️; кольцо прогресса; кнопка темы; анимация отметки |
| `src/style.css` | переписан: токены тем, палитра, «мягкий минимализм», тёмная тема, анимации, reduced-motion |
| `index.html` | inline-скрипт темы в `<head>`; `<header class="app-header">` с кольцом, заголовком, `today-summary` и `theme-toggle` |
| `README.md` | раздел «Оформление» (цвета, кольцо, тема, ключ `habit-tracker:theme`) |

Тесты, GOAL.md, STATUS.md, план, роли и скиллы не менялись.

## По пунктам плана

### Модель данных и логика
- `PALETTE = ['teal','purple','coral','pink','blue','green','amber','gray']` (порядок как в GOAL).
- `COLOR_LABELS`: бирюзовый, фиолетовый, коралловый, розовый, синий, зелёный, янтарный, серый.
- `normalizeColor(raw)` → ключ палитры или `null` (не строка/неизвестный ключ → `null`).
- `nextFreeColor(habits)` → первый ключ, не занятый (по `normalizeColor(h.color)`); все заняты →
  `PALETTE[habits.length % 8]`. Не-массив обрабатывается как пустой список.
- `addHabit` ставит `color: nextFreeColor(state.habits)`.
- `updateHabit`: `color === undefined` → цвет не трогается и поле не добавляется (как `days`);
  ключ не из палитры → цвет не меняется; изменён только цвет → новый объект состояния; ничего не
  изменилось (в т.ч. тот же цвет) → тот же объект `state`.
- `loadState`: индекс для цвета по порядку — **позиция в итоговом (загруженном) списке**
  (`state.habits.length` в момент добавления), т.е. пропущенные битые записи и дубликаты id
  позицию не занимают. Ключ хранилища `habit-tracker:v1` и `version: 1` не менялись.
- `theme.js`: `normalizeTheme` → `'light' | 'dark' | null`; `resolveTheme(saved, systemPrefersDark)` —
  сохранённое (валидное) важнее системного, иначе `dark`/`light` по флагу; `toggleTheme('dark')` →
  `'light'`, всё остальное → `'dark'`.

### Интерфейс (`main.js`, `index.html`)
- Карточка `habit-card` получает `data-color` = `colorOf(habit, index)` (только ключ из PALETTE;
  если в состоянии вдруг нет валидного цвета — ключ по позиции).
- Строка статистики `stats-row` получает `data-color` (цвет берётся из `state.habits` по id;
  `stats.js` не менялся).
- Форма ✏️: после эмодзи — `div.color-options[role=radiogroup][aria-label="Цвет"]`
  с 8 `label.color-option[data-testid="edit-color-option"][data-color=<ключ>]`
  (как у `edit-emoji-option`: testid на `<label>`), внутри `input[type=radio]`
  (`name="edit-color-<id>"`, `value` = ключ, `aria-label` = русское название, класс visually-hidden)
  и кружок `span.color-option-swatch`. Отмечен текущий цвет; сохранение — той же кнопкой «Сохранить»
  через `updateHabit(..., editDraft)` (в черновик добавлено поле `color`).
- Шапка `header.app-header`: кольцо `[data-testid="progress-ring"]` (атрибуты `data-done`,
  `data-total`, `data-complete="true|false"`, `aria-hidden="true"` — текст дублирует сводка),
  SVG-окружность с `pathLength="100"` и `stroke-dasharray="<процент> 100"`, в центре
  `[data-testid="progress-ring-label"]` «X/Y». `data-complete = total > 0 && done === total`;
  Y = 0 → «0/0», `stroke-dasharray="0 100"`. Рядом — `h1` и прежний `today-summary` (тот же текст,
  тот же `id`/`data-testid`/`aria-live`; перенесён из-под формы в шапку — по GOAL «вверху … рядом
  прежний текст»).
- Кнопка `#theme-toggle[data-testid="theme-toggle"]`: в светлой теме «🌙», `aria-label`/`title`
  «Включить тёмную тему», `aria-pressed="false"`; в тёмной — «☀️», «Включить светлую тему»,
  `aria-pressed="true"`. Клик → `data-theme` на `<html>` + запись `habit-tracker:theme` (try/catch,
  только свой ключ). Без ручного выбора атрибут не ставится; текущая тема определяется
  `resolveTheme(атрибут, matchMedia('(prefers-color-scheme: dark)'))`; при смене системной темы
  без ручного выбора кнопка обновляется.
- Inline-скрипт в `<head>` (до CSS/JS приложения) читает `habit-tracker:theme` в try/catch и ставит
  `data-theme` только для `light`/`dark`. Сохраняется в `dist/index.html` после сборки (проверено grep).
- Анимация отметки: после клика по «Сегодня» или клетке сетки у пересозданного элемента
  появляется класс `is-pop` (одна перерисовка), CSS-анимация `transform: scale` 0.24 с; только при
  `prefers-reduced-motion: no-preference`, при `reduce` все анимации и переходы отключены.
- Весь пользовательский текст по-прежнему через `textContent`; новых `innerHTML` нет.

### Оформление (`style.css`)
- Токены темы на `:root` (светлая), `:root[data-theme='dark']` и
  `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` (тот же набор значений,
  продублирован, т.к. CSS без препроцессора). `color-scheme` переключается для системных контролов.
- Цвета привычек: на `:root` по теме задаются `--c-<ключ>`, `--c-<ключ>-soft`, `--c-<ключ>-strong`;
  правила `[data-color='<ключ>']` задают `--habit`, `--habit-soft`, `--habit-strong`.
- Где применяется цвет привычки (для тестов AC-33):
  - плашка эмодзи `.habit-emoji` — `background: var(--habit-soft)`;
  - `toggle-today[aria-pressed='true']` — `background: var(--habit)`, текст `var(--on-habit)`;
    неотмеченная — фон `--surface`, рамка и текст `--habit-strong`;
  - `.day-cell.is-done` (в т.ч. `.is-off.is-done`) — `background: var(--habit)`, рамка `--habit-strong`;
  - строка статистики — полоска `box-shadow: inset 4px 0 0 var(--habit)` у ячейки `.stats-habit`
    и заполнение `meter` (`::-webkit-meter-optimum-value` и т.п.) в `--habit`;
  - кружок выбора `.color-option-swatch` — `background: var(--habit)`.
  То есть computed `background-color` отмеченной кнопки и выполненной клетки одной привычки равны
  `--c-<ключ>` текущей темы; у плашки — `--c-<ключ>-soft`.
- Прежние визуальные различия сохранены: неотмеченная клетка — `--cell-empty`, отмеченная — цвет
  привычки (разный `background-color`); выходная `is-off` — штриховка `repeating-linear-gradient`
  и `opacity: 0.55` против сплошного фона и `opacity: 1` у рабочей. Hover меняет только
  рамку/тень (не фон и не прозрачность), переходы на `background-color` не используются —
  чтобы computed-стили в e2e не попадали в середину перехода.
- Карточки, форма, панель статистики: скругление 18px, мягкая тень, белые карточки на тёплом фоне;
  кнопка «Сегодня» — пилюля (border-radius 999px); клетки — скруглённые квадраты (6px);
  периоды статистики и дни недели — пилюли. Сегодняшняя клетка — `outline` цвета `--today`.
- Кольцо: трек `--ring-track`, прогресс `--accent`, при `data-complete='true'` — `--success`
  (зелёный), подпись — `--success-text`.
- Шрифт — системный стек (`system-ui, -apple-system, 'Segoe UI', Roboto, …` + системные шрифты
  эмодзи), сетевых шрифтов и изображений нет. Узкий экран (≤ 420px) — компактнее отступы и кольцо.

## Палитра (HEX)

### Токены интерфейса

| Токен | Светлая | Тёмная |
|---|---|---|
| `--bg` | `#fbfaf7` | `#161513` |
| `--surface` (карточки) | `#ffffff` | `#211f1c` |
| `--surface-2` (поля, панели) | `#f5f3ef` | `#2a2824` |
| `--text` | `#1f1d1a` | `#f2efea` |
| `--muted` | `#67625a` | `#aba59c` |
| `--border` / `--border-strong` | `#e7e3dc` / `#d6d1c8` | `#34312d` / `#4a4640` |
| `--accent` / `--on-accent` | `#0f766e` / `#ffffff` | `#5ec4b6` / `#10201e` |
| `--danger` | `#b42318` | `#ff8a80` |
| `--focus`, `--today` | `#2563eb` | `#7fb0ff` |
| `--success` / `--success-text` | `#2f9e57` / `#1e7a3f` | `#4cc77a` / `#6edb96` |
| `--reminder` / `--reminder-soft` | `#1d5fbf` / `#e5eefc` | `#8db8ff` / `#1e2a3d` |
| `--banner-bg` / `--banner-border` | `#fff4d2` / `#e0b43a` | `#3a3016` / `#8a6d1f` |
| `--best` | `#8a5a00` | `#f0c060` |
| `--cell-empty` | `#ece9e3` | `#302d29` |
| `--cell-off-a` / `--cell-off-b` | `#f3f1ec` / `#e2ded6` | `#24221f` / `#34312c` |
| `--on-habit` (текст на цвете привычки) | `#1f1d1a` | `#161513` |

### Цвета привычек (`--habit` / `--habit-soft` / `--habit-strong`)

| Ключ | Светлая | Тёмная |
|---|---|---|
| teal | `#7fd1c4` / `#e2f4f1` / `#0f6b60` | `#6cc4b6` / `#1d3532` / `#8bdacd` |
| purple | `#b9a6f2` / `#eee9fd` / `#5b3fbf` | `#ab98ec` / `#2c2840` / `#c3b4f5` |
| coral | `#f5a48a` / `#fdeae3` / `#a8401f` | `#ee987e` / `#3e2a23` / `#f5ae97` |
| pink | `#f0a5c6` / `#fce7f0` / `#a3305f` | `#e89bbe` / `#3d2631` / `#f2b2cf` |
| blue | `#93bdf5` / `#e5effd` / `#1f5bb5` | `#86b0ee` / `#1f2c40` / `#9dc2f7` |
| green | `#9dd49b` / `#e6f4e5` / `#2e6b2c` | `#8cc88b` / `#23331f` / `#a3d9a2` |
| amber | `#f2c766` / `#fcf2da` / `#8a5a00` | `#e8bc5e` / `#3a3120` / `#f2cb78` |
| gray | `#afa9a0` / `#efede9` / `#5c574f` | `#aba59c` / `#2e2c29` / `#c4bfb7` |

## Контраст (WCAG 2.x, рассчитан скриптом по формуле относительной яркости)

Расчёт выполнен node-скриптом во временной папке (не в проекте) по HEX выше; в браузере
computed-стили не измерялись.

| Пара | Светлая | Тёмная |
|---|---|---|
| `--text` на `--bg` (основной текст) | 16.11 | 15.91 |
| `--text` на `--surface` | 16.81 | 14.33 |
| `--text` на `--surface-2` | 15.17 | 12.83 |
| `--muted` на `--bg` / `--surface` / `--surface-2` | 5.80 / 6.05 / 5.46 | 7.47 / 6.73 / 6.02 |
| `--on-accent` на `--accent` | 5.47 | 8.05 |
| `--danger` на `--surface` / `--surface-2` | 6.57 / 5.93 | 7.20 / 6.44 |
| `--reminder` на `--surface` | 6.10 | 8.17 |
| `--best` на `--surface` | 5.93 | 9.72 |
| `--success-text` на `--surface` / `--bg` | 5.37 / 5.14 | 9.58 / 10.63 |
| `--text` на `--banner-bg` | 15.31 | 11.34 |
| `--text` на `--reminder-soft` | 14.39 | 12.59 |

Цвета привычек (минимум по 8 цветам, в скобках — худший цвет):

| Пара | Светлая | Тёмная |
|---|---|---|
| `--on-habit` на `--habit` (текст «Сегодня ✓») | ≥ 7.21 (gray) | ≥ 7.33 (purple) |
| `--text` на `--habit-soft` (плашка) | ≥ 14.18 (purple) | ≥ 11.16 (amber) |
| `--habit-strong` на `--surface` (текст «Сегодня») | ≥ 5.93 (amber) | ≥ 8.74 (purple) |
| `--habit-strong` на `--surface-2` | ≥ 5.35 (amber) | ≥ 7.82 (purple) |

Все текстовые пары ≥ 4.5 (AA). Неконтрастное (не текст) отличие `--habit` от `--cell-empty`
в светлой теме 1.32–1.92, поэтому у выполненных клеток дополнительно рамка `--habit-strong`.

## Отклонения и решения в рамках плана

- `today-summary` перенесён из-под формы добавления в шапку рядом с кольцом (GOAL: кольцо «вверху …
  рядом прежний текст»); текст, `id`, `data-testid`, `aria-live` не менялись.
- Индекс для цвета по порядку при загрузке — позиция в итоговом списке (а не в сыром массиве
  с битыми записями).
- `data-testid="edit-color-option"` стоит на `<label>` (как `edit-emoji-option`), радиокнопка внутри.
- Кольцо помечено `aria-hidden="true"` (доступный текст — `today-summary`); `getByTestId` его находит.
- Для «одной» анимации добавлено состояние `popTarget` в `main.js`: элементы пересоздаются при
  каждом рендере, поэтому CSS-transition на них не срабатывает.
- В тёмной теме токены продублированы в двух селекторах (ручной выбор и системный) — без
  препроцессора иначе нельзя.

## Выполненные команды

| Команда | Результат |
|---|---|
| `npm run test:unit` | пройдено: 6 файлов, 280/280 тестов (прежний набор, без изменений) |
| `npm run build` | успешно: `dist/index.html` 5.35 kB, CSS 16.33 kB, JS 28.95 kB; inline-скрипт темы есть в `dist/index.html` |
| node-проверка логики (временный скрипт) | 10 привычек → `teal,purple,coral,pink,blue,green,amber,gray,teal,purple`; `updateHabit` с тем же/битым цветом → тот же объект; загрузка `[без цвета, битый, amber]` → `teal,purple,amber`; `nextFreeColor([teal,coral])` → `purple`; `resolveTheme(null,true)` → `dark`, `resolveTheme('light',true)` → `light` |
| node-скрипт контраста | значения в таблицах выше |

Не выполнялось: `npm run test:e2e` (песочница агента не даёт подключиться к localhost — запускает
координатор), новые тесты (пишет demo-test-writer), просмотр внешнего вида в браузере —
**внешний вид не проверен**.
