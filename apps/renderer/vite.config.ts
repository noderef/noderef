/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import react from '@vitejs/plugin-react';
import strip from '@rollup/plugin-strip';
import { visualizer } from 'rollup-plugin-visualizer';
import { copyFileSync, existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    ...(command === 'build'
      ? [
          strip({
            include: ['**/*.{js,jsx,ts,tsx}'],
            // Keep console.log that starts with [RPC] or [Neutralino] for debugging
            functions: ['console.log', 'console.debug', 'console.info'],
            debugger: true,
            // Don't strip console.error or console.warn - we need those for debugging
          }),
        ]
      : []),
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            open: false,
            filename: path.resolve(__dirname, '../../stats.html'),
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
    {
      name: 'copy-neutralino',
      configureServer(server) {
        // Copy neutralino.js to public/ for dev server
        const neutralinoSrc = require.resolve('@neutralinojs/lib/dist/neutralino.js');
        const neutralinoPublicDest = path.resolve(__dirname, './public/neutralino.js');
        try {
          copyFileSync(neutralinoSrc, neutralinoPublicDest);
          console.log('✓ Copied neutralino.js to public/ for dev server');
        } catch (err) {
          console.warn('⚠ Failed to copy neutralino.js to public:', err);
        }

        // Serve .tmp/auth_info.json for Neutralino detection
        server.middlewares.use('/.tmp/auth_info.json', (req, res, _next) => {
          const authInfoPath = path.resolve(__dirname, '../../.tmp/auth_info.json');
          if (existsSync(authInfoPath)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(readFileSync(authInfoPath, 'utf-8'));
          } else {
            res.statusCode = 404;
            res.end('Not found');
          }
        });
      },
      closeBundle() {
        // Copy neutralino.js to resources/ for production build
        const neutralinoSrc = require.resolve('@neutralinojs/lib/dist/neutralino.js');
        const neutralinoDest = path.resolve(__dirname, '../../resources/neutralino.js');
        try {
          copyFileSync(neutralinoSrc, neutralinoDest);
          console.log('✓ Copied neutralino.js to resources/');
        } catch (err) {
          console.warn('⚠ Failed to copy neutralino.js:', err);
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../../resources',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1', // Use IPv4 to avoid macOS EPERM on ::1
    port: 3000,
    strictPort: true,
    middlewareMode: false,
    fs: {
      // Allow serving files from project root (for .tmp/auth_info.json and Monaco Editor assets)
      allow: ['..', '../..'],
    },
  },
}));
