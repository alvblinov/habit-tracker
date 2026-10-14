# Прогон 04 — реализация новой редакции AC-38

План: `plans/005-design.md`, раздел «Изменение AC-38 (прогон 04, решение пользователя 14.10.2026)».
База: `43edc58775f9d76faa77f9ef889d0e411f20ddef`. Статус: реализовано (тесты e2e не запускались).

## Изменённые файлы

- `src/main.js`
- `src/style.css`
- `README.md` (раздел «Оформление»)

`GOAL.md` и `plans/005-design.md` были изменены координатором до начала работы — не трогал.
Тесты, STATUS.md, AGENTS.md не менялись. Зависимости не добавлялись.

## Что сделано по пунктам плана

1. Карточка всегда анимирована, формы и статистика статичны.
   - Новая функция `cardEmojiUrl(char)`: `animatedEmojiUrl(char) ?? staticEmojiUrl(char)`;
     при `prefers-reduced-motion: reduce` возвращает `staticEmojiUrl(char)`.
   - `renderEmoji(char, { src, reuseImg })`: по умолчанию `src = staticEmojiUrl(char)` — так
     вызывается в форме добавления, форме ✏️ и статистике (вызовы не менялись).
     Карточка (`habit-emoji`) передаёт `src: cardEmojiUrl(habit.emoji)`.
2. Механизм «2 с webp» удалён: `EMOJI_ANIMATION_MS`, `emojiAnimation{habitId, until}`,
   `startEmojiAnimation`/`stopEmojiAnimation`, `isEmojiAnimating`, `data-animating`.
   Вместо него — «подпрыгивание»:
   - `startEmojiBounce(habitId)` (кроме reduced motion) запоминает `bounceHabitId` и ставит
     таймер `EMOJI_BOUNCE_MS = 600`, по окончании сбрасывает состояние и перерисовывает;
   - `stopEmojiBounce(habitId)` — при снятии отметки сегодняшнего дня;
   - `onTodayToggled` (вызывается, как и раньше, только для сегодняшнего дня — кнопка «Сегодня»
     и клетка сегодня) запускает эффект только при переходе в «выполнено»;
   - в `renderCard` у `habit-emoji` ставится `data-bounce="true"`, у картинки — класс
     `is-bounce` (на переиспользованной картинке класс снимается, когда эффекта нет).
   - CSS: `.emoji-img.is-bounce` — одно проигрывание `emoji-bounce 0.6s` (было 0.65s × 3),
     по-прежнему только внутри `@media (prefers-reduced-motion: no-preference)`.
3. Сохранение `<img>` карточки между перерисовками: в `render()` перед `replaceChildren`
   собираются картинки `.habit-emoji .emoji-img` текущих карточек в `Map` по `data-habit-id`;
   `renderCard(habit, today, index, prevEmojiImgs)` передаёт её в `renderEmoji`, который
   переносит прежний элемент, если его атрибут `src` совпадает с новым, иначе создаёт новый
   (смена эмодзи в ✏️, смена reduced motion). Скрытый текст с символом по-прежнему
   создаётся заново (textContent).
4. README «Оформление»: описано постоянное движение на карточках, статичные эмодзи в формах
   и статистике, «подпрыгивание» ~0,6 с при отметке сегодня, отсутствие эффекта при снятии /
   прошлом дне и статичность при «уменьшить движение».

Пункт плана про тесты (`tests/e2e/design.spec.js`) — зона demo-test-writer, не выполнялся.

## Отклонения

- Таймер (`setTimeout`) остался, но только для снятия 600-мс эффекта «подпрыгивания»
  (атрибут `data-bounce` держится на время эффекта, как требует план); `until` и смена
  картинки по таймеру удалены.
- Изменение настройки reduced motion во время работы страницы применяется при следующей
  перерисовке (отдельный слушатель не добавлялся — вне плана).

## Выполненные команды

```
export PATH="/c/Program Files/nodejs:$PATH"
npm run build      -> ✓ 15 modules transformed, built in 217ms (dist/assets/index-*.js 30.48 kB)
npm run test:unit  -> Test Files 9 passed (9), Tests 435 passed (435)
```

e2e (`npm run test:e2e`) не запускались — это делает demo-test-runner; e2e-тесты AC-38 ещё
в прежней редакции и ожидаемо разойдутся с новым поведением до их переписывания.
Внешний вид в браузере не просматривался.
