import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMOJIS } from '../../src/habits.js';
import { HAS_ANIMATION, emojiCode, staticEmojiUrl, animatedEmojiUrl } from '../../src/emoji-assets.js';

// Итерация 005, дополнение (прогон 02): эмодзи Google Noto картинками (AC-37, AC-38).
// Имя файла — коды символа в hex через «_», нижний регистр (как в наборе Noto).
const CODES = {
  '💧': '1f4a7',
  '📚': '1f4da',
  '🏃': '1f3c3',
  '🧘': '1f9d8',
  '🥗': '1f957',
  '😴': '1f634',
  '✍️': '270d_fe0f',
  '💊': '1f48a',
  '🎸': '1f3b8',
  '🧹': '1f9f9',
  '🌱': '1f331',
  '⭐': '2b50',
};
const NO_ANIMATION = ['🏃', '🧘', '💊'];
const WITH_ANIMATION = EMOJIS.filter((e) => !NO_ANIMATION.includes(e));

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const publicFile = (relative) => `${PUBLIC_DIR}${relative}`;

describe('набор эмодзи', () => {
  it('для всех 12 эмодзи набора известен ожидаемый код (набор не расширялся)', () => {
    expect(EMOJIS).toHaveLength(12);
    expect([...EMOJIS].sort()).toEqual(Object.keys(CODES).sort());
  });
});

describe('emojiCode', () => {
  it.each(Object.entries(CODES))('%s → %s', (char, code) => {
    expect(emojiCode(char)).toBe(code);
  });

  it('✍️ включает селектор варианта fe0f; ✍ без селектора — только 270d', () => {
    expect(emojiCode('✍️')).toBe('270d_fe0f');
    expect(emojiCode('✍')).toBe('270d');
  });

  it('коды в нижнем регистре, без префикса U+ и 0x', () => {
    for (const char of EMOJIS) expect(emojiCode(char)).toMatch(/^[0-9a-f]+(_[0-9a-f]+)*$/);
  });

  it.each([[''], [null], [undefined], [42], [{}]])('некорректный ввод %p → пустая строка, без исключения', (value) => {
    expect(emojiCode(value)).toBe('');
  });
});

describe('staticEmojiUrl', () => {
  it.each(Object.entries(CODES))('%s → emoji/%s.svg', (char, code) => {
    expect(staticEmojiUrl(char)).toBe(`emoji/${code}.svg`);
  });

  it('путь относительный и локальный (без «/» в начале, без протокола и внешнего хоста)', () => {
    for (const char of EMOJIS) {
      const url = staticEmojiUrl(char);
      expect(url.startsWith('/')).toBe(false);
      expect(url).not.toMatch(/^[a-z]+:|\/\//i);
    }
  });
});

describe('animatedEmojiUrl', () => {
  it.each(NO_ANIMATION)('%s → null (у Noto нет анимации — только эффект)', (char) => {
    expect(animatedEmojiUrl(char)).toBeNull();
  });

  it.each(WITH_ANIMATION)('%s → emoji/<код>.webp', (char) => {
    expect(animatedEmojiUrl(char)).toBe(`emoji/${CODES[char]}.webp`);
  });

  it('анимация есть ровно у 9 эмодзи', () => {
    expect(WITH_ANIMATION).toHaveLength(9);
    expect(EMOJIS.filter((e) => animatedEmojiUrl(e) !== null)).toEqual(WITH_ANIMATION);
    expect(HAS_ANIMATION.size).toBe(9);
    for (const char of WITH_ANIMATION) expect(HAS_ANIMATION.has(CODES[char])).toBe(true);
    for (const char of NO_ANIMATION) expect(HAS_ANIMATION.has(CODES[char])).toBe(false);
  });

  it('неизвестный символ и некорректный ввод → null', () => {
    expect(animatedEmojiUrl('🦄')).toBeNull();
    expect(animatedEmojiUrl('')).toBeNull();
    expect(animatedEmojiUrl(null)).toBeNull();
  });

  it('путь относительный и локальный', () => {
    for (const char of WITH_ANIMATION) {
      const url = animatedEmojiUrl(char);
      expect(url.startsWith('/')).toBe(false);
      expect(url).not.toMatch(/^[a-z]+:|\/\//i);
    }
  });
});

describe('файлы в public/emoji/ (Vite копирует public/ в сборку)', () => {
  it.each(EMOJIS)('статичная картинка для %s существует и не пустая', (char) => {
    const file = publicFile(staticEmojiUrl(char));
    expect(existsSync(file), file).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
    expect(readFileSync(file, 'utf8')).toMatch(/<svg[\s>]/);
  });

  it.each(WITH_ANIMATION)('анимация для %s существует и это WebP', (char) => {
    const file = publicFile(animatedEmojiUrl(char));
    expect(existsSync(file), file).toBe(true);
    const bytes = readFileSync(file);
    // Сигнатура WebP: «RIFF» … «WEBP».
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('всего 12 SVG и 9 WebP, на которые ссылается логика, все на месте', () => {
    const svgs = EMOJIS.map(staticEmojiUrl).filter((u) => existsSync(publicFile(u)));
    const webps = EMOJIS.map(animatedEmojiUrl).filter((u) => u !== null && existsSync(publicFile(u)));
    expect(new Set(svgs).size).toBe(12);
    expect(new Set(webps).size).toBe(9);
  });

  it('SVG не содержат скриптов и загрузок с внешних адресов', () => {
    for (const char of EMOJIS) {
      const text = readFileSync(publicFile(staticEmojiUrl(char)), 'utf8');
      expect(text, char).not.toMatch(/<script/i);
      expect(text, char).not.toMatch(/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i);
      expect(text, char).not.toMatch(/url\(\s*["']?\s*(?:https?:)?\/\//i);
      expect(text, char).not.toMatch(/@import/i);
    }
  });

  it('рядом лежит файл с авторством и лицензиями (AC-39)', () => {
    const file = publicFile('emoji/ATTRIBUTION.md');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/Noto/);
    expect(text).toMatch(/CC BY 4\.0|Apache/);
  });
});
