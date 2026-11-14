import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Dev server proxies every backend-owned path to Django so the browser always
 * talks to a single origin (the backend has no CORS origins configured and
 * keeps its CSRF cookie HttpOnly, so same-origin is the supported setup).
 *
 * VITE_PROXY_TARGET is only read here (Node side) and never shipped to the browser.
 */
const BACKEND_PATHS = ['/api', '/accounts', '/users', '/static'];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8000';
  // Vite rejects unknown Host headers (DNS-rebinding protection); IPs and localhost are always allowed.
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  const httpProxy = Object.fromEntries(
    BACKEND_PATHS.map((path) => [path, { target, changeOrigin: false }]),
  );

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts,
      proxy: {
        ...httpProxy,
        '/ws': { target: target.replace(/^http/, 'ws'), ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // Never inline assets as data: URIs — the CSP only allows fonts/images from 'self'.
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 600,
    },
  };
});
