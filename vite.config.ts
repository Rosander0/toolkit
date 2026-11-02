import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('pdf-lib')) return 'pdflib';
          if (id.includes('heic2any')) return 'heic';
          if (id.includes('utif')) return 'utif';
          if (id.includes('fflate')) return 'fflate';
        }
      }
    }
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 5173,
    host: '127.0.0.1'
  }
});

