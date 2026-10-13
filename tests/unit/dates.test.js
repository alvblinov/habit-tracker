import { describe, it, expect } from 'vitest';
import { toDateKey, addDays, lastNDays } from '../../src/dates.js';

describe('toDateKey', () => {
  it('возвращает локальную дату в формате YYYY-MM-DD с ведущими нулями', () => {
    expect(toDateKey(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });

  it('около полуночи берёт локальный календарный день, а не UTC', () => {
    // Локальные 00:30 и 23:59 — тот же день пользователя при любом часовом поясе.
    expect(toDateKey(new Date(2026, 9, 13, 0, 30))).toBe('2026-10-13');
    expect(toDateKey(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13');
  });
});

describe('addDays', () => {
  it('сдвигает дату внутри месяца', () => {
    expect(addDays('2026-10-13', -1)).toBe('2026-10-12');
    expect(addDays('2026-10-13', 2)).toBe('2026-10-15');
    expect(addDays('2026-10-13', 0)).toBe('2026-10-13');
  });

  it('корректно переходит через границу месяца', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-05-01', -1)).toBe('2026-04-30');
  });

  it('корректно переходит через границу года', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('учитывает 29 февраля в високосном году', () => {
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('не сбивается на переходе на летнее/зимнее время', () => {
    // Европейские переходы 2026: 29.03 и 25.10. Сдвиг считается в календарных днях.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-26', -2)).toBe('2026-10-24');
  });
});

describe('lastNDays', () => {
  it('возвращает 30 дней подряд от старого к сегодня, последний — сегодня', () => {
    const days = lastNDays('2026-10-13', 30);
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-10-13');
    expect(days[0]).toBe('2026-09-14');
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]).toBe(addDays(days[i - 1], 1));
    }
  });

  it('не содержит будущих дней', () => {
    const days = lastNDays('2026-10-13', 30);
    expect(days.every((d) => d <= '2026-10-13')).toBe(true);
    expect(new Set(days).size).toBe(30);
  });

  it('захватывает предыдущий месяц и февраль без 29-го в невисокосном году', () => {
    const days = lastNDays('2026-03-01', 30);
    expect(days[0]).toBe('2026-01-31');
    expect(days).toContain('2026-02-28');
    expect(days).not.toContain('2026-02-29');
    expect(days[29]).toBe('2026-03-01');
  });

  it('включает 29 февраля в високосном году', () => {
    const days = lastNDays('2028-03-01', 30);
    expect(days).toContain('2028-02-29');
    expect(days[0]).toBe('2028-02-01');
  });
});
