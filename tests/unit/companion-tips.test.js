import { describe, it, expect } from 'vitest';
import { TIPS, tipForDay, shouldShowTip } from '../../src/companion-tips.js';
import { addDays } from '../../src/dates.js';

// Расширение итерации 006: совет дня — не чаще раза в день по локальной дате,
// только у включённого помощника; ~30 советов по кругу (AC-52).

const REPROACH = /пропуст|лентя|ленив|стыдн|позор|провал/i;
const TODAY = '2026-10-13';

describe('TIPS', () => {
  it('не меньше 30 советов: непустые, разные, без «{…}» и упрёков', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TIPS).size).toBe(TIPS.length);
    for (const tip of TIPS) {
      expect(typeof tip).toBe('string');
      expect(tip.trim().length, tip).toBeGreaterThan(0);
      expect(tip, tip).not.toMatch(/[{}]/);
      expect(tip, tip).not.toMatch(REPROACH);
    }
  });
});

describe('tipForDay', () => {
  it('детерминирован: одна и та же дата — один и тот же совет', () => {
    for (const day of [TODAY, '2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(tipForDay(day)).toBe(tipForDay(day));
      expect(TIPS).toContain(tipForDay(day));
    }
  });

  it('соседние дни — разные советы (в том числе через смену месяца и года)', () => {
    for (const [a, b] of [
      [TODAY, '2026-10-14'],
      ['2026-10-31', '2026-11-01'],
      ['2026-12-31', '2027-01-01'],
      ['2028-02-28', '2028-02-29'],
    ]) {
      expect(tipForDay(a), `${a} / ${b}`).not.toBe(tipForDay(b));
    }
  });

  it('по кругу: за TIPS.length дней подряд показываются все советы, затем повтор', () => {
    const days = Array.from({ length: TIPS.length }, (_, i) => addDays('2026-10-20', i));
    const shown = days.map(tipForDay);
    expect(new Set(shown).size).toBe(TIPS.length);
    expect(tipForDay(addDays('2026-10-20', TIPS.length))).toBe(tipForDay('2026-10-20'));
  });

  it.each([[''], ['13.10.2026'], ['2026-02-30'], [null], [undefined]])('некорректная дата %s не ломает: один из советов', (day) => {
    expect(TIPS).toContain(tipForDay(day));
  });
});

describe('shouldShowTip', () => {
  const on = (extra = {}) => ({ character: 'cat', name: 'Мурзик', enabled: true, introduced: true, ...extra });

  it('совета сегодня ещё не было (lastTipDate null) → показать', () => {
    expect(shouldShowTip(on({ lastTipDate: null }), TODAY)).toBe(true);
  });

  it('последний совет вчера → показать', () => {
    expect(shouldShowTip(on({ lastTipDate: '2026-10-12' }), TODAY)).toBe(true);
  });

  it('совет уже был сегодня → не показывать (раз в день)', () => {
    expect(shouldShowTip(on({ lastTipDate: TODAY }), TODAY)).toBe(false);
  });

  it('смена месяца: совет 31.10, сегодня 1.11 → показать', () => {
    expect(shouldShowTip(on({ lastTipDate: '2026-10-31' }), '2026-11-01')).toBe(true);
  });

  it('выключенный помощник совет не показывает', () => {
    expect(shouldShowTip(on({ enabled: false, lastTipDate: null }), TODAY)).toBe(false);
  });

  it('до знакомства (помощник ещё не выбран и не показан) совет не показывается', () => {
    expect(shouldShowTip(on({ introduced: false, lastTipDate: null }), TODAY)).toBe(false);
  });

  it.each([[null], [undefined], ['x'], [42]])('битые настройки %s → false, без исключения', (settings) => {
    expect(shouldShowTip(settings, TODAY)).toBe(false);
  });

  it.each([[''], ['13.10.2026'], [undefined]])('некорректная сегодняшняя дата %s → false', (today) => {
    expect(shouldShowTip(on({ lastTipDate: null }), today)).toBe(false);
  });
});
