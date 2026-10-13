# Трекер привычек

Учебный проект курса «Вайбкодинг». Сайт, где любой человек без регистрации
добавляет привычки, отмечает их выполнение по дням и видит серию дней подряд
и сетку за 30 дней. Данные хранятся в браузере (localStorage).

Цель, первая версия и критерии приёмки — в [GOAL.md](GOAL.md),
текущее состояние — в [STATUS.md](STATUS.md).

## Стек

HTML/CSS, JavaScript, [Vite](https://vite.dev), [Vitest](https://vitest.dev)
для логики, [Playwright](https://playwright.dev) для браузерных тестов.

## Установка

Нужен Node.js 20+ (проверено на 24.20).

```bash
npm install
npx playwright install chromium
```

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер с перезагрузкой, http://localhost:5173 |
| `npm run build` | сборка в `dist/` |
| `npm run preview` | просмотр собранной версии |
| `npm run test:unit` | unit-тесты логики (Vitest, без watch), `tests/unit/` |
| `npm run test:e2e` | браузерные тесты (Playwright, Chromium), `tests/e2e/`; сам собирает и поднимает сайт на порту 4173 |

## Структура

```text
habit-tracker/
├── AGENTS.md, CLAUDE.md   — правила для агентов
├── GOAL.md, STATUS.md     — цель и состояние проекта
├── index.html, src/       — приложение
├── tests/unit, tests/e2e  — тесты
├── plans/                 — планы итераций
├── reports/               — отчёты implement (реализация, тесты, запуск, аудит)
├── .claude/               — скиллы и роли для Claude Code
└── .agents/, .codex/      — исходная конфигурация курса для Codex
```

## Пайплайн разработки

1. Интервью (`interview-me`) → GOAL.md.
2. План итерации в Plan mode → `plans/NNN-*.md`.
3. Скилл `implement`: demo-implementer → demo-test-writer → demo-test-runner →
   demo-auditor, отчёты в `reports/NNN-*/NN/`.
4. Ручная приёмка, просмотр diff, коммит и push.
