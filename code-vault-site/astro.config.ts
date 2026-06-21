import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://vault.leverageai.network',
  output: 'static',
  // adapter: cloudflare(),  // uncomment + import for CF Workers SSR/hybrid

  integrations: [
    react(),
    sitemap(),
  ],

  vite: {
    resolve: {
      alias: {
        '@':           resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@layouts':    resolve(__dirname, 'src/layouts'),
        '@lib':        resolve(__dirname, 'src/lib'),
      },
    },
    optimizeDeps: {
      exclude: ['@duckdb/duckdb-wasm'],
    },
  },
});
