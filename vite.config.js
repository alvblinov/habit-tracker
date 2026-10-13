import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути к ресурсам: сайт работает и на localhost, и в подпапке
  // GitHub Pages (https://alvblinov.github.io/habit-tracker/).
  base: './',
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
