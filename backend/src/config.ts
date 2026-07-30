/**
 * Configuration, read from the environment.
 *
 * The REST port is the only thing worth setting; it lives in the repository root's
 * `.env` so the frontend's dev proxy reads the same value (see `.envrc` and
 * `.env.example`). The defaults here match that file, so no `.env` is required.
 */

/** Flat while it holds only the listen address. Group by concern if it grows. */
interface AppConfig {
  readonly host: string;
  readonly port: number;
}

type Env = Record<string, string | undefined>;

function text(env: Env, key: string, fallback: string): string {
  const value = env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/**
 * Decimal digits only. `Number` would take `0x1f` as 31 and `1e4` as 10000, which is
 * the opposite of what a validator here is for: a typo should fail loudly at startup,
 * not turn into a port nobody asked for.
 */
function port(env: Env, key: string, fallback: number): number {
  const value = env[key]?.trim();
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${key} must be a whole number, got ${JSON.stringify(value)}`);
  }
  const parsed = Number(value);
  // Range-checked here rather than left to `app.listen`, which fails with an opaque
  // `ERR_SOCKET_BAD_PORT` naming neither the variable nor the value.
  if (parsed < 1 || parsed > 65535) {
    throw new Error(`${key} must be a port between 1 and 65535, got ${value}`);
  }
  return parsed;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    host: text(env, 'LEASING_HTTP_HOST', '127.0.0.1'),
    // Not 8080: cn-quickstart's `backend-service` container publishes 8080 on all
    // interfaces, so anything reaching 127.0.0.1:8080 lands in Spring Security there
    // and comes back 401 — including endpoints this app serves unauthenticated. The
    // default matches `.env.example` so a fresh clone works without one.
    port: port(env, 'LEASING_HTTP_PORT', 8081),
  };
}
