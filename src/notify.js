// Тонкая обёртка над браузерным Notification API.

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'granted' | 'denied' | 'default' | 'unsupported'. */
export function notificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return window.Notification.permission;
}

/**
 * Запрашивает разрешение, только если пользователь ещё не решал ('default').
 * Вызывать из обработчика действия пользователя (сохранение напоминания).
 * Возвращает Promise с итоговым статусом.
 */
export async function ensurePermission() {
  if (!notificationsSupported()) return 'unsupported';
  const { Notification } = window;
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    const result = await Notification.requestPermission();
    return result || Notification.permission;
  } catch {
    return Notification.permission;
  }
}

/**
 * Показывает системное уведомление. true — показано; false — не разрешено,
 * не поддерживается или браузер отказал (тогда показываем плашку на странице).
 * tag одинаковый у разных вкладок, поэтому система не дублирует уведомление.
 */
export function showNotification({ title, tag }) {
  if (notificationPermission() !== 'granted') return false;
  try {
    const notification = new window.Notification(title, { tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
