import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'roughjs/bin/rough': resolve(
        __dirname,
        'node_modules/roughjs/bin/rough.js'
      ),
      'roughjs/bin/generator': resolve(
        __dirname,
        'node_modules/roughjs/bin/generator.js'
      ),
      'roughjs/bin/math': resolve(
        __dirname,
        'node_modules/roughjs/bin/math.js'
      ),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        editor: resolve(__dirname, 'editor.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    server: {
      deps: {
        inline: ['@excalidraw/excalidraw'],
      },
    },
  },
});
