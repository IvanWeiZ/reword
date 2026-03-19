import { build } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { copyFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const entries = [
  { name: 'service-worker', path: 'src/background/service-worker.ts', format: 'es' as const },
  { name: 'shadow-pierce', path: 'src/content/shadow-pierce.ts', format: 'iife' as const },
  { name: 'content', path: 'src/content/index.ts', format: 'iife' as const },
  { name: 'options', path: 'src/options/options.ts', format: 'iife' as const },
];

// Clean dist
if (existsSync('dist')) {
  rmSync('dist', { recursive: true });
}
mkdirSync('dist', { recursive: true });

for (const entry of entries) {
  await build({
    configFile: false,
    build: {
      rollupOptions: {
        input: { [entry.name]: resolve(__dirname, entry.path) },
        output: {
          format: entry.format,
          entryFileNames: '[name].js',
          dir: 'dist',
        },
      },
      target: 'ES2022',
      minify: false,
      sourcemap: true,
      emptyOutDir: false,
    },
  });
}

// Copy static files
copyFileSync('manifest.json', join('dist', 'manifest.json'));
mkdirSync(join('dist', 'options'), { recursive: true });
copyFileSync('src/options/options.html', join('dist', 'options', 'options.html'));
copyFileSync('src/options/options.css', join('dist', 'options', 'options.css'));
if (existsSync('src/assets')) {
  cpSync(join('src', 'assets'), join('dist', 'assets'), { recursive: true });
}

console.log('\n✓ Extension built to dist/');
