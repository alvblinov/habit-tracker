# Validation — 001-habit-tracker-v1, прогон 01

**Итоговый статус: BLOCKED**

Unit-тесты и сборка прошли. Браузерные тесты не выполнились ни разу: Playwright не
смог подключиться к локальному preview-серверу, потому что песочница окружения блокирует
локальные TCP-подключения. Сами e2e-тесты не запускались, поэтому о дефектах приложения
по ним ничего сказать нельзя.

## Окружение

- Время: 2026-10-13 10:28:16 – 10:32:37 (+03:00)
- Рабочая папка: `C:\Users\1\Documents\habit-tracker`
- base_ref: `4886a039b8f1084c2bd2cfb6d8b2505f213a7924`
- HEAD: `4886a039b8f1084c2bd2cfb6d8b2505f213a7924` (изменения не закоммичены)
- Node v24.20.0, npm 11.19.0, Windows 10, Git Bash
- Команды взяты из README.md и сверены со scripts в package.json (`test:unit` = `vitest run`,
  `test:e2e` = `playwright test`, `build` = `vite build`).

## Изменённые и новые файлы (`git status --porcelain --untracked-files=all`)

Проиндексированных (staged) изменений нет.

| Статус | Файл |
|---|---|
| M | STATUS.md |
| M | index.html |
| M | src/main.js |
| M | src/style.css |
| D | tests/e2e/.gitkeep |
| D | tests/unit/.gitkeep |
| ?? | plans/001-habit-tracker-v1.md |
| ?? | reports/001-habit-tracker-v1/01/implementation.md |
| ?? | reports/001-habit-tracker-v1/01/tests.md |
| ?? | src/dates.js |
| ?? | src/habits.js |
| ?? | src/storage.js |
| ?? | tests/e2e/habits.spec.js |
| ?? | tests/unit/dates.test.js |
| ?? | tests/unit/habits.test.js |
| ?? | tests/unit/storage.test.js |

Логи (`*.log`) и этот файл в этот список не попали (логи, по-видимому, исключены через .gitignore).
Из артефактов команд создан `dist/`.

## Результаты команд

### 1. Тесты логики — PASSED

- Команда: `npm run test:unit`
- Exit code: 0
- Итог: Vitest v5.0.4, найдено и пройдено тестовых файлов: 3 из 3; тестов: 58 пройдено, 0 упало, 0 пропущено.
- Лог: `reports/001-habit-tracker-v1/01/unit.log`

### 2. Браузерные тесты — BLOCKED (окружение)

- Команда: `npm run test:e2e`
- Exit code: 1
- Итог: ни один тест не запустился (пройдено/упало/пропущено — нет данных).
- Ошибка:
  ```
  Error: Timed out waiting 60000ms from config.webServer.
  ```
- Лог: `reports/001-habit-tracker-v1/01/e2e.log`
- Сначала был пробный запуск `npx playwright test --reporter=list` с тем же результатом;
  его лог перезаписан запуском точной команды.
- Диагностика (лог `reports/001-habit-tracker-v1/01/webserver-diag.log`): вручную запустил команду
  webServer из playwright.config.js (`npm run build && npm run preview -- --port 4173 --strictPort`).
  Сборка прошла, preview сообщил `Local: http://localhost:4173/`, netstat показал
  `[::1]:4173 LISTENING`. Но любое подключение к серверу из этой оболочки отклоняется песочницей:
  ```
  * Trying [::1]:4173...
  * connect to ::1 port 4173 from :: port 64188 failed: Bad access
  ```
  Для `localhost` и `127.0.0.1` тоже вернулся код 000. Поэтому Playwright не может дождаться готовности
  `http://localhost:4173`. Причина — ограничение окружения (песочница запрещает
  сетевые подключения к localhost), а не результат работы тестов. Диагностический сервер остановлен,
  порт 4173 освобождён.
- Песочницу и разрешения не отключал: обходить это ограничение запрещено.
- Что нужно для разблокировки: запустить `npm run test:e2e` в обычном терминале пользователя
  или в окружении, где разрешены подключения к localhost.

### 3. Сборка — PASSED

- Команда: `npm run build`
- Exit code: 0
- Итог: vite v8.3.4, преобразовано 8 модулей; `dist/index.html` 1.42 kB,
  `dist/assets/index-POLUfRPK.css` 3.14 kB, `dist/assets/index-WESRn-Lk.js` 6.60 kB; built in 72ms.
- Лог: `reports/001-habit-tracker-v1/01/build.log`

## Что не запущено

- Браузерные тесты `tests/e2e/habits.spec.js`: не дошли до выполнения, причина описана выше.
- Аудит (пункт 4 плана) и ручная приёмка (пункт 5) в задачу этой роли не входят и не выполнялись.

## Вывод

Выполненные проверки подтверждают только следующее: 58 unit-тестов логики проходят, и проект собирается.
Поведение в браузере (AC-1…AC-9 в e2e, включая сохранение после перезагрузки)
этим прогоном **не проверено**. Статус: BLOCKED.
