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
});
