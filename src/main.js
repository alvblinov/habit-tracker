import './style.css';
import { toDateKey, fromDateKey, lastNDays } from './dates.js';
import {
  EMOJIS,
  DEFAULT_EMOJI,
  addHabit,
  toggleDay,
  removeHabit,
  isDone,
  getStreak,
  getBestStreak,
  getTodaySummary,
  normalizeName,
  updateHabit,
  MAX_NAME_LENGTH,
} from './habits.js';
import { STORAGE_KEY, loadState, saveState } from './storage.js';
import {
  INTERVALS,
  MAX_TIMES,
  DEFAULT_START,
  DEFAULT_END,
  normalizeReminder,
  setReminder,
  clearReminder,
  describeReminder,
  findDueReminders,
} from './reminders.js';
import { ensurePermission, showNotification } from './notify.js';
import { WEEKDAY_SHORT, WEEKDAY_FULL, normalizeDays, isScheduled, describeDays } from './schedule.js';
import { computeStats, DEFAULT_PERIOD } from './stats.js';
import { PALETTE, COLOR_LABELS, normalizeColor } from './colors.js';
import { THEME_KEY, normalizeTheme, resolveTheme, toggleTheme } from './theme.js';
import { staticEmojiUrl, animatedEmojiUrl } from './emoji-assets.js';
import {
  CHARACTERS,
  COMPANION_KEY,
  DEFAULT_CHARACTER,
  getCharacter,
  normalizeCompanionSettings,
  normalizeCompanionName,
  companionImage,
  pickPhrase,
  companionEventForMark,
  companionEventForAdd,
  accentOf,
} from './companion.js';
import { QUICK_QUESTIONS, normalizeQuestion, getAnswerEntry, answerText, answerQuestion } from './companion-qa.js';
import { tipForDay, shouldShowTip } from './companion-tips.js';
import { TOUR_STEPS, demoHabit, needsDemo } from './companion-tour.js';

const GRID_DAYS = 30;

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();
let state = loadState(storage);
// false, если последняя запись не удалась: тогда актуальна только копия в памяти,
// и перечитывать хранилище нельзя, иначе изменения пропадут.
let persisted = true;

const form = document.querySelector('#add-form');
const nameInput = document.querySelector('#habit-name');
const emojiOptions = document.querySelector('#emoji-options');
const summaryEl = document.querySelector('#today-summary');
const emptyEl = document.querySelector('#empty-state');
const listEl = document.querySelector('#habit-list');
const hintEl = document.querySelector('#reminder-hint');
const bannersEl = document.querySelector('#reminder-banners');
const statsToggle = document.querySelector('#stats-toggle');
const statsPanel = document.querySelector('#stats-panel');
const statsPeriodButtons = [...statsPanel.querySelectorAll('[data-testid="stats-period"]')];
const statsPercentEl = document.querySelector('#stats-percent');
const statsTotalEl = document.querySelector('#stats-total');
const statsBestWeekdayEl = document.querySelector('#stats-best-weekday');
const statsTable = document.querySelector('#stats-table');
const statsBody = document.querySelector('#stats-body');
const statsEmptyEl = document.querySelector('#stats-empty');
const ringEl = document.querySelector('[data-testid="progress-ring"]');
const ringValueEl = document.querySelector('#progress-ring-value');
const ringLabelEl = document.querySelector('#progress-ring-label');
const themeToggle = document.querySelector('#theme-toggle');

const CHECK_EVERY_MS = 15000;

// Открытая панель напоминания и её черновик живут в памяти модуля,
// поэтому перерисовка списка их не теряет.
let openReminderId = null;
let draft = null;

// Форма редактирования привычки и её черновик — тоже в памяти модуля.
let editingId = null;
let editDraft = null;

// Блок статистики: открыт/закрыт и выбранный период — в памяти модуля.
let statsOpen = false;
let statsPeriod = DEFAULT_PERIOD;

// Только что переключённая отметка (кнопка «Сегодня» или клетка) — для короткой анимации.
let popTarget = null;

// Эмодзи на карточках анимированы всегда (Noto *.webp, у 🏃 🧘 💊 — статичный *.svg).
// После отметки сегодняшнего дня — короткое «подпрыгивание»: id привычки в памяти модуля.
const EMOJI_BOUNCE_MS = 600;
let bounceHabitId = null;
let bounceTimer = null;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Запускается только при переходе сегодняшнего дня в «выполнено».
function startEmojiBounce(habitId) {
  if (prefersReducedMotion()) return;
  bounceHabitId = habitId;
  if (bounceTimer !== null) clearTimeout(bounceTimer);
  bounceTimer = setTimeout(() => {
    bounceTimer = null;
    bounceHabitId = null;
    clearEmojiBounce(habitId);
  }, EMOJI_BOUNCE_MS);
}

// Точечно снимает эффект с карточки без полной перерисовки (статистика и карточки не пересоздаются).
// bounceHabitId уже сброшен, поэтому следующий render() эффект не вернёт.
function clearEmojiBounce(habitId) {
  const plate = findCard(habitId)?.querySelector('.habit-emoji');
  if (!plate) return;
  delete plate.dataset.bounce;
  plate.querySelector('.emoji-img')?.classList.remove('is-bounce');
}

// Снятие сегодняшней отметки прекращает эффект этой привычки.
function stopEmojiBounce(habitId) {
  if (bounceHabitId !== habitId) return;
  bounceHabitId = null;
  if (bounceTimer !== null) clearTimeout(bounceTimer);
  bounceTimer = null;
}

// Сегодняшний день переключён: отметка — эффект, снятие — без эффекта.
function onTodayToggled(habitId, todayKey, next) {
  if (next === state) return;
  const updated = next.habits.find((h) => h.id === habitId);
  if (updated && isDone(updated, todayKey)) startEmojiBounce(habitId);
  else stopEmojiBounce(habitId);
}

// Картинка эмодзи на карточке: анимация Noto, если она есть и движение не уменьшено.
function cardEmojiUrl(char) {
  if (prefersReducedMotion()) return staticEmojiUrl(char);
  return animatedEmojiUrl(char) ?? staticEmojiUrl(char);
}

// Статичный SVG фоном у анимированной картинки карточки; у статичной фон не нужен.
function setStaticEmojiBackground(img, char) {
  const animated = img.getAttribute('src') !== staticEmojiUrl(char);
  // Путь строится из кодов символа (только hex), пользовательский текст сюда не попадает.
  img.style.backgroundImage = animated ? `url("${staticEmojiUrl(char)}")` : '';
  img.classList.toggle('has-static-bg', animated);
}

function createEmojiImg(src) {
  const img = document.createElement('img');
  img.className = 'emoji-img';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  img.decoding = 'async';
  img.src = src;
  return img;
}

// Эмодзи картинкой Noto: <img> скрыт от чтения с экрана, символ — в visually-hidden тексте,
// поэтому textContent элемента остаётся прежним символом. Символ — только через textContent.
// reuseImg — прежняя картинка карточки: при том же src она переносится, а не создаётся заново,
// чтобы анимация не начиналась сначала на каждой перерисовке.
function renderEmoji(char, { src = staticEmojiUrl(char), reuseImg = null } = {}) {
  const img =
    reuseImg !== null && reuseImg.getAttribute('src') === src ? reuseImg : createEmojiImg(src);

  const text = document.createElement('span');
  text.className = 'visually-hidden';
  text.textContent = char;

  const fragment = document.createDocumentFragment();
  fragment.append(img, text);
  return fragment;
}

// «Сегодня» — локальная дата, вычисляется заново на каждом рендере и действии.
function getToday() {
  return toDateKey(new Date());
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `h-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function formatDate(key) {
  return fromDateKey(key).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Ключ палитры для отрисовки: только значение из PALETTE, никогда не пользовательский ввод.
function colorOf(habit, index) {
  return normalizeColor(habit.color) ?? PALETTE[index % PALETTE.length];
}

function commit(nextState) {
  if (nextState === state) return;
  state = nextState;
  persisted = saveState(storage, state);
  render();
}

// Перечитать состояние из хранилища (его могла изменить другая вкладка).
function reloadState() {
  if (!storage || !persisted) return;
  state = loadState(storage);
}

// --- Форма: варианты эмодзи строятся один раз из EMOJIS ---

function buildEmojiOptions() {
  for (const emoji of EMOJIS) {
    const label = document.createElement('label');
    label.className = 'emoji-option';
    label.dataset.testid = 'emoji-option';
    label.dataset.emoji = emoji;
    label.title = emoji;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'emoji';
    input.value = emoji;
    input.className = 'visually-hidden';
    input.checked = emoji === DEFAULT_EMOJI;
    input.setAttribute('aria-label', emoji);

    const face = document.createElement('span');
    face.className = 'emoji-option-face';
    face.setAttribute('aria-hidden', 'true');
    face.append(renderEmoji(emoji));

    label.append(input, face);
    emojiOptions.append(label);
  }
}

function selectedEmoji() {
  const checked = form.querySelector('input[name="emoji"]:checked');
  return checked ? checked.value : DEFAULT_EMOJI;
}

function resetEmoji() {
  for (const input of form.querySelectorAll('input[name="emoji"]')) {
    input.checked = input.value === DEFAULT_EMOJI;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const next = addHabit(
    state,
    { name: nameInput.value, emoji: selectedEmoji() },
    { id: newId(), todayKey: getToday() },
  );
  if (next === state) {
    // Пустое название или только пробелы — ничего не добавляем.
    nameInput.value = '';
    nameInput.focus();
    return;
  }
  nameInput.value = '';
  resetEmoji();
  // Помощник хвалит добавление (первую привычку — отдельно).
  const said = companionEventForAdd({ before: state, after: next });
  commit(next);
  nameInput.focus();
  if (said) say(said.event, said.ctx);
});

// --- Отрисовка списка из состояния ---

function renderCard(habit, today, index, prevEmojiImgs = new Map()) {
  const li = document.createElement('li');
  li.className = 'habit-card';
  li.dataset.testid = 'habit-card';
  li.dataset.habitId = habit.id;
  li.dataset.color = colorOf(habit, index);

  const header = document.createElement('div');
  header.className = 'habit-header';

  const editing = editingId === habit.id && editDraft !== null;
  if (editing) {
    header.append(renderEditForm(habit));
  } else {
    const title = document.createElement('h2');
    title.className = 'habit-title';
    const emoji = document.createElement('span');
    emoji.className = 'habit-emoji';
    emoji.dataset.testid = 'habit-emoji';
    emoji.append(
      renderEmoji(habit.emoji, { src: cardEmojiUrl(habit.emoji), reuseImg: prevEmojiImgs.get(habit.id) ?? null }),
    );
    const bouncing = bounceHabitId === habit.id;
    if (bouncing) emoji.dataset.bounce = 'true';
    const emojiImg = emoji.querySelector('.emoji-img');
    emojiImg.classList.toggle('is-bounce', bouncing);
    // Под анимацией — статичная картинка того же эмодзи фоном самой картинки:
    // прозрачные кадры анимации (💧 и др.) не оставляют плашку пустой.
    setStaticEmojiBackground(emojiImg, habit.emoji);
    const name = document.createElement('span');
    name.className = 'habit-name';
    name.dataset.testid = 'habit-name';
    name.textContent = habit.name;
    title.append(emoji, name);
    const daysText = describeDays(habit.days);
    if (daysText) {
      const daysEl = document.createElement('span');
      daysEl.className = 'habit-days';
      daysEl.dataset.testid = 'habit-days';
      daysEl.textContent = daysText;
      title.append(daysEl);
    }
    header.append(title);
  }

  const streak = getStreak(habit, today);
  const streakEl = document.createElement('p');
  streakEl.className = 'habit-streak';
  streakEl.dataset.testid = 'habit-streak';
  streakEl.textContent = `🔥 ${streak} ${pluralDays(streak)} подряд`;

  const stats = document.createElement('div');
  stats.className = 'habit-stats';
  stats.append(streakEl);

  const best = getBestStreak(habit);
  if (best > 0) {
    const bestEl = document.createElement('p');
    bestEl.className = 'habit-best-streak';
    bestEl.dataset.testid = 'habit-best-streak';
    bestEl.textContent = best === streak ? '🏆 рекорд!' : `🏆 рекорд: ${best}`;
    stats.append(bestEl);
  }

  header.append(stats);

  const actions = document.createElement('div');
  actions.className = 'habit-actions';

  const doneToday = isDone(habit, today);
  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'toggle-today';
  todayBtn.dataset.testid = 'toggle-today';
  todayBtn.setAttribute('aria-pressed', String(doneToday));
  todayBtn.textContent = doneToday ? 'Сегодня ✓' : 'Сегодня';
  if (isPopTarget(habit.id, 'toggle-today')) todayBtn.classList.add('is-pop');
  todayBtn.addEventListener('click', () => {
    const now = getToday();
    popTarget = { habitId: habit.id, testid: 'toggle-today' };
    const next = toggleDay(state, habit.id, now, now);
    onTodayToggled(habit.id, now, next);
    // Повод для реплики помощника — по состоянию до и после отметки.
    const said = companionEventForMark({ before: state, after: next, today: now, habitId: habit.id });
    commit(next);
    if (said) say(said.event, said.ctx);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-habit';
  deleteBtn.dataset.testid = 'delete-habit';
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => {
    if (window.confirm(`Удалить привычку «${habit.name}»?`)) {
      const next = removeHabit(state, habit.id);
      if (next === state) return;
      commit(next);
      say('deleted', { habit: habit.name });
    }
  });

  const reminderBtn = document.createElement('button');
  reminderBtn.type = 'button';
  reminderBtn.className = 'reminder-toggle';
  if (habit.reminder) reminderBtn.classList.add('is-active');
  reminderBtn.dataset.testid = 'reminder-toggle';
  reminderBtn.textContent = '🔔';
  reminderBtn.title = 'Напоминание';
  reminderBtn.setAttribute('aria-label', 'Напоминание');
  reminderBtn.setAttribute('aria-expanded', String(openReminderId === habit.id));
  reminderBtn.addEventListener('click', () => {
    if (openReminderId === habit.id) closeReminderPanel();
    else openReminderPanel(habit);
  });

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-habit';
  editBtn.dataset.testid = 'edit-habit';
  editBtn.textContent = '✏️';
  editBtn.title = 'Изменить';
  editBtn.setAttribute('aria-label', 'Изменить привычку');
  editBtn.setAttribute('aria-expanded', String(editing));
  editBtn.addEventListener('click', () => {
    if (editingId === habit.id) closeEditForm();
    else openEditForm(habit);
  });

  actions.append(todayBtn, reminderBtn, editBtn, deleteBtn);

  const grid = document.createElement('div');
  grid.className = 'day-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `Последние ${GRID_DAYS} дней`);
  for (const key of lastNDays(today, GRID_DAYS)) {
    const done = isDone(habit, key);
    const scheduled = isScheduled(habit, key);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day-cell';
    if (done) cell.classList.add('is-done');
    if (key === today) cell.classList.add('is-today');
    // Выходной по расписанию — бледнее, но по-прежнему переключается кликом.
    if (!scheduled) cell.classList.add('is-off');
    cell.dataset.testid = 'day-cell';
    cell.dataset.date = key;
    cell.dataset.scheduled = String(scheduled);
    cell.setAttribute('aria-pressed', String(done));
    const label = `${formatDate(key)}${key === today ? ' (сегодня)' : ''}${scheduled ? '' : ' — выходной'}${done ? ' — выполнено' : ''}`;
    cell.title = label;
    cell.setAttribute('aria-label', label);
    if (isPopTarget(habit.id, 'day-cell', key)) cell.classList.add('is-pop');
    cell.addEventListener('click', () => {
      popTarget = { habitId: habit.id, testid: 'day-cell', date: key };
      const now = getToday();
      const next = toggleDay(state, habit.id, key, now);
      // Эффект — только при отметке сегодняшнего дня, не прошлых дней и не при снятии.
      if (key === now) onTodayToggled(habit.id, now, next);
      // Помощник реагирует на любую клетку: сегодня и прошлые дни.
      const said = companionEventForMark({ before: state, after: next, today: now, date: key, habitId: habit.id });
      commit(next);
      if (said) say(said.event, said.ctx);
    });
    grid.append(cell);
  }

  li.append(header);
  if (habit.reminder) {
    const label = document.createElement('p');
    label.className = 'reminder-label';
    label.dataset.testid = 'reminder-label';
    label.textContent = `🔔 ${describeReminder(habit.reminder)}`;
    li.append(label);
  }
  li.append(actions);
  if (openReminderId === habit.id && draft) li.append(renderReminderPanel(habit));
  li.append(grid);
  return li;
}

function isPopTarget(habitId, testid, date) {
  return popTarget !== null && popTarget.habitId === habitId && popTarget.testid === testid && popTarget.date === date;
}

// --- Редактирование названия и эмодзи ---

function findCard(habitId) {
  for (const card of listEl.querySelectorAll('[data-habit-id]')) {
    if (card.dataset.habitId === habitId) return card;
  }
  return null;
}

function focusInCard(habitId, testid) {
  findCard(habitId)?.querySelector(`[data-testid="${testid}"]`)?.focus();
}

function openEditForm(habit) {
  editingId = habit.id;
  const index = state.habits.findIndex((h) => h.id === habit.id);
  editDraft = {
    name: habit.name,
    emoji: habit.emoji,
    days: normalizeDays(habit.days),
    color: colorOf(habit, Math.max(index, 0)),
  };
  render();
  focusInCard(habit.id, 'edit-name-input');
}

function closeEditForm() {
  const id = editingId;
  editingId = null;
  editDraft = null;
  render();
  if (id !== null) focusInCard(id, 'edit-habit');
}

function saveEdit(habitId) {
  if (normalizeName(editDraft.name) === null) {
    // Пустое название или только пробелы — не сохраняем, форма остаётся открытой.
    editDraft.name = '';
    render();
    focusInCard(habitId, 'edit-name-input');
    return;
  }
  const next = updateHabit(state, habitId, editDraft);
  editingId = null;
  editDraft = null;
  if (next === state) {
    render();
    focusInCard(habitId, 'edit-habit');
    return;
  }
  commit(next);
  focusInCard(habitId, 'edit-habit');
  const updated = next.habits.find((h) => h.id === habitId);
  if (updated) say('edited', { habit: updated.name });
}

function renderEditForm(habit) {
  const editForm = document.createElement('form');
  editForm.className = 'edit-form';
  editForm.dataset.testid = 'edit-form';
  editForm.autocomplete = 'off';
  editForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEdit(habit.id);
  });
  editForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditForm();
    }
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input edit-name-input';
  input.dataset.testid = 'edit-name-input';
  input.maxLength = MAX_NAME_LENGTH;
  input.value = editDraft.name;
  input.setAttribute('aria-label', 'Название привычки');
  input.addEventListener('input', () => {
    editDraft.name = input.value;
  });

  const options = document.createElement('div');
  options.className = 'emoji-options';
  options.setAttribute('role', 'radiogroup');
  options.setAttribute('aria-label', 'Эмодзи');
  for (const emoji of EMOJIS) {
    const label = document.createElement('label');
    label.className = 'emoji-option';
    label.dataset.testid = 'edit-emoji-option';
    label.dataset.emoji = emoji;
    label.title = emoji;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `edit-emoji-${habit.id}`;
    radio.value = emoji;
    radio.className = 'visually-hidden';
    radio.checked = emoji === editDraft.emoji;
    radio.setAttribute('aria-label', emoji);
    radio.addEventListener('change', () => {
      if (radio.checked) editDraft.emoji = emoji;
    });

    const face = document.createElement('span');
    face.className = 'emoji-option-face';
    face.setAttribute('aria-hidden', 'true');
    face.append(renderEmoji(emoji));

    label.append(radio, face);
    options.append(label);
  }

  // Цвет привычки: 8 кружков палитры, отмечен текущий.
  const colors = document.createElement('div');
  colors.className = 'color-options';
  colors.setAttribute('role', 'radiogroup');
  colors.setAttribute('aria-label', 'Цвет');
  for (const key of PALETTE) {
    const label = document.createElement('label');
    label.className = 'color-option';
    label.dataset.testid = 'edit-color-option';
    label.dataset.color = key;
    label.title = COLOR_LABELS[key];

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `edit-color-${habit.id}`;
    radio.value = key;
    radio.className = 'visually-hidden';
    radio.checked = key === editDraft.color;
    radio.setAttribute('aria-label', COLOR_LABELS[key]);
    radio.addEventListener('change', () => {
      if (radio.checked) editDraft.color = key;
    });

    const swatch = document.createElement('span');
    swatch.className = 'color-option-swatch';
    swatch.setAttribute('aria-hidden', 'true');

    label.append(radio, swatch);
    colors.append(label);
  }

  // Расписание: 7 переключателей Пн…Вс; последний отмеченный день снять нельзя.
  const daysGroup = document.createElement('fieldset');
  daysGroup.className = 'edit-days';
  const daysLegend = document.createElement('legend');
  daysLegend.className = 'field-label';
  daysLegend.textContent = 'Дни недели';
  daysGroup.append(daysLegend);
  const dayBoxes = [];
  const syncDayBoxes = () => {
    for (const box of dayBoxes) box.disabled = box.checked && editDraft.days.length <= 1;
  };
  WEEKDAY_SHORT.forEach((short, index) => {
    const day = index + 1;
    const label = document.createElement('label');
    label.className = 'edit-day-option';
    label.title = WEEKDAY_FULL[index];

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.testid = 'edit-day';
    box.value = String(day);
    box.checked = editDraft.days.includes(day);
    box.addEventListener('change', () => {
      if (!box.checked && editDraft.days.length <= 1) {
        box.checked = true;
        return;
      }
      editDraft.days = box.checked
        ? normalizeDays([...editDraft.days, day])
        : editDraft.days.filter((d) => d !== day);
      syncDayBoxes();
    });

    const caption = document.createElement('span');
    caption.textContent = short.charAt(0).toUpperCase() + short.slice(1);

    label.append(box, caption);
    daysGroup.append(label);
    dayBoxes.push(box);
  });
  syncDayBoxes();

  const buttons = document.createElement('div');
  buttons.className = 'edit-buttons';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'edit-save';
  save.dataset.testid = 'edit-save';
  save.textContent = 'Сохранить';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'edit-cancel';
  cancel.dataset.testid = 'edit-cancel';
  cancel.textContent = 'Отмена';
  cancel.addEventListener('click', closeEditForm);

  buttons.append(save, cancel);
  editForm.append(input, options, colors, daysGroup, buttons);
  return editForm;
}

// --- Панель настроек напоминания ---

function draftFromReminder(reminder) {
  const r = normalizeReminder(reminder);
  return {
    mode: r ? r.mode : 'interval',
    intervalMin: r && r.mode === 'interval' ? r.intervalMin : 60,
    start: r && r.mode === 'interval' ? r.start : DEFAULT_START,
    end: r && r.mode === 'interval' ? r.end : DEFAULT_END,
    times: r && r.mode === 'times' ? [...r.times] : ['09:00'],
    error: '',
  };
}

function openReminderPanel(habit) {
  openReminderId = habit.id;
  draft = draftFromReminder(habit.reminder);
  render();
}

function closeReminderPanel() {
  openReminderId = null;
  draft = null;
  render();
}

// Следующий свободный «круглый» час после последнего времени в списке.
function nextFreeTime(times) {
  const filled = times.filter(Boolean).sort();
  const last = filled[filled.length - 1];
  let hour = last ? (Number(last.slice(0, 2)) + 1) % 24 : 9;
  for (let i = 0; i < 24; i += 1, hour = (hour + 1) % 24) {
    const value = `${String(hour).padStart(2, '0')}:00`;
    if (!times.includes(value)) return value;
  }
  return '';
}

function saveDraft(habitId) {
  const input = draft.mode === 'interval'
    ? { mode: 'interval', intervalMin: draft.intervalMin, start: draft.start, end: draft.end }
    : { mode: 'times', times: draft.times.filter((t) => t !== '') };

  if (input.mode === 'interval' && !(input.start && input.end && input.start < input.end)) {
    draft.error = 'Начало активных часов должно быть раньше конца.';
    render();
    return;
  }
  if (input.mode === 'times' && input.times.length === 0) {
    draft.error = 'Добавьте хотя бы одно время.';
    render();
    return;
  }
  const next = setReminder(state, habitId, input, Date.now());
  if (next === state) {
    draft.error = 'Проверьте настройки напоминания.';
    render();
    return;
  }
  // Разрешение на уведомления — по действию пользователя, при включении напоминания.
  ensurePermission();
  openReminderId = null;
  draft = null;
  commit(next);
  const habit = next.habits.find((h) => h.id === habitId);
  if (habit) say('reminderSet', { habit: habit.name });
}

function makeField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'reminder-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  label.append(caption, control);
  return label;
}

function makeTimeInput(value, testid, onInput) {
  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'reminder-time-input';
  input.dataset.testid = testid;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function renderReminderPanel(habit) {
  const panel = document.createElement('div');
  panel.className = 'reminder-panel';
  panel.dataset.testid = 'reminder-panel';

  // Режим
  const modes = document.createElement('fieldset');
  modes.className = 'reminder-modes';
  const legend = document.createElement('legend');
  legend.className = 'field-label';
  legend.textContent = 'Напоминание';
  modes.append(legend);
  for (const [value, text] of [['interval', 'Каждые N'], ['times', 'В определённое время']]) {
    const label = document.createElement('label');
    label.className = 'reminder-mode-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `reminder-mode-${habit.id}`;
    radio.value = value;
    radio.dataset.testid = 'reminder-mode';
    radio.checked = draft.mode === value;
    radio.addEventListener('change', () => {
      draft.mode = value;
      draft.error = '';
      render();
    });
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(radio, caption);
    modes.append(label);
  }
  panel.append(modes);

  if (draft.mode === 'interval') {
    const row = document.createElement('div');
    row.className = 'reminder-row';

    const select = document.createElement('select');
    select.dataset.testid = 'reminder-interval';
    const names = { 30: '30 минут', 60: '1 час', 120: '2 часа', 180: '3 часа' };
    for (const min of INTERVALS) {
      const option = document.createElement('option');
      option.value = String(min);
      option.textContent = names[min] ?? `${min} минут`;
      option.selected = min === draft.intervalMin;
      select.append(option);
    }
    select.addEventListener('change', () => {
      draft.intervalMin = Number(select.value);
    });

    const start = makeTimeInput(draft.start, 'reminder-start', (v) => {
      draft.start = v;
    });
    const end = makeTimeInput(draft.end, 'reminder-end', (v) => {
      draft.end = v;
    });

    row.append(makeField('Каждые', select), makeField('с', start), makeField('до', end));
    panel.append(row);
  } else {
    const list = document.createElement('div');
    list.className = 'reminder-times';
    draft.times.forEach((value, index) => {
      const item = document.createElement('div');
      item.className = 'reminder-time-item';
      const input = makeTimeInput(value, 'reminder-time', (v) => {
        draft.times[index] = v;
      });
      input.setAttribute('aria-label', `Время ${index + 1}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'reminder-remove-time';
      remove.dataset.testid = 'reminder-remove-time';
      remove.textContent = '×';
      remove.title = 'Удалить время';
      remove.setAttribute('aria-label', 'Удалить время');
      remove.disabled = draft.times.length <= 1;
      remove.addEventListener('click', () => {
        draft.times.splice(index, 1);
        render();
      });
      item.append(input, remove);
      list.append(item);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'reminder-add-time';
    add.dataset.testid = 'reminder-add-time';
    add.textContent = '+ время';
    add.disabled = draft.times.length >= MAX_TIMES;
    add.addEventListener('click', () => {
      if (draft.times.length >= MAX_TIMES) return;
      draft.times.push(nextFreeTime(draft.times));
      render();
    });
    list.append(add);
    panel.append(list);
  }

  if (draft.error) {
    const error = document.createElement('p');
    error.className = 'reminder-error';
    error.dataset.testid = 'reminder-error';
    error.setAttribute('role', 'alert');
    error.textContent = draft.error;
    panel.append(error);
  }

  const buttons = document.createElement('div');
  buttons.className = 'reminder-buttons';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'reminder-save';
  save.dataset.testid = 'reminder-save';
  save.textContent = 'Сохранить';
  save.addEventListener('click', () => saveDraft(habit.id));
  buttons.append(save);

  if (habit.reminder) {
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'reminder-off';
    off.dataset.testid = 'reminder-off';
    off.textContent = 'Выключить';
    off.addEventListener('click', () => {
      openReminderId = null;
      draft = null;
      const next = clearReminder(state, habit.id);
      if (next === state) render();
      else commit(next);
    });
    buttons.append(off);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'reminder-cancel';
  cancel.dataset.testid = 'reminder-cancel';
  cancel.textContent = 'Отмена';
  cancel.addEventListener('click', closeReminderPanel);
  buttons.append(cancel);

  panel.append(buttons);
  return panel;
}

// Фокус клавиатуры: список перестраивается целиком, поэтому запоминаем,
// какая кнопка была в фокусе (data-testid + id привычки + data-date), и возвращаем его.
function captureFocus() {
  const active = document.activeElement;
  if (!active || !listEl.contains(active)) return null;
  const card = active.closest('[data-habit-id]');
  if (!card || !active.dataset.testid) return null;
  return {
    testid: active.dataset.testid,
    habitId: card.dataset.habitId,
    date: active.dataset.date,
    // Переключатели режима напоминания и дни расписания различаются значением.
    value: active.type === 'radio' || active.type === 'checkbox' ? active.value : undefined,
    // Положение курсора в текстовом поле (форма редактирования).
    selection: active.type === 'text' ? [active.selectionStart, active.selectionEnd] : undefined,
  };
}

function restoreFocus(saved) {
  if (!saved) return;
  for (const card of listEl.querySelectorAll('[data-habit-id]')) {
    if (card.dataset.habitId !== saved.habitId) continue;
    for (const el of card.querySelectorAll(`[data-testid="${saved.testid}"]`)) {
      if (el.dataset.date === saved.date && (saved.value === undefined || el.value === saved.value)) {
        el.focus();
        if (saved.selection) el.setSelectionRange(...saved.selection);
        return;
      }
    }
    // Панель напоминания закрылась — вернуть фокус на кнопку 🔔 этой карточки.
    if (saved.testid.startsWith('reminder-')) {
      card.querySelector('[data-testid="reminder-toggle"]')?.focus();
    }
    // Форма редактирования закрылась — вернуть фокус на кнопку ✏️.
    if (saved.testid.startsWith('edit-')) {
      card.querySelector('[data-testid="edit-habit"]')?.focus();
    }
    return;
  }
}

// --- Статистика ---

function formatPercent(percent) {
  return percent === null ? '—' : `${percent}%`;
}

function parsePeriod(value) {
  return value === 'all' ? 'all' : Number(value);
}

function renderStatsRow(row, color) {
  const tr = document.createElement('tr');
  tr.className = 'stats-row';
  tr.dataset.testid = 'stats-row';
  tr.dataset.habitId = row.habitId;
  tr.dataset.color = color;

  const habitCell = document.createElement('td');
  habitCell.className = 'stats-habit';
  const emoji = document.createElement('span');
  emoji.className = 'stats-emoji';
  emoji.append(renderEmoji(row.emoji));
  const name = document.createElement('span');
  name.className = 'stats-name';
  name.textContent = row.name;
  habitCell.append(emoji, ' ', name);

  const percentCell = document.createElement('td');
  percentCell.className = 'stats-percent-cell';
  const percentText = document.createElement('span');
  percentText.className = 'stats-row-percent';
  percentText.textContent = formatPercent(row.percent);
  const meter = document.createElement('meter');
  meter.className = 'stats-meter';
  meter.min = 0;
  meter.max = 100;
  meter.value = row.percent ?? 0;
  meter.setAttribute('aria-hidden', 'true');
  percentCell.append(percentText, meter);

  const countCell = document.createElement('td');
  countCell.className = 'stats-count';
  countCell.textContent = `${row.done} из ${row.scheduled}`;

  const streakCell = document.createElement('td');
  streakCell.className = 'stats-streak';
  streakCell.textContent = `🔥 ${row.streak}`;

  const bestCell = document.createElement('td');
  bestCell.className = 'stats-best';
  bestCell.textContent = `🏆 ${row.best}`;

  tr.append(habitCell, percentCell, countCell, streakCell, bestCell);
  return tr;
}

function renderStats(today) {
  statsToggle.setAttribute('aria-expanded', String(statsOpen));
  statsPanel.hidden = !statsOpen;
  if (!statsOpen) return;

  for (const button of statsPeriodButtons) {
    button.setAttribute('aria-pressed', String(parsePeriod(button.dataset.period) === statsPeriod));
  }

  const stats = computeStats(state, today, statsPeriod);
  const bestDay = stats.bestWeekday === null ? '—' : WEEKDAY_FULL[stats.bestWeekday - 1];
  statsPercentEl.textContent = `Выполнено: ${formatPercent(stats.percent)}`;
  statsTotalEl.textContent = `Всего отметок: ${stats.totalMarks}`;
  statsBestWeekdayEl.textContent = `Лучший день: ${bestDay}`;

  const hasHabits = state.habits.length > 0;
  statsEmptyEl.hidden = hasHabits;
  statsTable.hidden = !hasHabits;
  const colorById = new Map(state.habits.map((habit, index) => [habit.id, colorOf(habit, index)]));
  statsBody.replaceChildren(
    ...stats.rows.map((row) => renderStatsRow(row, colorById.get(row.habitId) ?? PALETTE[0])),
  );
}

statsToggle.addEventListener('click', () => {
  statsOpen = !statsOpen;
  render();
});

for (const button of statsPeriodButtons) {
  button.addEventListener('click', () => {
    statsPeriod = parsePeriod(button.dataset.period);
    render();
  });
}

// --- Кольцо прогресса дня ---

function renderRing(done, total) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  ringEl.dataset.done = String(done);
  ringEl.dataset.total = String(total);
  ringEl.dataset.complete = String(total > 0 && done === total);
  ringValueEl.setAttribute('stroke-dasharray', `${percent} 100`);
  ringLabelEl.textContent = `${done}/${total}`;
}

// --- Тема оформления ---

const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readSavedTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

function currentTheme() {
  // Атрибут ставит inline-скрипт в <head> или кнопка; без него — системная тема.
  const attr = normalizeTheme(document.documentElement.getAttribute('data-theme'));
  return resolveTheme(attr, Boolean(systemDark && systemDark.matches));
}

function renderThemeToggle() {
  const dark = currentTheme() === 'dark';
  const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  themeToggle.textContent = dark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
  themeToggle.setAttribute('aria-pressed', String(dark));
}

themeToggle.addEventListener('click', () => {
  const next = toggleTheme(currentTheme());
  document.documentElement.setAttribute('data-theme', next);
  try {
    // Только свой ключ темы; данные привычек не трогаем.
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Не сохранилось — тема действует до перезагрузки.
  }
  renderThemeToggle();
});

if (systemDark) {
  const onSystemChange = () => {
    if (readSavedTheme() === null) renderThemeToggle();
  };
  if (typeof systemDark.addEventListener === 'function') systemDark.addEventListener('change', onSystemChange);
  else if (typeof systemDark.addListener === 'function') systemDark.addListener(onSystemChange);
}

function render() {
  const today = getToday();
  const savedFocus = captureFocus();

  const { done, total } = getTodaySummary(state, today);
  summaryEl.textContent = `Сегодня выполнено ${done} из ${total}`;
  renderRing(done, total);

  // Без привычек на время экскурсии — карточка-пример вместо подсказки пустого списка.
  const showDemo = tourOpen() && needsDemo(state);
  emptyEl.hidden = state.habits.length > 0 || showDemo;

  // Привычку с открытой панелью могли удалить (в т.ч. в другой вкладке).
  if (openReminderId !== null && !state.habits.some((h) => h.id === openReminderId)) {
    openReminderId = null;
    draft = null;
  }
  // Привычку с открытой формой редактирования тоже могли удалить.
  if (editingId !== null && !state.habits.some((h) => h.id === editingId)) {
    editingId = null;
    editDraft = null;
  }
  hintEl.hidden = !(openReminderId !== null || state.habits.some((h) => h.reminder));

  // Картинки эмодзи прежних карточек — для переиспользования (анимация не перезапускается).
  const prevEmojiImgs = new Map();
  for (const card of listEl.querySelectorAll('.habit-card')) {
    const img = card.querySelector('.habit-emoji .emoji-img');
    if (img) prevEmojiImgs.set(card.dataset.habitId, img);
  }
  listEl.replaceChildren(
    ...state.habits.map((habit, index) => renderCard(habit, today, index, prevEmojiImgs)),
  );
  if (showDemo) listEl.append(renderDemoCard(today, prevEmojiImgs));
  // Анимация проигрывается один раз — при следующей перерисовке её уже нет.
  popTarget = null;
  restoreFocus(savedFocus);
  renderStats(today);
  renderCompanion();
  // Список перестроен — подсветка экскурсии переезжает на новые элементы.
  if (tourOpen()) schedulePositionTour();
}

// Карточка-пример для экскурсии без привычек: та же разметка, что у настоящей карточки,
// но неактивная (inert), скрытая от читалок и с меткой «Пример». В состояние не попадает.
function renderDemoCard(today, prevEmojiImgs) {
  const li = renderCard(demoHabit(today), today, 0, prevEmojiImgs);
  li.dataset.testid = 'tour-demo-card';
  li.dataset.demo = 'true';
  li.dataset.color = PALETTE[0];
  li.inert = true;
  li.setAttribute('inert', '');
  li.setAttribute('aria-hidden', 'true');
  li.classList.add('is-demo');
  const label = document.createElement('p');
  label.className = 'tour-demo-label';
  label.dataset.testid = 'tour-demo-label';
  label.textContent = 'Пример';
  li.prepend(label);
  // Запасная защита на случай браузера без inert: клики и клавиши не доходят до кнопок.
  const block = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ['click', 'keydown', 'pointerdown']) li.addEventListener(type, block, true);
  return li;
}

// --- Помощник: плавающий виджет в углу, облачко, меню, знакомство, экскурсия ---
// Настройки — в своём ключе habit-tracker:companion; данные привычек не меняются.
// Помощник обновляется точечно (renderCompanion), его таймеры (печать, скрытие облачка,
// подпрыгивание, конфетти) список привычек не перерисовывают.

const BUBBLE_MIN_MS = 6000;
const BUBBLE_AFTER_TYPING_MS = 4000;
const TYPE_MS = 25;
const TALK_MS = 700;
const CONFETTI_COUNT = 36;
const CONFETTI_MS = 1500;

const companionWrap = document.querySelector('#companion-wrap');
const companionBtn = document.querySelector('#companion');
const companionImg = document.querySelector('#companion-img');
const companionBubble = document.querySelector('#companion-bubble');
const companionBubbleName = document.querySelector('#companion-bubble-name');
const companionBubbleText = document.querySelector('#companion-bubble-text');
const companionBubbleClose = document.querySelector('#companion-bubble-close');
const companionBubbleActions = document.querySelector('#companion-bubble-actions');
const companionConfetti = document.querySelector('#companion-confetti');
const companionMenu = document.querySelector('#companion-menu');
const companionAskForm = document.querySelector('#companion-ask-form');
const companionAskInput = document.querySelector('#companion-ask-input');
const companionQuick = document.querySelector('#companion-quick');
const companionTourStartBtn = document.querySelector('#companion-tour-start');
const companionChangeBtn = document.querySelector('#companion-change');
const companionPicker = document.querySelector('#companion-picker');
const companionRenameBtn = document.querySelector('#companion-rename');
const companionRenameForm = document.querySelector('#companion-rename-form');
const companionNameInput = document.querySelector('#companion-name-input');
const companionRenameError = document.querySelector('#companion-rename-error');
const companionOffBtn = document.querySelector('#companion-off');
const companionOnBtn = document.querySelector('#companion-on');
const companionIntro = document.querySelector('#companion-intro');
const companionIntroTitle = document.querySelector('#companion-intro-title');
const companionOptions = document.querySelector('#companion-options');
const companionIntroSkip = document.querySelector('#companion-intro-skip');
const tourEl = document.querySelector('#companion-tour');
const tourSpot = document.querySelector('#companion-tour-spot');
const tourStepEl = document.querySelector('#companion-tour-step');
const tourCountEl = document.querySelector('#companion-tour-count');
const tourTitleEl = document.querySelector('#companion-tour-title');
const tourTextEl = document.querySelector('#companion-tour-text');
const tourPrevBtn = document.querySelector('#companion-tour-prev');
const tourNextBtn = document.querySelector('#companion-tour-next');
const tourCloseBtn = document.querySelector('#companion-tour-close');

let companion = loadCompanion();
let companionMenuOpen = false;
let companionPickerOpen = false;
let companionRenameOpen = false;
let bubbleTimer = null;
let typingTimer = null;
let talkTimer = null;
let confettiTimer = null;
// Отложенные реплики (предложение экскурсии, совет дня): показываются,
// когда текущее облачко скроется само или по «закрыть».
let bubbleQueue = [];
// Экскурсия: номер шага (-1 — закрыта) и запрос кадра на перестановку подсветки.
let tourIndex = -1;
let tourFrame = null;
// Заголовок знакомства выбирается при открытии страницы: были ли уже привычки
// (тогда «У нас новенький…»); добавление привычки до выбора его не меняет.
const introForReturningUser = state.habits.length > 0;

function loadCompanion() {
  try {
    return normalizeCompanionSettings(window.localStorage.getItem(COMPANION_KEY));
  } catch {
    return normalizeCompanionSettings(null);
  }
}

function saveCompanion(next) {
  companion = normalizeCompanionSettings(next);
  try {
    // Только свой ключ помощника.
    window.localStorage.setItem(COMPANION_KEY, JSON.stringify(companion));
  } catch {
    // Не сохранилось — настройки действуют до перезагрузки.
  }
}

function companionActive() {
  return companion.enabled && companion.introduced;
}

// Перезапуск CSS-анимации: снять класс, принудительный пересчёт, вернуть класс.
function restartClass(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function clearBubbleTimers() {
  if (bubbleTimer !== null) clearTimeout(bubbleTimer);
  if (typingTimer !== null) clearTimeout(typingTimer);
  bubbleTimer = null;
  typingTimer = null;
}

// Скрыть облачко без показа отложенных реплик.
function hideBubble() {
  clearBubbleTimers();
  companionBubble.hidden = true;
  companionBubble.setAttribute('aria-busy', 'false');
  companionBubble.classList.remove('is-appearing');
  companionBubbleActions.replaceChildren();
  companionBubbleActions.hidden = true;
}

// Облачко отработало (само или по «закрыть») — показать следующую отложенную реплику.
function finishBubble() {
  hideBubble();
  const next = bubbleQueue.shift();
  if (next) next();
}

function queueBubble(show) {
  if (!bubbleQueue.includes(show)) bubbleQueue.push(show);
}

// Персонаж коротко подпрыгивает в момент реплики.
function talk() {
  if (prefersReducedMotion()) return;
  restartClass(companionBtn, 'is-talking');
  if (talkTimer !== null) clearTimeout(talkTimer);
  talkTimer = setTimeout(() => {
    talkTimer = null;
    companionBtn.classList.remove('is-talking');
  }, TALK_MS);
}

// Конфетти на вехе серии: кусочки CSS-анимации в цветах палитры, удаляются после.
function launchConfetti() {
  if (prefersReducedMotion()) return;
  const pieces = [];
  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.background = `var(--c-${PALETTE[i % PALETTE.length]})`;
    piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 260)}px`);
    piece.style.setProperty('--y', `${Math.round(-90 - Math.random() * 160)}px`);
    piece.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 720)}deg`);
    piece.style.setProperty('--delay', `${Math.round(Math.random() * 200)}ms`);
    pieces.push(piece);
  }
  companionConfetti.replaceChildren(...pieces);
  companionConfetti.dataset.active = 'true';
  if (confettiTimer !== null) clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => {
    confettiTimer = null;
    companionConfetti.replaceChildren();
    delete companionConfetti.dataset.active;
  }, CONFETTI_MS + 200);
}

/**
 * На узком экране текст реплики ограничен тремя строками с прокруткой внутри (CSS).
 * Если текст не помещается — data-scroll="true": прокрутка пальцем разрешена; иначе облачко
 * клики не перехватывает. Полный текст (с ненапечатанным остатком) задаёт высоту сразу.
 */
function markBubbleScroll() {
  companionBubbleText.scrollTop = 0;
  const overflow = companionBubbleText.scrollHeight > companionBubbleText.clientHeight + 1;
  companionBubble.dataset.scroll = overflow ? 'true' : 'false';
}

// Во время печати длинного текста прокрутка идёт следом, чтобы новые буквы были видны.
function followTyping(part) {
  if (companionBubble.dataset.scroll !== 'true') return;
  const max = companionBubbleText.scrollHeight - companionBubbleText.clientHeight;
  // Прокрутка целыми строками, чтобы верхняя строка не обрезалась посередине.
  const line = parseFloat(getComputedStyle(companionBubbleText).lineHeight) || 1;
  companionBubbleText.scrollTop = Math.min(max, Math.round((max * part) / line) * line);
}

/**
 * Показать текст в облачке. Текст — только через textContent: печатается по буквам
 * (наращивание textContent), полный текст сразу в data-full-text и aria-label;
 * при «уменьшить движение» — сразу целиком и без анимаций.
 * Новая реплика заменяет прежнюю; скрытие — через max(6 с, печать + 4 с).
 * action — кнопка в облачке ({ label, testid, onClick }).
 */
function showBubble(text, { event, qa, action } = {}) {
  if (!companionActive() || !text) return;
  clearBubbleTimers();

  companionBubble.dataset.event = event;
  if (qa) companionBubble.dataset.qa = qa;
  else delete companionBubble.dataset.qa;
  companionBubbleName.textContent = companion.name;
  companionBubbleText.dataset.fullText = text;
  companionBubbleText.setAttribute('aria-label', text);

  companionBubbleActions.replaceChildren();
  companionBubbleActions.hidden = !action;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'companion-bubble-action';
    button.dataset.testid = action.testid;
    button.textContent = action.label;
    button.addEventListener('click', () => {
      hideBubble();
      action.onClick();
    });
    companionBubbleActions.append(button);
  }

  companionBubble.hidden = false;
  const chars = [...text];
  const reduced = prefersReducedMotion();
  if (reduced) {
    companionBubble.classList.remove('is-appearing');
    companionBubbleText.textContent = text;
    companionBubbleText.dataset.rest = '';
    companionBubble.dataset.typing = 'false';
    companionBubble.setAttribute('aria-busy', 'false');
    markBubbleScroll();
  } else {
    restartClass(companionBubble, 'is-appearing');
    companionBubbleText.textContent = '';
    // Ненапечатанный остаток — невидимым через CSS (::after), облачко сразу полного размера.
    companionBubbleText.dataset.rest = text;
    companionBubble.dataset.typing = 'true';
    // Пока текст печатается, экранный диктор ждёт (aria-busy) и читает фразу один раз.
    companionBubble.setAttribute('aria-busy', 'true');
    markBubbleScroll();
    let shown = 0;
    const typeNext = () => {
      shown += 1;
      companionBubbleText.textContent += chars[shown - 1];
      companionBubbleText.dataset.rest = chars.slice(shown).join('');
      followTyping(shown / chars.length);
      if (shown < chars.length) {
        typingTimer = setTimeout(typeNext, TYPE_MS);
      } else {
        typingTimer = null;
        companionBubble.dataset.typing = 'false';
        companionBubble.setAttribute('aria-busy', 'false');
      }
    };
    typingTimer = setTimeout(typeNext, TYPE_MS);
    talk();
  }

  const typingMs = reduced ? 0 : chars.length * TYPE_MS;
  bubbleTimer = setTimeout(() => {
    bubbleTimer = null;
    finishBubble();
  }, Math.max(BUBBLE_MIN_MS, typingMs + BUBBLE_AFTER_TYPING_MS));
}

// Реплика персонажа на повод; на вехе серии — ещё и конфетти.
function say(event, ctx = {}, options = {}) {
  if (!companionActive()) return;
  const text = pickPhrase(
    event,
    { ...ctx, name: companion.name, hour: new Date().getHours() },
    companion.character,
    Math.random,
  );
  if (!text) return;
  showBubble(text, { ...options, event });
  if (event === 'milestone') launchConfetti();
}

// Приветствие со сводкой дня; без привычек — предложение добавить первую.
function greet() {
  if (state.habits.length === 0) {
    say('empty');
    return;
  }
  const { done, total } = getTodaySummary(state, getToday());
  say('greeting', { done, total });
}

// Совет дня — не чаще раза в день (по локальной дате), только у включённого помощника.
function showTip() {
  const today = getToday();
  if (!companionActive() || !shouldShowTip(companion, today)) return;
  saveCompanion({ ...companion, lastTipDate: today });
  const intro = pickPhrase('tipIntro', { name: companion.name }, companion.character, Math.random);
  showBubble(`${intro} ${tipForDay(today)}`, { event: 'tip' });
}

// Совет дня после текущей реплики (или сразу, если облачко скрыто).
function scheduleTip() {
  if (!companionActive() || !shouldShowTip(companion, getToday())) return;
  if (companionBubble.hidden) showTip();
  else queueBubble(showTip);
}

// Предложение экскурсии — один раз, после знакомства.
function offerTour() {
  if (!companionActive() || companion.tourOffered) return;
  saveCompanion({ ...companion, tourOffered: true });
  say('tourOffer', {}, { action: { label: 'Покажи!', testid: 'companion-tour-accept', onClick: startTour } });
}

function createCompanionImg(id) {
  const img = document.createElement('img');
  img.className = 'companion-option-img';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  img.decoding = 'async';
  // В карточке знакомства и в меню — статичные SVG; анимирован только сам помощник.
  img.src = companionImage(id, { animated: false });
  return img;
}

// Варианты персонажей и кнопки частых вопросов строятся один раз.
function buildCompanionOptions() {
  for (const character of CHARACTERS) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'companion-option';
    option.dataset.testid = 'companion-option';
    option.dataset.character = character.id;
    const name = document.createElement('span');
    name.className = 'companion-option-name';
    name.textContent = character.defaultName;
    const label = document.createElement('span');
    label.className = 'companion-option-label';
    label.textContent = character.label;
    option.append(createCompanionImg(character.id), name, label);
    option.addEventListener('click', () => finishIntro(character.id));
    companionOptions.append(option);

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'companion-pick';
    pick.dataset.testid = 'companion-pick';
    pick.dataset.character = character.id;
    pick.title = `${character.label} ${character.defaultName}`;
    pick.setAttribute('aria-label', `${character.label} ${character.defaultName}`);
    pick.append(createCompanionImg(character.id));
    pick.addEventListener('click', () => changeCharacter(character.id));
    companionPicker.append(pick);
  }

  for (const question of QUICK_QUESTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'companion-quick-question';
    button.dataset.testid = 'companion-quick-question';
    button.dataset.qa = question.id;
    button.textContent = question.label;
    button.addEventListener('click', () => {
      const entry = getAnswerEntry(question.id);
      if (entry) showBubble(answerText(entry, companion.character), { event: 'answer', qa: entry.id });
    });
    companionQuick.append(button);
  }
}

function renderCompanion() {
  // Карточка знакомства — пока знакомство не пройдено.
  companionIntro.hidden = companion.introduced;
  if (!companion.introduced) {
    companionIntroTitle.textContent =
      introForReturningUser
        ? 'У нас новенький — выбери себе помощника!'
        : 'Привет! Я буду помогать тебе с привычками. Кого выберешь?';
  }

  const active = companionActive();
  companionWrap.hidden = !active;
  // Нижний отступ страницы под виджет — только когда помощник на экране.
  document.body.classList.toggle('has-companion', active);
  companionOnBtn.hidden = !(companion.introduced && !companion.enabled);
  if (!active) {
    companionMenuOpen = false;
    bubbleQueue = [];
    hideBubble();
    closeTour({ focus: false });
  }

  const character = getCharacter(companion.character);
  const accent = accentOf(character.id);
  companionWrap.dataset.accent = accent;
  companionBubble.dataset.accent = accent;
  companionBubbleName.textContent = companion.name;
  // При «уменьшить движение» — статичная картинка.
  const src = companionImage(character.id, { animated: !prefersReducedMotion() });
  if (companionImg.getAttribute('src') !== src) companionImg.src = src;
  const label = `Помощник ${companion.name}`;
  companionBtn.setAttribute('aria-label', label);
  companionBtn.title = label;
  companionBtn.dataset.character = character.id;

  if (!companionMenuOpen) {
    companionPickerOpen = false;
    companionRenameOpen = false;
  }
  companionBtn.setAttribute('aria-expanded', String(companionMenuOpen));
  companionMenu.hidden = !companionMenuOpen;
  companionChangeBtn.setAttribute('aria-expanded', String(companionPickerOpen));
  companionPicker.hidden = !companionPickerOpen;
  for (const pick of companionPicker.children) {
    pick.setAttribute('aria-pressed', String(pick.dataset.character === character.id));
  }
  companionRenameBtn.setAttribute('aria-expanded', String(companionRenameOpen));
  companionRenameForm.hidden = !companionRenameOpen;
  if (!companionRenameOpen) companionRenameError.hidden = true;
}

function focusCompanion() {
  if (!companionWrap.hidden) companionBtn.focus();
}

function finishIntro(characterId) {
  const focusWasInside = companionIntro.contains(document.activeElement);
  const character = getCharacter(characterId);
  saveCompanion({ ...companion, character: character.id, name: character.defaultName, enabled: true, introduced: true });
  renderCompanion();
  if (focusWasInside) focusCompanion();
  say('intro');
  // Сразу после знакомства — предложение экскурсии (один раз).
  if (!companion.tourOffered) queueBubble(offerTour);
}

companionIntroSkip.addEventListener('click', () => finishIntro(DEFAULT_CHARACTER));

function openCompanionMenu() {
  companionMenuOpen = true;
  companionPickerOpen = false;
  companionRenameOpen = false;
  renderCompanion();
}

function closeCompanionMenu({ focus = false } = {}) {
  if (!companionMenuOpen) return;
  companionMenuOpen = false;
  renderCompanion();
  if (focus) focusCompanion();
}

companionBtn.addEventListener('click', () => {
  if (companionMenuOpen) {
    closeCompanionMenu();
    return;
  }
  openCompanionMenu();
  say('poke');
});

companionBubbleClose.addEventListener('click', finishBubble);

// «Спроси меня»: вопрос только сравнивается с ключевыми словами и сразу стирается из поля.
companionAskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = companionAskInput.value;
  companionAskInput.value = '';
  if (normalizeQuestion(question) === '') {
    companionAskInput.focus();
    return;
  }
  const answer = answerQuestion(question, companion.character);
  showBubble(answer.text, { event: 'answer', qa: answer.id });
  companionAskInput.focus();
});

companionTourStartBtn.addEventListener('click', () => {
  closeCompanionMenu();
  startTour();
});

companionChangeBtn.addEventListener('click', () => {
  companionPickerOpen = !companionPickerOpen;
  companionRenameOpen = false;
  renderCompanion();
});

function changeCharacter(characterId) {
  const character = getCharacter(characterId);
  // Новый персонаж — со своим именем; тот же персонаж сохраняет текущее имя.
  const name = character.id === companion.character ? companion.name : character.defaultName;
  saveCompanion({ ...companion, character: character.id, name });
  companionMenuOpen = false;
  renderCompanion();
  focusCompanion();
  say('intro');
}

companionRenameBtn.addEventListener('click', () => {
  companionRenameOpen = !companionRenameOpen;
  companionPickerOpen = false;
  renderCompanion();
  if (companionRenameOpen) {
    companionNameInput.value = companion.name;
    companionNameInput.focus();
    companionNameInput.select();
  }
});

companionRenameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = normalizeCompanionName(companionNameInput.value);
  if (name === null) {
    // Пустое имя или только пробелы — не сохраняем, форма остаётся открытой.
    companionRenameError.hidden = false;
    companionNameInput.focus();
    return;
  }
  saveCompanion({ ...companion, name });
  companionMenuOpen = false;
  renderCompanion();
  focusCompanion();
  say('intro');
});

companionOffBtn.addEventListener('click', () => {
  saveCompanion({ ...companion, enabled: false });
  companionMenuOpen = false;
  renderCompanion();
  companionOnBtn.focus();
});

companionOnBtn.addEventListener('click', () => {
  saveCompanion({ ...companion, enabled: true });
  renderCompanion();
  focusCompanion();
  greet();
});

// --- Экскурсия: 6 шагов с подсветкой ---


function tourOpen() {
  return tourIndex >= 0;
}

// Первая видимая цель шага или null: сначала в настоящих карточках, затем в примере.
function tourTarget(step) {
  let demo = null;
  for (const el of document.querySelectorAll(step.target)) {
    if (el.getClientRects().length === 0) continue;
    if (!el.closest('[data-demo="true"]')) return el;
    if (!demo) demo = el;
  }
  return demo;
}

// Цель целиком в окне (если выше окна — хотя бы её верх).
function inViewport(el) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.height >= vh) return r.top >= -1 && r.top < vh;
  return r.top >= -1 && r.bottom <= vh + 1;
}

// AC-57: плавная прокрутка может не дойти до цели (её прерывает следующая прокрутка или
// перестройка страницы). По окончании прокрутки (scrollend, запасной таймер) — проверить
// итоговую позицию; не в окне — докрутить без анимации и пересчитать подсветку.
const TOUR_SCROLL_CHECK_MS = 1200;
let tourScrollToken = 0;
let tourScrollCleanup = null;

function stopTourScrollCheck() {
  tourScrollToken += 1;
  if (tourScrollCleanup) tourScrollCleanup();
  tourScrollCleanup = null;
}

function scrollToTourTarget(target) {
  stopTourScrollCheck();
  if (prefersReducedMotion()) {
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    return;
  }
  const token = tourScrollToken;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  let timer = null;
  const onEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 50);
  };
  const check = () => {
    if (token !== tourScrollToken) return;
    stopTourScrollCheck();
    if (!tourOpen()) return;
    // Цель берётся заново: render() во время прокрутки мог пересоздать карточки и пример.
    const current = tourTarget(TOUR_STEPS[tourIndex]);
    if (!current) return;
    if (!inViewport(current)) current.scrollIntoView({ block: 'center', behavior: 'auto' });
    positionTour();
  };
  window.addEventListener('scrollend', onEnd, true);
  timer = setTimeout(check, TOUR_SCROLL_CHECK_MS);
  tourScrollCleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('scrollend', onEnd, true);
  };
}

function positionTour() {
  tourFrame = null;
  if (!tourOpen()) return;
  const target = tourTarget(TOUR_STEPS[tourIndex]);
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const card = tourStepEl.getBoundingClientRect();
  if (!target) {
    tourSpot.hidden = true;
    tourEl.dataset.hasTarget = 'false';
    tourStepEl.style.top = `${Math.max(margin, (vh - card.height) / 2)}px`;
    tourStepEl.style.left = `${Math.max(margin, (vw - card.width) / 2)}px`;
    return;
  }
  const pad = 6;
  const r = target.getBoundingClientRect();
  tourSpot.hidden = false;
  tourEl.dataset.hasTarget = 'true';
  tourSpot.style.top = `${r.top - pad}px`;
  tourSpot.style.left = `${r.left - pad}px`;
  tourSpot.style.width = `${r.width + pad * 2}px`;
  tourSpot.style.height = `${r.height + pad * 2}px`;
  // Карточка — под целью, если не помещается — над ней, иначе у нижнего края.
  let top = r.bottom + pad + 10;
  if (top + card.height > vh - margin) top = r.top - pad - 10 - card.height;
  if (top < margin) top = Math.max(margin, vh - card.height - margin);
  const left = Math.min(Math.max(margin, r.left + r.width / 2 - card.width / 2), Math.max(margin, vw - card.width - margin));
  tourStepEl.style.top = `${top}px`;
  tourStepEl.style.left = `${left}px`;
}

function schedulePositionTour() {
  if (tourFrame === null) tourFrame = requestAnimationFrame(positionTour);
}

function renderTourStep() {
  const step = TOUR_STEPS[tourIndex];
  const target = tourTarget(step);
  tourCountEl.textContent = `Шаг ${tourIndex + 1} из ${TOUR_STEPS.length}`;
  tourTitleEl.textContent = step.title;
  tourTextEl.textContent = target || !step.missingText ? step.text : step.missingText;
  tourStepEl.dataset.step = String(tourIndex + 1);
  tourStepEl.dataset.stepId = step.id;
  tourEl.dataset.target = step.target;
  tourPrevBtn.disabled = tourIndex === 0;
  tourNextBtn.textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Готово' : 'Далее';
  if (target) scrollToTourTarget(target);
  else stopTourScrollCheck();
  positionTour();
}

function startTour() {
  if (!companionActive()) return;
  companionMenuOpen = false;
  renderCompanion();
  hideBubble();
  tourIndex = 0;
  tourEl.hidden = false;
  window.addEventListener('scroll', schedulePositionTour, true);
  window.addEventListener('resize', schedulePositionTour);
  // Без привычек — показать карточку-пример до первого шага.
  if (needsDemo(state)) render();
  renderTourStep();
  tourNextBtn.focus();
}

function closeTour({ focus = true } = {}) {
  if (!tourOpen()) return;
  tourIndex = -1;
  tourEl.hidden = true;
  window.removeEventListener('scroll', schedulePositionTour, true);
  window.removeEventListener('resize', schedulePositionTour);
  if (tourFrame !== null) cancelAnimationFrame(tourFrame);
  tourFrame = null;
  stopTourScrollCheck();
  // Убрать карточку-пример и вернуть обычный вид списка.
  if (listEl.querySelector('[data-demo="true"]')) render();
  if (focus) focusCompanion();
}

tourPrevBtn.addEventListener('click', () => {
  if (tourIndex <= 0) return;
  tourIndex -= 1;
  renderTourStep();
});

tourNextBtn.addEventListener('click', () => {
  if (tourIndex >= TOUR_STEPS.length - 1) {
    closeTour();
    return;
  }
  tourIndex += 1;
  renderTourStep();
  // Фокус остаётся на «Далее», даже если кнопка «Назад» стала доступной.
  tourNextBtn.focus();
});

tourCloseBtn.addEventListener('click', () => closeTour());

// Esc закрывает экскурсию, иначе меню; клик вне помощника закрывает меню.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (tourOpen()) {
    event.preventDefault();
    closeTour();
    return;
  }
  if (companionMenuOpen) closeCompanionMenu({ focus: true });
});
document.addEventListener('pointerdown', (event) => {
  if (companionMenuOpen && !companionWrap.contains(event.target)) closeCompanionMenu();
});

// Настройка «уменьшить движение» изменилась — сменить картинку помощника.
if (typeof window.matchMedia === 'function') {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (typeof motion.addEventListener === 'function') motion.addEventListener('change', renderCompanion);
  else if (typeof motion.addListener === 'function') motion.addListener(renderCompanion);
}

// Другая вкладка изменила настройки помощника.
window.addEventListener('storage', (event) => {
  if (event.key !== COMPANION_KEY) return;
  companion = loadCompanion();
  renderCompanion();
});

buildEmojiOptions();
buildCompanionOptions();
renderThemeToggle();
render();
// Реплика при открытии — только после знакомства: приветствие со сводкой дня или «добавь первую»,
// затем — совет дня, если сегодня его ещё не было.
greet();
scheduleTip();

// Другая вкладка изменила данные — перечитать их, чтобы не затереть устаревшей копией.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  reloadState();
  render();
});

// При возврате во вкладку: перечитать данные и пересчитать «сегодня»
// (вкладка могла быть открыта через полночь).
function refresh() {
  reloadState();
  render();
  checkReminders();
  // Вкладка могла пережить полночь — совет нового дня.
  scheduleTip();
}
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

// --- Напоминания: планировщик и плашки ---

// Плашки (когда системные уведомления запрещены/недоступны): не более одной на привычку.
let banners = [];

function renderBanners() {
  bannersEl.replaceChildren(
    ...banners.map((banner) => {
      const el = document.createElement('div');
      el.className = 'reminder-banner';
      el.dataset.testid = 'reminder-banner';
      el.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.className = 'reminder-banner-text';
      text.textContent = banner.text;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'reminder-banner-close';
      close.dataset.testid = 'reminder-banner-close';
      close.textContent = 'Понятно';
      close.addEventListener('click', () => {
        banners = banners.filter((b) => b !== banner);
        renderBanners();
      });
      el.append(text, close);
      return el;
    }),
  );
}

function notifyHabit(habit, at) {
  const title = `${habit.emoji} Пора: ${habit.name}`;
  if (showNotification({ title, tag: `${habit.id}-${at}` })) return;
  banners = [...banners.filter((b) => b.habitId !== habit.id), { habitId: habit.id, text: title }];
  renderBanners();
}

// Время считается по часам (Date.now()), а не по числу тиков таймера.
// Отсчёт с момента загрузки страницы: время до открытия не даёт уведомлений (AC-14).
let lastCheck = Date.now();

function checkReminders() {
  const now = Date.now();
  if (now <= lastCheck) {
    // Часы перевели назад — начинаем отсчёт заново.
    lastCheck = now;
    return;
  }
  const due = findDueReminders(state, lastCheck, now);
  lastCheck = now;
  for (const { habitId, at } of due) {
    const habit = state.habits.find((h) => h.id === habitId);
    if (habit) notifyHabit(habit, at);
  }
}

setInterval(checkReminders, CHECK_EVERY_MS);
