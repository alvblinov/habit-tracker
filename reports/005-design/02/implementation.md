# Реализация — итерация 005, дополнение (прогон 02)

План: `plans/005-design.md`, раздел «Дополнение (прогон 02)» (подтверждён пользователем 14.10.2026).
База: `ac8c75e` + незакоммиченные изменения прогона 01 (не откатывались).
Статус: **реализовано**. Тесты на новое поведение пишет demo-test-writer; e2e не запускались.

## Изменённые файлы

| Файл | Что |
|---|---|
| `src/emoji-assets.js` (новый) | `HAS_ANIMATION` (Set из 9 кодов с WebP), `emojiCode(char)`, `staticEmojiUrl(char)` → `emoji/<код>.svg`, `animatedEmojiUrl(char)` → `emoji/<код>.webp` или `null` (🏃 🧘 💊). Чистая логика, без DOM. |
| `src/main.js` | Помощник `renderEmoji(char, { animated })`; «оживление» эмодзи (`emojiAnimation`, `startEmojiAnimation`, `stopEmojiAnimation`, `onTodayToggled`, `isEmojiAnimating`); эмодзи картинками во всех 4 местах. |
| `src/style.css` | `.emoji-img` (размеры в 4 местах), `.is-bounce` + `@keyframes emoji-bounce` (только при `prefers-reduced-motion: no-preference`), `.app-footer`, фон `body::before` с тремя `radial-gradient` и токены `--blob-*` для светлой и обеих тёмных веток; `body` получил прозрачный фон (`--bg` остался на `:root`). |
| `index.html` | `<footer class="app-footer" data-testid="emoji-credit">` после `<main>`. |
| `README.md` | Раздел «Оформление»: эмодзи Noto, оживление, фон, авторство. |

Ассеты `public/emoji/` не менялись, из сети ничего не скачивалось. Тесты, GOAL/STATUS/AGENTS, план, роли и скиллы не менялись. Новых зависимостей нет.

## По пунктам плана

- **Логика `src/emoji-assets.js`**: код — кодовые точки в hex через `_`, нижний регистр (`💧` → `1f4a7`, `✍️` → `270d_fe0f`). Пути относительные. Сверено скриптом: для всех 12 `EMOJIS` SVG существует, WebP существует у 9, у 🏃 🧘 💊 — `null`.
- **`renderEmoji`**: возвращает фрагмент `<img class="emoji-img" alt="" aria-hidden="true" src=…>` + `<span class="visually-hidden">символ</span>` (символ через `textContent`). `textContent` элементов `habit-emoji`, `emoji-option`, `edit-emoji-option`, `.stats-emoji` остаётся прежним символом; `data-emoji`, `value`, `aria-label` радиокнопок не менялись.
- **Применено в 4 местах**: форма добавления (`buildEmojiOptions`), форма ✏️ (`renderEditForm`), плашка карточки (`renderCard`), строка статистики (`renderStatsRow`).
- **Оживление**: клик по `toggle-today` или по клетке с `key === today` → если после переключения сегодня отмечено, `emojiAnimation = { habitId, until: Date.now() + 2000 }` и `setTimeout(…, 2000)`, который сбрасывает состояние и вызывает `render()`. Пока `Date.now() < until`, у `habit-emoji` этой привычки `data-animating="true"` и `src` = `.webp`; для 🏃 🧘 💊 — `.svg` с классом `is-bounce`. Снятие сегодняшней отметки эффект не запускает и останавливает текущий эффект этой привычки; клик по прошлому дню эффект не трогает. При `matchMedia('(prefers-reduced-motion: reduce)')` эффект не запускается (и `data-animating` не ставится). Повторная отметка другой привычки заменяет эффект (один таймер). WebP — обычный `<img src>`, грузится только при первом показе.
- **Уведомления**: не менялись (символ в заголовке).
- **Подвал**: текст «Эмодзи: Google Noto (CC BY 4.0, Apache 2.0)», ссылка «Google Noto» → `https://googlefonts.github.io/noto-emoji-animation/`, `target="_blank" rel="noopener"`.
- **Фон**: `body::before` — `position: fixed; inset: 0; z-index: -1; pointer-events: none; filter: blur(40px)`, три `radial-gradient` (бирюзовый, фиолетовый, коралловый). Светлая тема: непрозрачность пятен 0.24–0.28; тёмная (ручная и системная): 0.08–0.10. Карточки по-прежнему непрозрачные (`--surface`). Чтобы пятна были видны, у `body` фон прозрачный (иначе фон `body` перекрывает псевдоэлемент с `z-index: -1`); фон `--bg` остался на `:root`.
- **README**: обновлён.

## Отклонения

- Добавлена `stopEmojiAnimation`: если снять сегодняшнюю отметку во время эффекта, эффект прекращается. План прямо этого не требует, но это следует из требования «снятие отметки анимацию не запускает».
- `body` теперь с `background: transparent`. Тест контраста (`design.spec.js`) при прозрачном фоне `body` берёт фон `documentElement`, поэтому вычисление не меняется. Для подписи `--muted` поверх самого яркого (кораллового) пятна оценка контраста ≈ 4.9:1 (расчёт без учёта размытия, в браузере не проверялась).

## Выполненные команды

```
export PATH="/c/Program Files/nodejs:$PATH"
npm run build
```
Результат: успешно (`✓ built in 233ms`, 15 модулей); в `dist/emoji/` 22 файла (12 svg, 9 webp, ATTRIBUTION.md).

```
npm run test:unit
```
Результат: `Test Files 8 passed (8)`, `Tests 363 passed (363)`.

```
node --input-type=module -e "…"  # сверка staticEmojiUrl/animatedEmojiUrl для EMOJIS с файлами в public/emoji
```
Результат: все 12 SVG существуют; WebP существуют у 9; у 🏃 🧘 💊 `animatedEmojiUrl` = `null`.

## Не выполнялось

- `npm run test:e2e` — не запускался (полный прогон делает demo-test-runner / координатор вне песочницы).
- Внешний вид (пятна, размеры картинок, подпрыгивание, анимация WebP) в браузере **не смотрели**.
