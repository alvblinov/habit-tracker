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
  getTodaySummary,
} from './habits.js';
import { STORAGE_KEY, loadState, saveState } from './storage.js';

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

  const streak = getStreak(habit, today);
  const streakEl = document.createElement('p');
  streakEl.className = 'habit-streak';
  streakEl.dataset.testid = 'habit-streak';
  streakEl.textContent = `🔥 ${streak} ${pluralDays(streak)} подряд`;

  header.append(title, streakEl);

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

  actions.append(todayBtn, deleteBtn);

  const grid = document.createElement('div');
  grid.className = 'day-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `Последние ${GRID_DAYS} дней`);
  for (const key of lastNDays(today, GRID_DAYS)) {
    const done = isDone(habit, key);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day-cell';
    if (done) cell.classList.add('is-done');
    if (key === today) cell.classList.add('is-today');
    cell.dataset.testid = 'day-cell';
    cell.dataset.date = key;
    cell.setAttribute('aria-pressed', String(done));
    const label = `${formatDate(key)}${key === today ? ' (сегодня)' : ''}${done ? ' — выполнено' : ''}`;
    cell.title = label;
    cell.setAttribute('aria-label', label);
    cell.addEventListener('click', () => {
      commit(toggleDay(state, habit.id, key, getToday()));
    });
    grid.append(cell);
  }

  li.append(header, actions, grid);
  return li;
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
  };
}

function restoreFocus(saved) {
  if (!saved) return;
  for (const card of listEl.querySelectorAll('[data-habit-id]')) {
    if (card.dataset.habitId !== saved.habitId) continue;
    for (const el of card.querySelectorAll(`[data-testid="${saved.testid}"]`)) {
      if (el.dataset.date === saved.date) {
        el.focus();
        return;
      }
    }
    return;
  }
}

function render() {
  const today = getToday();
  const savedFocus = captureFocus();

  const { done, total } = getTodaySummary(state, today);
  summaryEl.textContent = `Сегодня выполнено ${done} из ${total}`;

  emptyEl.hidden = state.habits.length > 0;

  listEl.replaceChildren(...state.habits.map((habit) => renderCard(habit, today)));
  restoreFocus(savedFocus);
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
}
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
