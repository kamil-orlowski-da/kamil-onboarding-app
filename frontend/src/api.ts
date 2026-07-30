/**
 * The one HTTP client, built from `common/openapi.yaml` — imported as a module (see
 * `ViteYaml` in `vite.config.ts`), so the client comes from the same file the
 * backend implements. With the generated types in `openapi.d.ts`, an API change
 * breaks the *build* rather than failing silently at runtime.
 *
 * `withServer` overrides the document's `servers:` entry so requests are
 * same-origin for the dev proxy, which strips `/api` again before the backend.
 *
 * Never call `axios` or `fetch` directly — going through the client is what keeps
 * every call type-checked against the spec.
 */

import OpenAPIClientAxios, { type Document } from 'openapi-client-axios';

import openApi from '../../common/openapi.yaml';
import type { Client } from './openapi';
import { currentParty } from './session';

const api: OpenAPIClientAxios = new OpenAPIClientAxios({
  definition: openApi as Document,
  withServer: { url: '/api' },
});

api.init();

let client: Promise<Client> | undefined;

/**
 * The typed client, with the current party attached. Use this rather than
 * `api.getClient()`: it is the one place `Authorization` is set. The interceptor
 * reads the party per request rather than closing over it, so logging in and out
 * takes effect immediately.
 *
 * Memoised so the interceptor is installed exactly once — per-call registration
 * would stack duplicates on the same axios instance.
 */
export function getClient(): Promise<Client> {
  client ??= api.getClient<Client>().then((initialized) => {
    initialized.interceptors.request.use((config) => {
      const party = currentParty();
      if (party !== null) config.headers.Authorization = `Bearer ${party}`;
      return config;
    });
    return initialized;
  });
  return client;
}
