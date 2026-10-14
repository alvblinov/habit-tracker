// Тема оформления: чистая логика без DOM и без доступа к хранилищу.
// Чтение/запись выбора и атрибут data-theme на <html> — в main.js (и inline-скрипт в index.html).

export const THEME_KEY = 'habit-tracker:theme';

/** 'light' | 'dark' для корректного значения, иначе null (выбор не сделан). */
export function normalizeTheme(raw) {
  return raw === 'light' || raw === 'dark' ? raw : null;
}

/** Итоговая тема: ручной выбор важнее настройки системы. */
export function resolveTheme(saved, systemPrefersDark) {
  return normalizeTheme(saved) ?? (systemPrefersDark ? 'dark' : 'light');
}

/** Противоположная тема. */
export function toggleTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}
