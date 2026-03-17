import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, copyFileSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content': resolve(__dirname, 'src/content/index.ts'),
        'options': resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
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
        cpSync('assets', join('dist', 'assets'), { recursive: true });
      },
    },
  ],
});
