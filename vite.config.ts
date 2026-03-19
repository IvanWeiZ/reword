import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chrome extension needs separate builds:
// - service-worker: ESM (has "type": "module" in manifest)
// - content script: IIFE (no module support in content scripts)
// - options page: IIFE (loaded via <script> tag)

function createBuild(name: string, entry: string, format: 'es' | 'iife') {
  return {
    rollupOptions: {
      input: { [name]: resolve(__dirname, entry) },
      output: {
        format,
        entryFileNames: '[name].js',
        dir: 'dist',
      },
    },
    target: 'ES2022' as const,
    minify: false,
    sourcemap: true,
    emptyOutDir: false,
  };
}

// We'll use a multi-pass approach via a custom plugin
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        dir: 'dist',
      },
    },
    target: 'ES2022',
    minify: false,
    sourcemap: true,
  },
  plugins: [
    {
      name: 'copy-manifest-and-html',
      writeBundle() {
        copyFileSync('manifest.json', join('dist', 'manifest.json'));
        mkdirSync(join('dist', 'options'), { recursive: true });
        copyFileSync('src/options/options.html', join('dist', 'options', 'options.html'));
        copyFileSync('src/options/options.css', join('dist', 'options', 'options.css'));
        if (existsSync('src/assets')) {
          cpSync(join('src', 'assets'), join('dist', 'assets'), { recursive: true });
        }
      },
    },
  ],
});
