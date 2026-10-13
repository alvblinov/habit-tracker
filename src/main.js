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
    face.textContent = emoji;

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
  commit(next);
  nameInput.focus();
});

// --- Отрисовка списка из состояния ---

function renderCard(habit, today) {
  const li = document.createElement('li');
  li.className = 'habit-card';
  li.dataset.testid = 'habit-card';
  li.dataset.habitId = habit.id;

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
    emoji.textContent = habit.emoji;
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
  todayBtn.addEventListener('click', () => {
    const now = getToday();
    commit(toggleDay(state, habit.id, now, now));
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-habit';
  deleteBtn.dataset.testid = 'delete-habit';
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => {
    if (window.confirm(`Удалить привычку «${habit.name}»?`)) {
      commit(removeHabit(state, habit.id));
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
    cell.addEventListener('click', () => {
      commit(toggleDay(state, habit.id, key, getToday()));
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
  editDraft = { name: habit.name, emoji: habit.emoji, days: normalizeDays(habit.days) };
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
  if (next === state) render();
  else commit(next);
  focusInCard(habitId, 'edit-habit');
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
    face.textContent = emoji;

    label.append(radio, face);
    options.append(label);
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
  editForm.append(input, options, daysGroup, buttons);
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

function renderStatsRow(row) {
  const tr = document.createElement('tr');
  tr.className = 'stats-row';
  tr.dataset.testid = 'stats-row';
  tr.dataset.habitId = row.habitId;

  const habitCell = document.createElement('td');
  habitCell.className = 'stats-habit';
  const emoji = document.createElement('span');
  emoji.className = 'stats-emoji';
  emoji.textContent = row.emoji;
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
  statsBody.replaceChildren(...stats.rows.map(renderStatsRow));
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

function render() {
  const today = getToday();
  const savedFocus = captureFocus();

  const { done, total } = getTodaySummary(state, today);
  summaryEl.textContent = `Сегодня выполнено ${done} из ${total}`;

  emptyEl.hidden = state.habits.length > 0;

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

  listEl.replaceChildren(...state.habits.map((habit) => renderCard(habit, today)));
  restoreFocus(savedFocus);
  renderStats(today);
}

buildEmojiOptions();
render();

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
