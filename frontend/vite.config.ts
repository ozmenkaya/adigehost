import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev'de backend'e proxy — CORS'suz çalışmak için
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // DİKKAT: canlı servis dizini `frontend/dist`, ve o bir symlink
    // (`releases/<sürüm>`'e bakar). Build çıktısı bilerek servis EDİLMEYEN
    // bir dizine yazılır — böylece doğrulama amaçlı alınan bir build canlıyı
    // etkilemez. Yayınlamayı yalnızca deploy/scripts/deploy.sh yapar.
    outDir: 'build-out',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    // noVNC (rfb) top-level await kullanır → es2022 hedefi gerekir.
    target: 'es2022',
  },
});
