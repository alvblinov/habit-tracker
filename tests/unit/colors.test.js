import { describe, it, expect } from 'vitest';
import { PALETTE, COLOR_LABELS, normalizeColor, nextFreeColor } from '../../src/colors.js';

// Итерация 005: палитра цветов привычек (AC-32).
const ORDER = ['teal', 'purple', 'coral', 'pink', 'blue', 'green', 'amber', 'gray'];
const withColors = (...colors) => colors.map((color, i) => ({ id: `h${i}`, color }));

describe('PALETTE и COLOR_LABELS', () => {
  it('8 цветов в порядке из требований, без повторов', () => {
    expect(PALETTE).toEqual(ORDER);
    expect(new Set(PALETTE).size).toBe(8);
  });

  it('у каждого цвета есть непустое русское название, названия различаются', () => {
    const labels = PALETTE.map((key) => COLOR_LABELS[key]);
    for (const label of labels) {
      expect(typeof label).toBe('string');
      expect(label.trim()).not.toBe('');
      expect(label).toMatch(/[а-яё]/i);
    }
    expect(new Set(labels).size).toBe(8);
    expect(COLOR_LABELS.teal).toBe('бирюзовый');
    expect(COLOR_LABELS.gray).toBe('серый');
  });
});

describe('normalizeColor', () => {
  it.each(ORDER)('ключ палитры %s возвращается как есть', (key) => {
    expect(normalizeColor(key)).toBe(key);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['пустая строка', ''],
    ['неизвестный ключ', 'neon'],
    ['другой регистр', 'Teal'],
    ['пробелы вокруг', ' teal '],
    ['HEX вне палитры', '#ff0000'],
    ['CSS-инъекция', 'teal; background: red'],
    ['число', 3],
    ['массив', ['teal']],
    ['объект', { color: 'teal' }],
  ])('не ключ палитры (%s) → null', (_title, raw) => {
    expect(normalizeColor(raw)).toBeNull();
  });
});

describe('nextFreeColor', () => {
  it('пустой список → первый цвет палитры', () => {
    expect(nextFreeColor([])).toBe('teal');
  });

  it('первый свободный ключ палитры, а не следующий после последнего', () => {
    expect(nextFreeColor(withColors('teal'))).toBe('purple');
    expect(nextFreeColor(withColors('teal', 'coral'))).toBe('purple');
    expect(nextFreeColor(withColors('purple', 'teal', 'pink'))).toBe('coral');
  });

  it('семь занятых → оставшийся восьмой', () => {
    expect(nextFreeColor(withColors('teal', 'purple', 'coral', 'pink', 'blue', 'green', 'gray'))).toBe('amber');
  });

  it('цвет не совпадает ни с одним занятым, пока есть свободные', () => {
    const habits = [];
    for (let i = 0; i < 8; i += 1) {
      const color = nextFreeColor(habits);
      expect(PALETTE).toContain(color);
      expect(habits.map((h) => h.color)).not.toContain(color);
      habits.push({ id: `h${i}`, color });
    }
    expect(new Set(habits.map((h) => h.color)).size).toBe(8);
  });

  it('все 8 заняты → по кругу по позиции новой привычки', () => {
    expect(nextFreeColor(withColors(...ORDER))).toBe('teal');
    expect(nextFreeColor(withColors(...ORDER, 'teal'))).toBe('purple');
    expect(nextFreeColor(withColors(...ORDER, 'teal', 'teal', 'teal'))).toBe('pink');
  });

  it('битые и отсутствующие цвета не считаются занятыми', () => {
    expect(nextFreeColor([{ id: 'a' }, { id: 'b', color: 'neon' }, { id: 'c', color: 'teal' }])).toBe('purple');
  });

  it('не изменяет входной список', () => {
    const habits = withColors('teal', 'purple');
    const copy = JSON.parse(JSON.stringify(habits));
    nextFreeColor(habits);
    expect(habits).toEqual(copy);
  });
});
