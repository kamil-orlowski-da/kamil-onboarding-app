/**
 * Two things: `ViteYaml`, so `src/api.ts` can import `common/openapi.yaml` as a
 * module rather than fetching it at runtime, and the `/api` proxy, which makes `npm
 * run dev` work against a backend on another port without CORS.
 *
 * An OAuth2 provider needs a second, unrewritten rule for the redirect path it is
 * configured with — but not for `/login`: proxying that would shadow the client-side
 * route, which works when navigated to in-app and 404s on reload.
 */

import ViteYaml from '@modyfi/vite-plugin-yaml';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ConfigEnv } from 'vite';

export default defineConfig(({ mode }: ConfigEnv) => {
  // Loaded from the repository root, so one `.env` covers backend and frontend.
  const env = loadEnv(mode, '../');
  // Matches `config.ts`'s default, and not 8080 for the reason given there: a
  // published cn-quickstart container answers 401 on that port.
  const backendPort = env['VITE_BACKEND_PORT'] ?? '8081';
  // `127.0.0.1`, not `localhost`: the backend listens on IPv4, and `localhost`
  // resolves to `::1` first on macOS — so anything else on that port over IPv6 (a
  // published Docker port, say) silently wins, and the symptom is an authentication
  // error from a service you are not running.
  const target = `http://127.0.0.1:${backendPort}/`;

  return {
    plugins: [react(), ViteYaml()],
    server: {
      host: 'localhost',
      // Vite's default. Not 3000: cn-quickstart's frontend uses that.
      port: 5173,
      // Fail rather than move: a silently relocated dev server is worse than a
      // refusal to start, and an identity provider's registered redirect URIs name
      // this port literally.
      strictPort: true,
      // `src/api.ts` imports `common/openapi.yaml`, which is outside this root.
      fs: { allow: ['..'] },
      proxy: {
        '/api': {
          target,
          changeOrigin: false,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
