import { defineConfig, build } from 'vite';
import { resolve } from 'path';

function extensionScriptsPlugin() {
  return {
    name: 'extension-scripts-builder',
    async closeBundle() {
      // 1. Bundle content.js as self-contained IIFE
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: 'dist',
          lib: {
            entry: resolve(__dirname, 'src/content-script/content.ts'),
            name: 'WATContentScript',
            formats: ['iife'],
            fileName: () => 'content.js',
          },
        },
      });

      // 2. Bundle injected.js as self-contained IIFE
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: 'dist',
          lib: {
            entry: resolve(__dirname, 'src/main-world/injected.ts'),
            name: 'WATInjectedScript',
            formats: ['iife'],
            fileName: () => 'injected.js',
          },
        },
      });

      // 3. Bundle service-worker.js as self-contained IIFE
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: 'dist',
          lib: {
            entry: resolve(__dirname, 'src/background/service-worker.ts'),
            name: 'WATServiceWorker',
            formats: ['iife'],
            fileName: () => 'service-worker.js',
          },
        },
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [extensionScriptsPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
