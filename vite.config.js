import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite + React configuration.
// No extra plugins are required for this prototype.
export default defineConfig({
  plugins: [react()],
  server: {
    // Open the browser automatically when `npm run dev` starts.
    open: true,
  },
  // Vitest configuration (unit + component tests).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}', 'tests/**/*.{test,spec}.{js,jsx}'],
  },
});
