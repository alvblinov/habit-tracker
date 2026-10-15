// Пути к локальным картинкам эмодзи Google Noto (public/emoji/).
// Чистая логика без DOM: имя файла — коды символа в hex через «_», нижний регистр
// (💧 → 1f4a7, ✍️ → 270d_fe0f). Пути относительные — сайт работает и в подпапке.

const EMOJI_DIR = 'emoji/';

// Коды эмодзи, у которых есть анимация Noto (*.webp). У 🏃 🧘 💊 её нет.
export const HAS_ANIMATION = new Set([
  '1f4a7', // 💧
  '1f4da', // 📚
  '1f957', // 🥗
  '1f634', // 😴
  '270d_fe0f', // ✍️
  '1f3b8', // 🎸
  '1f9f9', // 🧹
  '1f331', // 🌱
  '2b50', // ⭐
]);

export function emojiCode(char) {
  if (typeof char !== 'string' || char === '') return '';
  return [...char].map((symbol) => symbol.codePointAt(0).toString(16)).join('_');
}

export function staticEmojiUrl(char) {
  return `${EMOJI_DIR}${emojiCode(char)}.svg`;
}

export function animatedEmojiUrl(char) {
  const code = emojiCode(char);
  return HAS_ANIMATION.has(code) ? `${EMOJI_DIR}${code}.webp` : null;
}
