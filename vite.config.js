import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createApp } from './server/app.js';

function apiPlugin() {
  return {
    name: 'local-api',
    configureServer(server) {
      const app = createApp();
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api')) {
          return app(req, res, next);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [apiPlugin()],
  server: {
    host: true,   // 或 host: '0.0.0.0'
    port: 5173,
    open: '/',
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        video: resolve(__dirname, 'video/index.html'),
      },
    },
  },
});
