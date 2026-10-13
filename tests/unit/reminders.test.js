import { describe, it, expect } from 'vitest';
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
} from '../../src/reminders.js';
import { createEmptyState, addHabit } from '../../src/habits.js';

// Моменты задаются в местном времени процесса (new Date(y, m, d, ...)), поэтому
// тесты не зависят от часового пояса машины. Даты выбраны вне переходов на летнее время.
const at = (day, hh, mm = 0, ss = 0, month = 10) => new Date(2026, month - 1, day, hh, mm, ss).getTime();
const MIN = 60 * 1000;

function habit(id, reminder, done = []) {
  return { id, name: `Привычка ${id}`, emoji: '⭐', createdAt: '2026-09-01', done, reminder };
}

function stateWith(...habits) {
  return { version: 1, habits };
}

const intervalReminder = (over = {}) => ({
  mode: 'interval',
  intervalMin: 60,
  start: '09:00',
  end: '21:00',
  anchor: at(13, 10, 15),
  ...over,
});

describe('константы', () => {
  it('интервалы 30 мин / 1 ч / 2 ч / 3 ч, лимит 5 времён, активные часы 09:00–21:00', () => {
    expect(INTERVALS).toEqual([30, 60, 120, 180]);
    expect(MAX_TIMES).toBe(5);
    expect(DEFAULT_START).toBe('09:00');
    expect(DEFAULT_END).toBe('21:00');
  });
});

describe('addHabit (модель данных)', () => {
  it('новая привычка создаётся без напоминания (reminder: null)', () => {
    const s = addHabit(createEmptyState(), { name: 'Разминка' }, { id: 'a', todayKey: '2026-10-13' });
    expect(s.habits[0].reminder).toBeNull();
  });
});

describe('normalizeReminder', () => {
  it('валидный interval сохраняется', () => {
    const r = intervalReminder();
    expect(normalizeReminder(r)).toEqual(r);
  });

  it.each(INTERVALS)('интервал %i минут допустим', (intervalMin) => {
    expect(normalizeReminder(intervalReminder({ intervalMin }))).toMatchObject({ intervalMin });
  });

  it.each([[0], [15], [45], [90], [240], ['60'], [null]])('недопустимый интервал %j → null', (intervalMin) => {
    expect(normalizeReminder(intervalReminder({ intervalMin }))).toBeNull();
  });

  it.each([['9:00'], ['24:00'], ['12:60'], ['abc'], [''], [900], [null]])('время начала %j не HH:MM → null', (start) => {
    expect(normalizeReminder(intervalReminder({ start }))).toBeNull();
  });

  it('некорректный конец активных часов → null', () => {
    expect(normalizeReminder(intervalReminder({ end: '25:00' }))).toBeNull();
  });

  it('начало равно концу или позже конца → null', () => {
    expect(normalizeReminder(intervalReminder({ start: '12:00', end: '12:00' }))).toBeNull();
    expect(normalizeReminder(intervalReminder({ start: '21:00', end: '09:00' }))).toBeNull();
  });

  it('interval без числового момента включения (anchor) → null', () => {
    expect(normalizeReminder(intervalReminder({ anchor: undefined }))).toBeNull();
    expect(normalizeReminder(intervalReminder({ anchor: 'вчера' }))).toBeNull();
    expect(normalizeReminder(intervalReminder({ anchor: Number.NaN }))).toBeNull();
  });

  it('times: времена сортируются, повторы схлопываются', () => {
    expect(normalizeReminder({ mode: 'times', times: ['20:00', '08:00', '08:00'] })).toEqual({
      mode: 'times',
      times: ['08:00', '20:00'],
    });
  });

  it('times: ровно 5 времён допустимо', () => {
    const times = ['07:00', '09:00', '12:00', '15:00', '18:00'];
    expect(normalizeReminder({ mode: 'times', times })).toEqual({ mode: 'times', times });
  });

  it('times: 6 разных времён → null (не больше 5)', () => {
    const times = ['07:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
    expect(normalizeReminder({ mode: 'times', times })).toBeNull();
  });

  it('times: 6 записей, из которых 5 разных, — допустимо (повтор не считается)', () => {
    const times = ['07:00', '09:00', '12:00', '15:00', '18:00', '09:00'];
    expect(normalizeReminder({ mode: 'times', times })?.times).toEqual(['07:00', '09:00', '12:00', '15:00', '18:00']);
  });

  it('times: пустой список, не массив или только невалидные значения → null', () => {
    expect(normalizeReminder({ mode: 'times', times: [] })).toBeNull();
    expect(normalizeReminder({ mode: 'times', times: '08:00' })).toBeNull();
    expect(normalizeReminder({ mode: 'times', times: ['8 утра'] })).toBeNull();
  });

  it.each([[null], [undefined], ['interval'], [42], [[]], [{}], [{ mode: 'weekly', times: ['08:00'] }]])(
    'мусор %j → null без исключения',
    (raw) => {
      expect(normalizeReminder(raw)).toBeNull();
    },
  );
});

describe('setReminder / clearReminder', () => {
  const base = () => stateWith(habit('a', null), habit('b', null, ['2026-10-12']));

  it('interval: момент включения (anchor) = переданное время, другие привычки не затронуты', () => {
    const now = at(13, 10, 15);
    const s = setReminder(base(), 'a', { mode: 'interval', intervalMin: 60, start: '09:00', end: '21:00' }, now);
    expect(s.habits[0].reminder).toEqual({ mode: 'interval', intervalMin: 60, start: '09:00', end: '21:00', anchor: now });
    expect(s.habits[1]).toEqual(base().habits[1]);
  });

  it('повторное сохранение interval перезапускает отсчёт от нового момента', () => {
    const input = { mode: 'interval', intervalMin: 60, start: '09:00', end: '21:00' };
    const s1 = setReminder(base(), 'a', input, at(13, 10, 0));
    const s2 = setReminder(s1, 'a', input, at(13, 12, 30));
    expect(s2.habits[0].reminder.anchor).toBe(at(13, 12, 30));
  });

  it('times: сохраняются отсортированными и без повторов', () => {
    const s = setReminder(base(), 'a', { mode: 'times', times: ['20:00', '08:00', '20:00'] }, at(13, 7, 0));
    expect(s.habits[0].reminder).toEqual({ mode: 'times', times: ['08:00', '20:00'] });
  });

  it('невалидный ввод → состояние без изменений', () => {
    const s0 = base();
    expect(setReminder(s0, 'a', { mode: 'interval', intervalMin: 60, start: '21:00', end: '09:00' }, at(13, 10))).toBe(s0);
    expect(setReminder(s0, 'a', { mode: 'times', times: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00'] }, at(13, 10))).toBe(s0);
    expect(setReminder(s0, 'a', { mode: 'times', times: [] }, at(13, 10))).toBe(s0);
    expect(s0.habits[0].reminder).toBeNull();
  });

  it('неизвестный id → без изменений', () => {
    const s0 = base();
    const s1 = setReminder(s0, 'нет', { mode: 'times', times: ['08:00'] }, at(13, 10));
    expect(s1).toEqual(s0);
  });

  it('не изменяет исходное состояние', () => {
    const s0 = base();
    setReminder(s0, 'a', { mode: 'times', times: ['08:00'] }, at(13, 10));
    expect(s0.habits[0].reminder).toBeNull();
  });

  it('clearReminder выключает напоминание только у указанной привычки, отметки сохраняются', () => {
    let s = setReminder(base(), 'a', { mode: 'times', times: ['08:00'] }, at(13, 7));
    s = setReminder(s, 'b', { mode: 'times', times: ['09:00'] }, at(13, 7));
    const cleared = clearReminder(s, 'b');
    expect(cleared.habits[1].reminder).toBeNull();
    expect(cleared.habits[1].done).toEqual(['2026-10-12']);
    expect(cleared.habits[0].reminder).toEqual({ mode: 'times', times: ['08:00'] });
    expect(s.habits[1].reminder).not.toBeNull();
  });
});

describe('describeReminder (подпись на карточке)', () => {
  it.each([
    [60, 'каждый час, 9:00–21:00'],
    [120, 'каждые 2 часа, 9:00–21:00'],
    [180, 'каждые 3 часа, 9:00–21:00'],
    [30, 'каждые 30 минут, 9:00–21:00'],
  ])('интервал %i минут → «%s»', (intervalMin, text) => {
    expect(describeReminder(intervalReminder({ intervalMin }))).toBe(text);
  });

  it('нестандартные активные часы выводятся как есть', () => {
    expect(describeReminder(intervalReminder({ start: '10:30', end: '18:00' }))).toBe('каждый час, 10:30–18:00');
  });

  it('times → «08:00, 20:00»', () => {
    expect(describeReminder({ mode: 'times', times: ['08:00', '20:00'] })).toBe('08:00, 20:00');
  });
});

describe('findDueReminders — «Каждые N» (AC-11)', () => {
  const s = (reminder, done = []) => stateWith(habit('a', reminder, done));

  it('включено в 10:15 с интервалом 1 ч → срабатывает в 11:15 и 12:15', () => {
    const state = s(intervalReminder());
    expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([{ habitId: 'a', at: at(13, 11, 15) }]);
    expect(findDueReminders(state, at(13, 12, 14), at(13, 12, 15))).toEqual([{ habitId: 'a', at: at(13, 12, 15) }]);
  });

  it('между срабатываниями и в сам момент включения — ничего', () => {
    const state = s(intervalReminder());
    expect(findDueReminders(state, at(13, 10, 14), at(13, 10, 16))).toEqual([]);
    expect(findDueReminders(state, at(13, 11, 16), at(13, 12, 14, 59))).toEqual([]);
  });

  it('интервал проверки (from, to]: момент на границе to входит, на границе from — нет', () => {
    const state = s(intervalReminder());
    expect(findDueReminders(state, at(13, 11, 15), at(13, 11, 16))).toEqual([]);
    expect(findDueReminders(state, at(13, 11, 14, 59), at(13, 11, 15))).toHaveLength(1);
  });

  it('интервал 30 минут: срабатывает каждые 30 минут от момента включения', () => {
    const state = s(intervalReminder({ intervalMin: 30 }));
    expect(findDueReminders(state, at(13, 10, 44), at(13, 10, 45))).toEqual([{ habitId: 'a', at: at(13, 10, 45) }]);
    expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([{ habitId: 'a', at: at(13, 11, 15) }]);
  });

  it('вне активных часов напоминаний нет; на следующий день в активные часы — снова есть', () => {
    // Включено в 20:15, активные часы 9:00–21:00: 21:15 … 08:15 — вне часов.
    const state = s(intervalReminder({ anchor: at(13, 20, 15) }));
    expect(findDueReminders(state, at(13, 21, 14), at(13, 21, 15))).toEqual([]);
    expect(findDueReminders(state, at(14, 3, 14), at(14, 3, 15))).toEqual([]);
    expect(findDueReminders(state, at(14, 8, 14), at(14, 8, 15))).toEqual([]);
    expect(findDueReminders(state, at(14, 9, 14), at(14, 9, 15))).toEqual([{ habitId: 'a', at: at(14, 9, 15) }]);
  });

  it('границы активных часов: начало включительно, конец не включительно', () => {
    const state = s(intervalReminder({ anchor: at(13, 7, 0) }));
    expect(findDueReminders(state, at(13, 8, 59), at(13, 9, 0))).toEqual([{ habitId: 'a', at: at(13, 9, 0) }]);
    expect(findDueReminders(state, at(13, 20, 59), at(13, 21, 0))).toEqual([]);
  });

  it('пользовательские активные часы: 9:00–11:00 → 11:15 уже не напоминает', () => {
    const state = s(intervalReminder({ end: '11:00' }));
    expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([]);
  });

  it('отметка «сегодня» не отменяет напоминания «Каждые N»', () => {
    const state = s(intervalReminder(), ['2026-10-13']);
    expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([{ habitId: 'a', at: at(13, 11, 15) }]);
  });

  it('переход через полночь: отсчёт продолжается в новом дне', () => {
    const state = s(intervalReminder({ start: '00:00', end: '23:59', anchor: at(13, 23, 30) }));
    expect(findDueReminders(state, at(14, 0, 29), at(14, 0, 30))).toEqual([{ habitId: 'a', at: at(14, 0, 30) }]);
  });
});

describe('findDueReminders — «В определённое время» (AC-12)', () => {
  const times = { mode: 'times', times: ['08:00', '20:00'] };
  const s = (done = []) => stateWith(habit('a', times, done));

  it('08:00 и 20:00 срабатывают, если привычка сегодня не отмечена', () => {
    expect(findDueReminders(s(), at(13, 7, 59), at(13, 8, 0))).toEqual([{ habitId: 'a', at: at(13, 8, 0) }]);
    expect(findDueReminders(s(), at(13, 19, 59), at(13, 20, 1))).toEqual([{ habitId: 'a', at: at(13, 20, 0) }]);
  });

  it('между временами — ничего', () => {
    expect(findDueReminders(s(), at(13, 8, 1), at(13, 19, 59))).toEqual([]);
  });

  it('после отметки сегодня — не срабатывают', () => {
    expect(findDueReminders(s(['2026-10-13']), at(13, 19, 59), at(13, 20, 1))).toEqual([]);
  });

  it('отметка только вчера не мешает сегодняшнему напоминанию', () => {
    expect(findDueReminders(s(['2026-10-12']), at(13, 7, 59), at(13, 8, 0))).toHaveLength(1);
  });

  it('разные дни: отметка сегодня не мешает напоминанию завтра', () => {
    expect(findDueReminders(s(['2026-10-13']), at(14, 7, 59), at(14, 8, 0))).toEqual([{ habitId: 'a', at: at(14, 8, 0) }]);
  });

  it('переход через полночь: 00:00 относится к новому дню', () => {
    const midnight = stateWith(habit('a', { mode: 'times', times: ['00:00'] }, ['2026-10-13']));
    expect(findDueReminders(midnight, at(13, 23, 58), at(14, 0, 1))).toEqual([{ habitId: 'a', at: at(14, 0, 0) }]);
    const doneNewDay = stateWith(habit('a', { mode: 'times', times: ['00:00'] }, ['2026-10-14']));
    expect(findDueReminders(doneNewDay, at(13, 23, 58), at(14, 0, 1))).toEqual([]);
  });

  it('смена месяца: 31 октября отмечено, напоминание 1 ноября приходит', () => {
    const state = stateWith(habit('a', { mode: 'times', times: ['00:00'] }, ['2026-10-31']));
    expect(findDueReminders(state, at(31, 23, 59), at(1, 0, 2, 0, 11))).toEqual([
      { habitId: 'a', at: at(1, 0, 0, 0, 11) },
    ]);
  });
});

describe('findDueReminders — без догоняющих и без повторов (AC-14)', () => {
  const times = stateWith(habit('a', { mode: 'times', times: ['08:00'] }));

  it('момент старше 5 минут относительно to не возвращается, даже если попал в (from, to]', () => {
    expect(findDueReminders(times, at(13, 7, 0), at(13, 8, 10))).toEqual([]);
    expect(findDueReminders(times, at(12, 12, 0), at(13, 12, 0))).toEqual([]);
  });

  it('момент не старше 5 минут возвращается', () => {
    expect(findDueReminders(times, at(13, 7, 0), at(13, 8, 4))).toEqual([{ habitId: 'a', at: at(13, 8, 0) }]);
  });

  it('graceMs можно передать параметром', () => {
    expect(findDueReminders(times, at(13, 7, 0), at(13, 8, 10), { graceMs: 15 * MIN })).toHaveLength(1);
    expect(findDueReminders(times, at(13, 7, 0), at(13, 8, 2), { graceMs: 1 * MIN })).toEqual([]);
  });

  it('interval: после долгого перерыва старые моменты не досылаются', () => {
    const state = stateWith(habit('a', intervalReminder()));
    expect(findDueReminders(state, at(13, 10, 15), at(13, 14, 30))).toEqual([]);
  });

  it('не более одного напоминания на привычку за одну проверку', () => {
    const state = stateWith(habit('a', intervalReminder({ intervalMin: 30, anchor: at(13, 10, 0) })));
    const due = findDueReminders(state, at(13, 10, 0), at(13, 12, 0), { graceMs: 3 * 60 * MIN });
    expect(due).toHaveLength(1);
    expect(due[0].habitId).toBe('a');
    expect([at(13, 10, 30), at(13, 11, 0), at(13, 11, 30), at(13, 12, 0)]).toContain(due[0].at);
  });

  it('несколько привычек срабатывают независимо; без напоминания — пропускаются', () => {
    const state = stateWith(
      habit('a', { mode: 'times', times: ['08:00'] }),
      habit('b', null),
      habit('c', { mode: 'times', times: ['08:00', '09:00'] }),
      habit('d', { mode: 'times', times: ['08:00'] }, ['2026-10-13']),
    );
    const due = findDueReminders(state, at(13, 7, 59), at(13, 8, 0));
    expect(due.map((d) => d.habitId).sort()).toEqual(['a', 'c']);
  });

  it('пустой или обратный интервал проверки → []', () => {
    expect(findDueReminders(times, at(13, 8, 0), at(13, 8, 0))).toEqual([]);
    expect(findDueReminders(times, at(13, 8, 1), at(13, 7, 59))).toEqual([]);
  });

  it('не изменяет состояние', () => {
    const state = stateWith(habit('a', { mode: 'times', times: ['08:00'] }));
    const copy = JSON.parse(JSON.stringify(state));
    findDueReminders(state, at(13, 7, 59), at(13, 8, 0));
    expect(state).toEqual(copy);
  });
});

// Итерация 004 (AC-27): напоминания только в дни по расписанию.
// 13.10.2026 — вторник, 14.10.2026 — среда.
describe('findDueReminders — расписание по дням недели (AC-27)', () => {
  const MWF = [1, 3, 5];
  const withDays = (id, reminder, days, done = []) => ({ ...habit(id, reminder, done), days });

  describe('«Каждые N»', () => {
    it('в выходной день привычки (вт) напоминания нет', () => {
      const state = stateWith(withDays('a', intervalReminder(), MWF));
      expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([]);
      expect(findDueReminders(state, at(13, 12, 14), at(13, 12, 15))).toEqual([]);
    });

    it('в день по расписанию (ср) напоминание приходит', () => {
      const state = stateWith(withDays('a', intervalReminder(), MWF));
      expect(findDueReminders(state, at(14, 11, 14), at(14, 11, 15))).toEqual([{ habitId: 'a', at: at(14, 11, 15) }]);
    });

    it('сегодня в расписании (только вт) — приходит', () => {
      const state = stateWith(withDays('a', intervalReminder(), [2]));
      expect(findDueReminders(state, at(13, 11, 14), at(13, 11, 15))).toEqual([{ habitId: 'a', at: at(13, 11, 15) }]);
    });

    it('в день по расписанию отметка по-прежнему не отменяет напоминание', () => {
      const state = stateWith(withDays('a', intervalReminder(), MWF, ['2026-10-14']));
      expect(findDueReminders(state, at(14, 11, 14), at(14, 11, 15))).toHaveLength(1);
    });

    it('после полуночи день недели — уже новый', () => {
      const r = intervalReminder({ start: '00:00', end: '23:59', anchor: at(13, 23, 30) });
      expect(findDueReminders(stateWith(withDays('a', r, [3])), at(14, 0, 29), at(14, 0, 30)))
        .toEqual([{ habitId: 'a', at: at(14, 0, 30) }]);
      expect(findDueReminders(stateWith(withDays('a', r, [2])), at(14, 0, 29), at(14, 0, 30))).toEqual([]);
    });
  });

  describe('«В определённое время»', () => {
    const times = { mode: 'times', times: ['08:00', '20:00'] };

    it('в выходной день привычки не приходит, даже если не отмечено', () => {
      const state = stateWith(withDays('a', times, MWF));
      expect(findDueReminders(state, at(13, 7, 59), at(13, 8, 0))).toEqual([]);
      expect(findDueReminders(state, at(13, 19, 59), at(13, 20, 0))).toEqual([]);
    });

    it('в день по расписанию приходит, если не отмечено; после отметки — нет', () => {
      expect(findDueReminders(stateWith(withDays('a', times, MWF)), at(14, 7, 59), at(14, 8, 0)))
        .toEqual([{ habitId: 'a', at: at(14, 8, 0) }]);
      expect(findDueReminders(stateWith(withDays('a', times, MWF, ['2026-10-14'])), at(14, 7, 59), at(14, 8, 0)))
        .toEqual([]);
    });

    it('00:00 относится к новому дню: расписание проверяется по нему', () => {
      const midnight = { mode: 'times', times: ['00:00'] };
      expect(findDueReminders(stateWith(withDays('a', midnight, [3])), at(13, 23, 58), at(14, 0, 1)))
        .toEqual([{ habitId: 'a', at: at(14, 0, 0) }]);
      expect(findDueReminders(stateWith(withDays('a', midnight, [2])), at(13, 23, 58), at(14, 0, 1))).toEqual([]);
    });
  });

  it('несколько привычек: срабатывают только назначенные на сегодня; без поля days — каждый день', () => {
    const times = { mode: 'times', times: ['08:00'] };
    const state = stateWith(
      withDays('off', times, MWF),
      withDays('on', times, [2, 4]),
      habit('legacy', times),
    );
    const due = findDueReminders(state, at(13, 7, 59), at(13, 8, 0));
    expect(due.map((d) => d.habitId).sort()).toEqual(['legacy', 'on']);
  });
});
