import { describe, it, expect } from 'vitest';
import { computeStats, PERIODS, DEFAULT_PERIOD } from '../../src/stats.js';

// Итерация 004: статистика (AC-28…AC-30). «Сегодня» = 2026-10-13 (вторник).
// Окно 7 дней: 07.10 (ср) … 13.10; окно 30 дней: 14.09 (пн) … 13.10.
// Учитываются только дни по расписанию с начала истории привычки
// (дата создания или первая отметка — что раньше); сегодня — только если отмечено.

const TODAY = '2026-10-13';
const ALL7 = [1, 2, 3, 4, 5, 6, 7];
const MWF = [1, 3, 5];

function habit(id, { createdAt = '2026-08-01', done = [], days = ALL7, name = `Привычка ${id}`, emoji = '⭐' } = {}) {
  return { id, name, emoji, createdAt, done, reminder: null, days };
}

function stateWith(...habits) {
  return { version: 1, habits };
}

/** Даты подряд от from до to включительно. */
function range(from, to) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; ; i += 1) {
    const dt = new Date(y, m - 1, d + i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    out.push(key);
    if (key === to) return out;
  }
}

// Процент — доля done/scheduled в процентах; допускается округление до целого.
const expectPercent = (actual, done, scheduled) => expect(actual).toBeCloseTo((done * 100) / scheduled, 0);

describe('периоды', () => {
  it('7 дней / 30 дней / всё время; по умолчанию 30 дней', () => {
    expect(PERIODS).toEqual([7, 30, 'all']);
    expect(DEFAULT_PERIOD).toBe(30);
  });

  it('без указания периода считается за 30 дней', () => {
    const state = stateWith(habit('a', { done: range('2026-10-01', '2026-10-12') }));
    expect(computeStats(state, TODAY)).toEqual(computeStats(state, TODAY, 30));
  });
});

describe('пустое состояние (AC-30)', () => {
  it('без привычек: процента нет, отметок 0, лучшего дня нет, строк нет', () => {
    expect(computeStats({ version: 1, habits: [] }, TODAY, 30)).toEqual({
      percent: null,
      done: 0,
      scheduled: 0,
      totalMarks: 0,
      bestWeekday: null,
      rows: [],
    });
  });

  it('привычка создана сегодня и не отмечена: дней по расписанию нет → процента и лучшего дня нет', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: TODAY })), TODAY, 30);
    expect(s).toMatchObject({ percent: null, done: 0, scheduled: 0, totalMarks: 0, bestWeekday: null });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ habitId: 'a', done: 0, scheduled: 0, percent: null });
  });
});

describe('окна 7 / 30 / всё время (AC-28, AC-29)', () => {
  // «Каждый день», создана 01.08, отмечены 01.10…12.10, сегодня не отмечено.
  const state = stateWith(habit('a', { done: range('2026-10-01', '2026-10-12') }));

  it('7 дней: 07.10…12.10 — 6 из 6, 100%', () => {
    expect(computeStats(state, TODAY, 7)).toMatchObject({ done: 6, scheduled: 6, percent: 100, totalMarks: 6 });
  });

  it('30 дней: 14.09…12.10 — 12 из 29', () => {
    const s = computeStats(state, TODAY, 30);
    expect(s).toMatchObject({ done: 12, scheduled: 29, totalMarks: 12 });
    expectPercent(s.percent, 12, 29);
  });

  it('всё время: с даты создания 01.08 по 12.10 — 12 из 73', () => {
    const s = computeStats(state, TODAY, 'all');
    expect(s).toMatchObject({ done: 12, scheduled: 73, totalMarks: 12 });
    expectPercent(s.percent, 12, 73);
  });

  it('всё время на длинной истории: с 01.01.2026 — 285 дней; только понедельники с 05.01 — 41', () => {
    const daily = computeStats(stateWith(habit('a', { createdAt: '2026-01-01', done: ['2026-01-01', '2026-10-12'] })), TODAY, 'all');
    expect(daily).toMatchObject({ done: 2, scheduled: 285, totalMarks: 2 });
    const mondays = computeStats(stateWith(habit('m', { createdAt: '2026-01-05', days: [1], done: ['2026-01-05'] })), TODAY, 'all');
    expect(mondays).toMatchObject({ done: 1, scheduled: 41, totalMarks: 1 });
  });
});

describe('сегодня (AC-29)', () => {
  const past = range('2026-10-10', '2026-10-12');

  it('неотмеченное сегодня не занижает процент', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-10', done: past })), TODAY, 30);
    expect(s).toMatchObject({ done: 3, scheduled: 3, percent: 100 });
  });

  it('отмеченное сегодня учитывается в днях и в отметках', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-10', done: [...past, TODAY] })), TODAY, 30);
    expect(s).toMatchObject({ done: 4, scheduled: 4, percent: 100, totalMarks: 4 });
  });

  it('прошедший неотмеченный день занижает процент', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-10', done: ['2026-10-10', '2026-10-12'] })), TODAY, 30);
    expect(s).toMatchObject({ done: 2, scheduled: 3 });
    expectPercent(s.percent, 2, 3);
  });
});

describe('начало истории привычки (AC-29)', () => {
  it('отметка раньше даты создания сдвигает начало истории на неё', () => {
    const s = computeStats(
      stateWith(habit('a', { createdAt: '2026-10-10', done: ['2026-10-05', '2026-10-10', '2026-10-11', '2026-10-12'] })),
      TODAY,
      30,
    );
    // 05.10…12.10 — 8 дней.
    expect(s).toMatchObject({ done: 4, scheduled: 8, percent: 50, totalMarks: 4 });
  });

  it('дата создания раньше первой отметки — начало истории она', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-05', done: ['2026-10-12'] })), TODAY, 30);
    expect(s).toMatchObject({ done: 1, scheduled: 8, totalMarks: 1 });
  });

  it('начало истории внутри окна 7 дней ограничивает окно', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-10', done: ['2026-10-11'] })), TODAY, 7);
    expect(s).toMatchObject({ done: 1, scheduled: 3 });
  });

  it('отметка до начала окна в окно не попадает, но учитывается за всё время', () => {
    const state = stateWith(habit('a', { createdAt: '2026-10-10', done: ['2026-09-01', '2026-10-12'] }));
    expect(computeStats(state, TODAY, 30)).toMatchObject({ done: 1, scheduled: 29, totalMarks: 1 });
    // 01.09…12.10 — 42 дня.
    expect(computeStats(state, TODAY, 'all')).toMatchObject({ done: 2, scheduled: 42, totalMarks: 2 });
  });
});

describe('расписание и отметки в выходные (AC-29)', () => {
  // «пн, ср, пт», создана пт 25.09. Дни по расписанию 25.09…12.10:
  // пт 25, пн 28, ср 30, пт 02, пн 05, ср 07, пт 09, пн 12 — 8 дней.
  // Отмечены 6 из них (кроме пт 25.09 и ср 07.10) и две субботы (03.10, 10.10).
  const marks = [
    '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-03',
    '2026-10-05', '2026-10-09', '2026-10-10', '2026-10-12',
  ];
  const gym = (done = marks) => habit('gym', { createdAt: '2026-09-25', days: MWF, done, name: 'Спортзал', emoji: '🏃' });

  it('процент и «N из M» — только по дням расписания; всего отметок — включая выходные', () => {
    const s = computeStats(stateWith(gym()), TODAY, 30);
    expect(s).toMatchObject({ done: 6, scheduled: 8, percent: 75, totalMarks: 8 });
    expect(s.rows[0]).toMatchObject({ habitId: 'gym', done: 6, scheduled: 8, percent: 75 });
  });

  it('отметка сегодня в выходной (вт) увеличивает только «всего отметок»', () => {
    const s = computeStats(stateWith(gym([...marks, TODAY])), TODAY, 30);
    expect(s).toMatchObject({ done: 6, scheduled: 8, percent: 75, totalMarks: 9 });
  });

  it('окно 7 дней: ср 07, пт 09, пн 12 по расписанию; отмечены 2; всего отметок 3', () => {
    const s = computeStats(stateWith(gym()), TODAY, 7);
    expect(s).toMatchObject({ done: 2, scheduled: 3, totalMarks: 3 });
    expectPercent(s.percent, 2, 3);
  });

  it('строка таблицы содержит текущую серию и рекорд по правилам расписания', () => {
    // Серия: пн 12, (вс пропуск), сб 10, пт 09, (чт пропуск), ср 07 не отмечена → 3.
    // Рекорд: пн 28, ср 30, пт 02, сб 03, пн 05 → 5.
    const [row] = computeStats(stateWith(gym()), TODAY, 30).rows;
    expect(row).toEqual({
      habitId: 'gym',
      emoji: '🏃',
      name: 'Спортзал',
      done: 6,
      scheduled: 8,
      percent: 75,
      streak: 3,
      best: 5,
    });
  });
});

describe('общий процент по всем привычкам (AC-29)', () => {
  it('сумма отмеченных дней / сумма дней по расписанию, а не среднее процентов', () => {
    const state = stateWith(
      // 10.10…12.10 — 3 из 3.
      habit('a', { createdAt: '2026-10-10', done: range('2026-10-10', '2026-10-12') }),
      // «пн, ср, пт» с 05.10: пн 05, ср 07, пт 09, пн 12 — 1 из 4.
      habit('b', { createdAt: '2026-10-05', days: MWF, done: ['2026-10-05'] }),
    );
    const s = computeStats(state, TODAY, 30);
    expect(s).toMatchObject({ done: 4, scheduled: 7, totalMarks: 4 });
    expectPercent(s.percent, 4, 7);
  });
});

describe('лучший день недели (AC-30)', () => {
  it('день недели с наибольшим процентом выполнения', () => {
    // Окно 7 дней: ср 07 … пн 12 — по одному дню каждого дня недели, кроме вт (сегодня не отмечено).
    const s = computeStats(stateWith(habit('a', { done: ['2026-10-09'] })), TODAY, 7);
    expect(s.bestWeekday).toBe(5);
  });

  it('решает процент, а не число отметок', () => {
    const state = stateWith(
      // Только пн, с 14.09: пн 14, 21, 28, 05, 12 — отмечены 3 из 5 (60%).
      habit('mon', { createdAt: '2026-09-14', days: [1], done: ['2026-09-14', '2026-09-21', '2026-09-28'] }),
      // Только пт, с 09.10: пт 09 — 1 из 1 (100%).
      habit('fri', { createdAt: '2026-10-09', days: [5], done: ['2026-10-09'] }),
    );
    expect(computeStats(state, TODAY, 30).bestWeekday).toBe(5);
  });

  it('проценты считаются по всем привычкам вместе', () => {
    const state = stateWith(
      // Окно 7 дней, «каждый день»: чт 08 и пт 09 отмечены.
      habit('a', { done: ['2026-10-08', '2026-10-09'] }),
      // Пт 09 отмечена, чт 08 — нет: чт 1 из 2, пт 2 из 2.
      habit('b', { done: ['2026-10-09'] }),
    );
    expect(computeStats(state, TODAY, 7).bestWeekday).toBe(5);
  });

  it('ничья — более ранний день', () => {
    const s = computeStats(stateWith(habit('a', { done: ['2026-10-07', '2026-10-09'] })), TODAY, 7);
    expect(s.bestWeekday).toBe(3);
  });

  it('отметки в выходной привычки в лучший день не входят', () => {
    // «пн, ср, пт» с 05.10: пн 05 отмечен (пн — 1 из 2), сб 10 — выходной с отметкой.
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-05', days: MWF, done: ['2026-10-05', '2026-10-10'] })), TODAY, 30);
    expect(s.bestWeekday).toBe(1);
    expect(s.totalMarks).toBe(2);
  });

  it('нет дней по расписанию → нет лучшего дня', () => {
    expect(computeStats(stateWith(habit('a', { createdAt: TODAY })), TODAY, 7).bestWeekday).toBeNull();
  });

  // Спорный случай (см. reports/004-schedule-stats/01/tests.md): дни по расписанию есть,
  // но ни одной отметки — выполнения нет ни в один день недели, «лучшего» дня нет → «—».
  it('дни по расписанию есть, но ни одной отметки за период → нет лучшего дня', () => {
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-01', days: MWF })), TODAY, 30);
    expect(s.scheduled).toBeGreaterThan(0);
    expect(s.done).toBe(0);
    expect(s.bestWeekday).toBeNull();
  });

  // Цикл 02, уточнение AC-30: «—», если нет ни одной отметки именно в дни по расписанию.
  // Отметки в выходные привычки «данными» для лучшего дня не считаются.
  it('отметки только в выходные привычки → нет лучшего дня, но они входят во «всего отметок»', () => {
    // «пн, ср, пт» с 05.10: отмечены только вт 06 и сб 10 — оба выходные.
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-05', days: MWF, done: ['2026-10-06', '2026-10-10'] })), TODAY, 30);
    expect(s.scheduled).toBeGreaterThan(0);
    expect(s.done).toBe(0);
    expect(s.totalMarks).toBe(2);
    expect(s.bestWeekday).toBeNull();
  });

  it('отметка только вне окна периода → в этом периоде лучшего дня нет, за всё время — есть', () => {
    // «каждый день» с 01.10, отмечен только пт 02.10 — вне окна 7 дней (07.10…13.10).
    const state = stateWith(habit('a', { createdAt: '2026-10-01', done: ['2026-10-02'] }));
    expect(computeStats(state, TODAY, 7).bestWeekday).toBeNull();
    expect(computeStats(state, TODAY, 'all').bestWeekday).toBe(5);
  });

  it('одна отметка в день расписания, не самый ранний → лучший день — её день недели', () => {
    // «пн, ср, пт» с 05.10: отмечена только ср 07 → ср (3), а не пн (1) по правилу ничьей.
    const s = computeStats(stateWith(habit('a', { createdAt: '2026-10-05', days: MWF, done: ['2026-10-07'] })), TODAY, 30);
    expect(s.bestWeekday).toBe(3);
  });
});

describe('таблица по привычкам (AC-30)', () => {
  // Все созданы 10.10 (кроме «none»): дни по расписанию 10.10…12.10 — 3.
  const state = stateWith(
    habit('low', { createdAt: '2026-10-10', done: ['2026-10-10'] }),
    habit('none', { createdAt: TODAY }),
    habit('zero', { createdAt: '2026-10-10' }),
    habit('high', { createdAt: '2026-10-10', done: range('2026-10-10', '2026-10-12') }),
    habit('low2', { createdAt: '2026-10-10', done: ['2026-10-11'] }),
    habit('mid', { createdAt: '2026-10-10', done: ['2026-10-11', '2026-10-12'] }),
  );

  it('сортировка по проценту (выше — лучше); без данных — в конце; равные — в исходном порядке', () => {
    const rows = computeStats(state, TODAY, 30).rows;
    expect(rows.map((r) => r.habitId)).toEqual(['high', 'mid', 'low', 'low2', 'zero', 'none']);
    expect(rows.map((r) => [r.done, r.scheduled])).toEqual([[3, 3], [2, 3], [1, 3], [1, 3], [0, 3], [0, 0]]);
    expect(rows[4].percent).toBe(0);
    expect(rows[5].percent).toBeNull();
  });

  it('строка: эмодзи, название, N из M, серия и рекорд', () => {
    const [top] = computeStats(state, TODAY, 30).rows;
    expect(top).toEqual({
      habitId: 'high',
      emoji: '⭐',
      name: 'Привычка high',
      done: 3,
      scheduled: 3,
      percent: 100,
      streak: 3,
      best: 3,
    });
  });

  it('не изменяет состояние', () => {
    const copy = JSON.parse(JSON.stringify(state));
    computeStats(state, TODAY, 'all');
    expect(state).toEqual(copy);
  });
});
