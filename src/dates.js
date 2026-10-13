// Работа с локальными календарными датами в формате YYYY-MM-DD.
// Никаких UTC-преобразований (toISOString): «сегодня» — это день пользователя.

const pad2 = (n) => String(n).padStart(2, '0');

/** Локальная дата объекта Date в виде 'YYYY-MM-DD'. */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Ключ 'YYYY-MM-DD' → локальный Date (полночь этого дня). */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Проверяет, что строка — существующая календарная дата 'YYYY-MM-DD'. */
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(fromDateKey(value)) === value;
}

/** Сдвиг даты на n календарных дней (n может быть отрицательным). */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

/** Массив из n ключей подряд, от самого старого к todayKey (последний = сегодня). */
export function lastNDays(todayKey, n) {
  const days = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    days.push(addDays(todayKey, -i));
  }
  return days;
}
