import { defineConfig } from 'vite';
import { resolve } from 'path';

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
        inlineDynamicImports: false,
        manualChunks: undefined,
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
        const fs = require('fs');
        const path = require('path');
        fs.copyFileSync('manifest.json', path.join('dist', 'manifest.json'));
        fs.mkdirSync(path.join('dist', 'options'), { recursive: true });
        fs.copyFileSync('src/options/options.html', path.join('dist', 'options', 'options.html'));
        fs.copyFileSync('src/options/options.css', path.join('dist', 'options', 'options.css'));
        fs.cpSync('assets', path.join('dist', 'assets'), { recursive: true });
      },
    },
  ],
});
