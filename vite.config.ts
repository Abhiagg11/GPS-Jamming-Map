import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      // The data provider currently restricts browser CORS to its own website.
      // The development proxy lets this Codespace request the public API safely.
      '/api/interference': {
        target: 'https://api.gpsinterference.com',
        changeOrigin: true,
        rewrite: () => '/v1/interference/latest',
        secure: true,
      },
      '/api/airports.csv': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: () => '/davidmegginson/ourairports-data/main/airports.csv',
        secure: true,
      },
    },
  },
});
