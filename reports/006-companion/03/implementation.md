# Реализация — итерация 006, прогон 03 (расширение: помощник-тренер и гид)

План: `plans/006-companion.md`, раздел «Расширение (прогон 03)» (подтверждён пользователем 15.10.2026).
Критерии: `GOAL.md` → «Расширение итерации 006», AC-47…AC-54.
База: `aeda80e` + незакоммиченные изменения прогонов 01–02 (не откатывались).
Статус: **реализовано** (код написан). Тесты не писались и не менялись; независимый
прогон — за demo-test-runner.

## Изменённые и новые файлы

| Файл | Что |
|---|---|
| `src/companion.js` | новые поводы, `STREAK_MILESTONES`, `ACCENTS`/`accentOf`, `companionEventForMark` (дата клетки, вехи, `markPast`, `firstDayClosed`), `companionEventForAdd`, поля настроек `tourOffered`, `lastTipDate` |
| `src/companion-qa.js` | новый: «Спроси меня» — 44 записи, нормализация, поиск по ключевым словам, быстрые вопросы, ответы в стиле персонажа |
| `src/companion-tips.js` | новый: 30 советов, `tipForDay`, `shouldShowTip` |
| `src/companion-tour.js` | новый: `TOUR_STEPS` — 6 шагов |
| `src/main.js` | виджет в углу, новое облачко (печать, закрыть, акцент, кнопка действия), очередь реплик, конфетти, «Спроси меня», экскурсия, совет дня, реплики на все действия, статичный фон под анимированным эмодзи |
| `index.html` | помощник перенесён из шапки в `companion-dock` (после подвала); в шапке осталась только «Включить помощника»; новое облачко, меню с «Спроси меня» и «Экскурсией», разметка экскурсии |
| `src/style.css` | раздел помощника переписан: виджет `fixed`, отступ страницы, облачко с хвостиком и акцентами (светлая/тёмная тема), анимации, конфетти, меню, экскурсия; правило `.emoji-img.has-static-bg` |
| `README.md` | раздел «Помощник» — новые возможности |

GOAL.md, STATUS.md, AGENTS.md, план, тесты — не менялись.

## Что сделано по пунктам плана

### Логика (чистые функции)

- **Новые поводы** в `PHRASES` у всех 7 персонажей, по 3 варианта: `added`, `firstHabit`,
  `markPast`, `firstDayClosed`, `milestone`, `reminderSet`, `edited`, `deleted`, `tourOffer`,
  `tipIntro` (добавлены в `EVENTS`). Хранятся в `ACTION_PHRASES` и подмешиваются в
  `PHRASES[id]`. Проверено скриптом (см. ниже): у всех поводов ≥ 3 варианта, после подстановки
  нет `{…}`, нет слов «пропустил/лентя/стыдно/позор/провал», дословных совпадений между
  персонажами нет; к пользователю — без глаголов прошедшего времени с родом.
- `STREAK_MILESTONES = [3, 7, 14, 30, 50, 100]`.
- `companionEventForMark({ before, after, today, habitId, date = today })` — новый параметр
  `date` (какая клетка переключена; без него — сегодня, прежние вызовы работают). Приоритет:
  `unmark` > `milestone` (серия стала вехой и выросла) > `newRecord` > `markPast` (прошлый
  день) > `firstDayClosed` > `allDone` > `remaining` > `markStreak` > `mark`.
  `firstDayClosed` — все привычки дня выполнены, и среди более ранних дней с отметками
  нет ни одного закрытого целиком (по `getTodaySummary` на ту дату).
  Отметка прошлого дня тоже может дать `milestone`/`newRecord`, если она дотянула серию.
- `companionEventForAdd({ before, after })` → `firstHabit` (список был пуст) или `added`,
  `ctx.habit` — название новой привычки.
- `ACCENTS`: cat → `amber`, fox → `orange`, panda → `bamboo` (бирюзово-зелёный), frog → `green`,
  owl → `brown`, penguin → `blue`, hedgehog → `rose`; `accentOf(id)` (неизвестный → кот).
- `normalizeCompanionSettings`: `tourOffered` (только `true`, иначе `false`),
  `lastTipDate` (только существующая дата `YYYY-MM-DD`, иначе `null`); те же поля в
  `defaultCompanionSettings()`.
- `src/companion-qa.js`: `normalizeQuestion` (нижний регистр, ё→е, всё кроме букв/цифр → пробел),
  `QA` (44 записи `{ id, keywords, answer, quick? }`), `findAnswer(text)` (ключ — начало слова;
  ключ из нескольких слов — начала нескольких слов подряд; счёт — число совпавших ключей, при
  равенстве — длина совпадения, затем порядок), `QUICK_QUESTIONS` (8), `getAnswerEntry(id)`,
  `answerText(entry, characterId)` (вступление в стиле персонажа + ответ),
  `unknownAnswer(characterId)`, `answerQuestion(text, characterId)` → `{ id | 'unknown', text }`.
  Отклонение от формы плана: вместо `answer(characterId) | answers{...}` у записи — общий
  `answer`, а стиль персонажа даёт вступление (`LEADS`, по 3 на персонажа) — так 44 ответа не
  пишутся 7 раз.
- `src/companion-tips.js`: `TIPS` (30), `tipForDay(dateKey)` — номер дня от 1970-01-01 по
  `Date.UTC(y, m-1, d)` (только для счёта, «сегодня» берётся из локальной даты) mod 30, по кругу;
  `shouldShowTip(settings, todayKey)` — включён, знакомство пройдено, `lastTipDate ≠ todayKey`.
- `src/companion-tour.js`: `TOUR_STEPS` — 6 шагов `{ id, target, title, text, missingText? }`.

### Интерфейс

- **Место (AC-47)**: `#companion-wrap.companion.companion-dock` (`data-testid="companion-dock"`) —
  `position: fixed`, справа снизу 16px (+ safe-area), на узком экране 12px и персонаж 52px,
  `z-index: 40`. Виджет `pointer-events: none`; клики принимают только персонаж, меню, «×» и
  кнопка «Покажи!» в облачке. Пока помощник на экране, у `body` класс `has-companion` и
  `padding-bottom: 96px` (84px на узком). Прежние `data-testid` (`companion`, `companion-bubble`,
  `companion-menu`, `companion-change`, `companion-pick`, `companion-rename*`, `companion-off`,
  `companion-on`, `companion-intro*`, `companion-option`) сохранены; `companion-on` — в шапке.
- **Облачко (AC-48)**: `companion-bubble` (`role="status"`, `aria-live="polite"`,
  `data-event`, `data-accent`, при ответе — `data-qa`, `data-typing`), внутри
  `companion-bubble-name` (имя), `companion-bubble-close` («×», `aria-label="Закрыть"`),
  `companion-bubble-text`. Рамка 2px и цветная тень в акценте персонажа, хвостик (`::after`,
  повёрнутый квадрат). Появление — `scale + fade` с пружинной кривой; персонаж подпрыгивает
  (класс `is-talking`, 0.6 с). Печать: полный текст сразу в `data-full-text` и `aria-label`
  у `companion-bubble-text`, `textContent` наращивается по символу каждые 25 мс; пока идёт
  печать, у облачка `aria-busy="true"` (экранный диктор прочтёт фразу один раз). Ненапечатанный
  остаток выводится невидимым через `::after { content: attr(data-rest) }`, чтобы облачко сразу
  имело итоговый размер (в `textContent` не попадает). Время показа =
  max(6 с, символы × 25 мс + 4 с). При reduced motion — текст сразу, без появления,
  подпрыгивания и конфетти, персонаж — SVG.
  Текст облачка — только `textContent`; `textContent` всего облачка = имя + «×» + текст,
  поэтому текст реплики удобнее читать из `companion-bubble-text`.
- **Очередь реплик**: предложение экскурсии после знакомства и совет дня ставятся в очередь и
  показываются, когда текущее облачко скроется само или по «×». Новая обычная реплика заменяет
  текущую, очередь сохраняется. Выключение помощника очищает очередь.
- **Конфетти (AC-49)**: 36 кусочков `span.confetti-piece` в `#companion-confetti`
  (`aria-hidden`, `data-testid="companion-confetti"`, `data-active="true"` пока идут), цвета
  `var(--c-<палитра>)`, CSS-анимация 1.5 с; удаляются через 1.7 с. При reduced motion не создаются.
- **Поводы (AC-49)**: добавление (`added`/`firstHabit`), любая клетка или «Сегодня»
  (`companionEventForMark` с `date`), сохранение 🔔 (`reminderSet`), сохранение ✏️ с изменениями
  (`edited`; без изменений — молчит), удаление после подтверждения (`deleted`). Реплика
  вызывается после `commit()`, таймеры помощника `render()` не вызывают.
- **«Спроси меня» (AC-50)**: в меню форма `companion-ask-form`, поле `companion-ask-input`
  (maxlength 200), кнопка `companion-ask-submit`, кнопки `companion-quick-question`
  (`data-qa`). Ответ — в облачке, `data-event="answer"`, `data-qa` = id записи или `unknown`.
  Поле очищается сразу после вопроса; вопрос никуда не пишется и не отправляется.
- **Экскурсия (AC-51)**: `companion-tour` (`position: fixed`, на весь экран, `z-index: 60`,
  `data-target`, `data-has-target`), подсветка `companion-tour-spot` (окно с тенью
  `0 0 0 9999px`), карточка `companion-tour-step` (`role="dialog"`, `data-step`, `data-step-id`):
  `companion-tour-count` «Шаг N из 6», `companion-tour-title`, `companion-tour-text`, кнопки
  `companion-tour-prev` (на первом шаге недоступна), `companion-tour-next` («Далее», на
  последнем — «Готово» и закрывает), `companion-tour-close`. Цель прокручивается в центр,
  подсветка следует за прокруткой/ресайзом (rAF). Нет цели (нет привычек) — без подсветки,
  затемнение всего экрана и текст `missingText`. Esc закрывает экскурсию (раньше, чем меню).
  Запуск: меню → `companion-tour-start` или «Покажи!» (`companion-tour-accept`) в облачке
  предложения. Предложение — один раз после знакомства: при показе сохраняется
  `tourOffered: true`. Для пользователей, прошедших знакомство в прогонах 01–02,
  предложения нет (оно привязано к знакомству), экскурсия доступна из меню.
- **Совет дня (AC-52)**: при загрузке после приветствия (через очередь), если
  `shouldShowTip`; при показе сохраняется `lastTipDate` = локальная сегодняшняя дата.
  Текст = вступление `tipIntro` в стиле персонажа + совет; `data-event="tip"`. При возврате во
  вкладку (`focus`/`visibilitychange`) проверка повторяется — после полуночи будет совет
  нового дня. Сразу после знакомства в тот же день совет не показывается (только при загрузке).
- **Капля (AC-53)**: у картинки эмодзи на карточке, если это анимированный WebP,
  `style.backgroundImage = url("emoji/<код>.svg")` и класс `has-static-bg`
  (`background-size: contain`, по центру). Фон поставлен **на сам `img.emoji-img`**, а не на
  обёртку `habit-emoji`: так статичная картинка подпрыгивает вместе с анимацией и не
  «двоится» при эффекте отметки. В плашке по-прежнему ровно одна `img` (`img.emoji-img`),
  `textContent` плашки — прежний символ, фон-цвет плашки не меняется. Путь строится только
  из hex-кодов символа.

## Отклонения и замечания

1. QA: стиль персонажа — вступлением к общему ответу, а не отдельные ответы на персонажа
   (см. выше).
2. Статичный фон эмодзи — на `img.emoji-img`, а не на обёртке (план допускал варианты).
   Возможный визуальный эффект: на кадрах, где анимация сдвинута/уменьшена, статичная
   картинка видна под ней — нужно посмотреть в браузере (координатор).
3. Изменение поведения, затрагивающее **прежние тесты прогонов 01–02** (это следствие
   требований AC-47…AC-52; тесты не правил):
   - unit `tests/unit/companion.test.js` — 13 падений: 9 — `normalizeCompanionSettings`
     ожидает объект без `tourOffered`/`lastTipDate` (`toEqual`); 2 — серия 3 теперь `milestone`,
     а не `markStreak`; 2 — первый закрытый день теперь `firstDayClosed`, а не `allDone`.
   - e2e `tests/e2e/companion.spec.js` — 11 из 27 падают: тесты читают `textContent` всего
     облачка сразу (теперь там имя, «×» и текст, который ещё печатается), ждут скрытия
     приветствия через ~6 с (теперь следом показывается совет дня, если `lastTipDate` не
     сегодня), ожидают отсутствия реплики на клетку прошлого дня (теперь `markPast`),
     `markStreak`/`allDone` на 3-й день / первом закрытом дне (теперь `milestone` /
     `firstDayClosed`).
4. Начальный экран без знакомства (чистое хранилище) помощника не показывает — поэтому
   прежние e2e других файлов виджет не видят вовсе; поведение виджета при прокрутке
   проверено отдельным скриптом (ниже).

## Примеры новых реплик

- 🐱 added: «Мур! Новая привычка «{habit}» — уже в списке. Устраиваемся поудобнее.»
- 🦊 firstHabit: «Первый ход сделан: «{habit}»! Хитрый план запущен.»
- 🐼 markPast: «Спокойно заполнили прошлый день для «{habit}». Хорошо.»
- 🐸 firstDayClosed: «КВА-А! Первый закрытый день: {done} из {total}! Дискотека на кувшинках!»
- 🦉 milestone: «Ух! Веха: «{habit}» — {streak} подряд. Мудрость в постоянстве.»
- 🐧 reminderSet: «Докладываю: напоминание для «{habit}» установлено.»
- 🦔 edited: «Фыр, «{habit}» обновлено. Так уютнее.»
- 🐼 deleted: «Удалили «{habit}». Отпустить — тоже забота о себе.»
- 🦊 tourOffer: «Есть план: короткая экскурсия по трекеру. Идём?»
- 🦉 tipIntro + совет: «Ух! Мудрость дня: Привяжи новую привычку к старой: «после чистки зубов — стакан воды».»

## «Спроси меня»: темы (44 записи, id)

Трекер: `add`, `delete`, `rename`, `emoji`, `color`, `schedule`, `mark`*, `past`, `unmark`,
`streak`*, `record`, `grid`, `stats`, `ring`, `reminder`*, `notifications`, `theme`, `storage`*,
`privacy`, `devices`, `companion-change`, `companion-rename`, `companion-off`, `tour`*, `tip`, `export`.
Советы: `start`, `motivation`*, `missed`*, `how-many`, `how-long`*, `stacking`, `forget`, `reward`,
`water`, `sleep`, `sport`, `reading`, `meditation`, `tired`, `morning`, `evening`,
`procrastination`, `phone`.

\* — быстрые вопросы (8 кнопок): «Как отметить привычку?», «Что такое серия?», «Как настроить
напоминание?», «Где хранятся данные?», «С чего начать?», «Нет мотивации», «Серия прервалась»,
«Сколько дней нужно?».

Примеры сопоставления (скрипт): «Как добавить привычку?» → `add`; «КАК УДАЛИТЬ!!!» → `delete`;
«что такое серия» → `streak`; «как отключить помощника» → `companion-off`; «как поменять имя
привычки» → `rename`; «хочу пить больше воды» → `water`; «забыл отметить вчера» → `past`;
«тёмная тема» → `theme`; «ёжик», «<b>x</b>» → `null` (ответ на неизвестный вопрос).

## Шаги экскурсии

1. `#add-form` — «Новая привычка».
2. `[data-testid="toggle-today"]` — «Отметка за сегодня» (без привычек — пояснение без подсветки).
3. `.day-grid` — «Сетка за 30 дней».
4. `[data-testid="reminder-toggle"]` — «Напоминания».
5. `[data-testid="edit-habit"]` — «Изменить привычку».
6. `#stats-toggle` — «Статистика».

## Выполненные команды и фактический результат

Node: `export PATH="/c/Program Files/nodejs:$PATH"`.

1. `npm run build` → успешно (`dist/assets/index-*.css` 28.29 kB, `index-*.js` 108.09 kB);
   лог — `impl-build.log`.
2. `npm run test:unit` → **10 файлов: 9 прошли, 1 упал; 515 тестов прошли, 13 упали** — все 13
   в `tests/unit/companion.test.js`, причины — п. 3 «Отклонений» (изменённые требования);
   лог — `impl-unit.log`.
3. Проверка логики скриптом в scratchpad (не тест проекта): полнота поводов, отсутствие `{…}`
   и слов-упрёков, отсутствие дословных совпадений между персонажами — 0 проблем; QA 44 записи,
   8 быстрых; советов 30; шагов 6; ветки `companionEventForMark` (`milestone`, `firstDayClosed`,
   `allDone`, `markPast`, `unmark` прошлого дня, `milestone` от прошлого дня, `newRecord`).
4. `npx playwright test tests/e2e/habits.spec.js` → 26 passed.
5. `npx playwright test tests/e2e/design.spec.js tests/e2e/edit-best-streak.spec.js
   tests/e2e/reminders.spec.js tests/e2e/schedule-stats.spec.js` → 92 passed.
6. `npx playwright test tests/e2e/companion.spec.js` (прежний, для сведения) → 16 passed,
   11 failed (п. 3 «Отклонений»).
7. Смоук-скрипт Playwright (scratchpad, `vite preview` на 127.0.0.1:4179, управляемые часы,
   засеянные данные): виджет `position: fixed` виден; печать (через 100 мс 9 из 70 символов,
   затем текст полностью = `data-full-text`); клик по клетке сегодняшнего дня у последней
   карточки (серия 2→3) → `milestone` и 36 конфетти, через 2 с конфетти удалены; клик по
   прошлой клетке → `markPast`; «Удалить» последней карточки → `deleted`; добавление с HTML
   в названии → `added`, HTML выводится текстом; «×» скрывает облачко; у облачка
   `pointer-events: none`; у 💧 на карточке `background-image: url(".../emoji/1f4a7.svg")`,
   в плашке 1 картинка, текст «💧»; вопрос «Как ДОБАВИТЬ привычку???» → `answer`/`add`, поле
   очищено; `<img src=x onerror=…>` → `unknown`; быстрый вопрос → `mark`; правка → `edited`;
   🔔 → `reminderSet`; экскурсия: 6 шагов «Шаг 1…6 из 6» с подсветкой, «Назад» → шаг 5, Esc
   закрывает; знакомство (лягушка) → `intro`, через 9 с → `tourOffer` с «Покажи!», кнопка
   открывает экскурсию; следующая загрузка — `greeting`, затем `tip`; ещё одна загрузка в тот же
   день — совета нет; reduced motion — текст сразу, картинка SVG; ошибок страницы и внешних
   запросов нет. Скриншоты (рабочий стол 1280×720, телефон 380×700) просмотрены мной:
   виджет в углу, облачко с именем, «×», хвостиком и оранжевой рамкой лисы. Тёмная тема
   в браузере не просматривалась (контраст имени к `--surface` посчитан: светлая 5.37–7.05,
   тёмная 8.51–10.64).

Полный независимый прогон unit и e2e — за demo-test-runner; аудит и просмотр — за
координатором. Ничего не закоммичено.
