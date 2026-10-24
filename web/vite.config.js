import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH muss zum Server passen (Standard: marmot -> UI unter /marmot/)
const seg = (process.env.BASE_PATH ?? 'marmot').replace(/^\/+|\/+$/g, '');
const base = seg ? `/${seg}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { proxy: { [`${base}api`]: 'http://127.0.0.1:8080' } },
});
