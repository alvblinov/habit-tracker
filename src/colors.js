// Палитра цветов привычек: чистая логика без DOM.
// В данных и в атрибуте data-color хранится только ключ палитры, сами цвета — в style.css.

export const PALETTE = ['teal', 'purple', 'coral', 'pink', 'blue', 'green', 'amber', 'gray'];

/** Русские названия цветов (для aria-label в форме ✏️). */
export const COLOR_LABELS = {
  teal: 'бирюзовый',
  purple: 'фиолетовый',
  coral: 'коралловый',
  pink: 'розовый',
  blue: 'синий',
  green: 'зелёный',
  amber: 'янтарный',
  gray: 'серый',
};

/** Ключ палитры или null для всего остального. */
export function normalizeColor(raw) {
  return typeof raw === 'string' && PALETTE.includes(raw) ? raw : null;
}

/**
 * Цвет для новой привычки: первый ключ палитры, не занятый другими привычками;
 * если заняты все — по кругу по позиции новой привычки (habits.length % 8).
 */
export function nextFreeColor(habits = []) {
  const list = Array.isArray(habits) ? habits : [];
  const used = new Set(list.map((h) => normalizeColor(h?.color)).filter(Boolean));
  const free = PALETTE.find((key) => !used.has(key));
  return free ?? PALETTE[list.length % PALETTE.length];
}
