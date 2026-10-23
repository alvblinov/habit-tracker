// Экскурсия помощника: 6 шагов с подсветкой элементов страницы.
// target — CSS-селектор цели (первый видимый элемент). Без привычек на время экскурсии
// показывается карточка-пример (demoHabit), и шаги 2–5 подсвечивают её элементы;
// missingText — запасной текст на случай, если цели всё же нет.

import { addDays } from './dates.js';
import { ALL_DAYS } from './schedule.js';

export const TOUR_STEPS = [
  {
    id: 'form',
    target: '#add-form',
    title: 'Новая привычка',
    text: 'Здесь добавляются привычки: название, эмодзи — и «Добавить».',
  },
  {
    id: 'today',
    target: '[data-testid="toggle-today"]',
    title: 'Отметка за сегодня',
    text: 'Кнопка «Сегодня» отмечает привычку за текущий день. Нажми ещё раз — отметка снимется.',
    missingText: 'Когда добавишь привычку, на её карточке появится кнопка «Сегодня» для отметки.',
  },
  {
    id: 'grid',
    target: '.day-grid',
    title: 'Сетка за 30 дней',
    text: 'Каждая клетка — день, справа сегодня. Клик по клетке отмечает и прошлые дни.',
    missingText: 'У каждой привычки будет сетка за 30 дней — в ней можно отметить и прошлые дни.',
  },
  {
    id: 'reminder',
    target: '[data-testid="reminder-toggle"]',
    title: 'Напоминания',
    text: 'Кнопка 🔔 настраивает напоминание: каждые N минут или в точное время, пока вкладка открыта.',
    missingText: 'На карточке привычки будет кнопка 🔔 — с ней можно настроить напоминание.',
  },
  {
    id: 'edit',
    target: '[data-testid="edit-habit"]',
    title: 'Изменить привычку',
    text: 'Через ✏️ меняются название, эмодзи, цвет и дни недели.',
    missingText: 'Кнопка ✏️ на карточке позволит поменять название, эмодзи, цвет и дни недели.',
  },
  {
    id: 'stats',
    target: '#stats-toggle',
    title: 'Статистика',
    text: '«📊 Статистика» показывает процент выполнения, серии, рекорды и лучший день недели.',
  },
];

// Карточка-пример для экскурсии без привычек: не сохраняется и в состояние не попадает.
export const DEMO_HABIT_ID = 'tour-demo';

export const DEMO_HABIT = Object.freeze({
  id: DEMO_HABIT_ID,
  name: 'Пример: пить воду',
  emoji: '💧',
  days: Object.freeze([...ALL_DAYS]),
  createdAt: null,
  done: Object.freeze([]),
  reminder: null,
});

// Сколько дней назад отмечен пример: 4 из последних 6 (вчера отмечено — серия 2), сегодня не отмечено.
const DEMO_DONE_DAYS_AGO = [5, 4, 2, 1];

/** Копия примера с отметками за прошлые дни относительно переданного today (YYYY-MM-DD). */
export function demoHabit(today) {
  return {
    ...DEMO_HABIT,
    days: [...DEMO_HABIT.days],
    createdAt: addDays(today, -6),
    done: DEMO_DONE_DAYS_AGO.map((n) => addDays(today, -n)).sort(),
  };
}

/** Нужен ли пример: привычек нет. */
export function needsDemo(state) {
  return !state || !Array.isArray(state.habits) || state.habits.length === 0;
}
