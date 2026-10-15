import { describe, it, expect } from 'vitest';
import { THEME_KEY, normalizeTheme, resolveTheme, toggleTheme } from '../../src/theme.js';
import { STORAGE_KEY } from '../../src/storage.js';

// Итерация 005: тёмная тема (AC-35).
describe('THEME_KEY', () => {
  it('отдельный ключ проекта, не совпадает с ключом данных привычек', () => {
    expect(THEME_KEY).toBe('habit-tracker:theme');
    expect(THEME_KEY).not.toBe(STORAGE_KEY);
  });
});

describe('normalizeTheme', () => {
  it.each(['light', 'dark'])('%s → как есть', (value) => {
    expect(normalizeTheme(value)).toBe(value);
  });

  it.each([
    ['null (выбора нет)', null],
    ['undefined', undefined],
    ['пустая строка', ''],
    ['неизвестное значение', 'purple'],
    ['другой регистр', 'Dark'],
    ['system', 'system'],
    ['число', 1],
    ['true', true],
  ])('%s → null', (_title, raw) => {
    expect(normalizeTheme(raw)).toBeNull();
  });
});

describe('resolveTheme', () => {
  it('без ручного выбора — по системной настройке', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('ручной выбор важнее системной настройки', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('битое сохранённое значение игнорируется — работает системная тема', () => {
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme('purple', false)).toBe('light');
    expect(resolveTheme('', true)).toBe('dark');
  });
});

describe('toggleTheme', () => {
  it('переключает светлую ↔ тёмную', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('двойное переключение возвращает исходную тему', () => {
    expect(toggleTheme(toggleTheme('dark'))).toBe('dark');
    expect(toggleTheme(toggleTheme('light'))).toBe('light');
  });
});
