# Frontend

React + TypeScript + Vite, talking to the backend over REST.

## Running it

```bash
npm install
npm run dev          # generates types, then serves on http://localhost:5173
```

`npm run dev` needs the backend up (`cd ../backend && npm run dev`); the Vite proxy
forwards `/api` to it.

Both sides read that port from the repository root's `.env` — `LEASING_HTTP_PORT`
for the backend, `VITE_BACKEND_PORT` for the proxy — and default to 8081 when it is
absent, which is what `.env.example` documents. Keep the two values equal, or the
proxy forwards to nothing.

The home page is the whole app so far: register car dealers, leasing companies and
customers, then click a name to act as them. No password — the party id is the
bearer token, which is why the backend must not leave localhost.

## Generated types

`src/openapi.d.ts` does not exist until you generate it:

```bash
npm run gen:openapi
```

`dev` and `build` both run this first, so the types cannot drift from
`common/openapi.yaml`. It is gitignored for the same reason — the spec is the
source of truth, and a committed copy is one more thing to go stale.

If your editor reports that `../openapi` cannot be resolved, that is the missing
generated file, not a broken import.

## Architecture

Everything goes through the backend's REST endpoints — the frontend holds no
credential, makes no authorization decision and knows nothing about how state is
stored. `src/api.ts` builds the one typed client from `common/openapi.yaml`; never
call `axios` or `fetch` directly, or the call escapes type-checking against the
spec.

## Adding a domain

Four steps, in this order — the first one is what makes the rest type-check:

1. Add the paths and schemas to `common/openapi.yaml`.
2. Implement them in `backend/`.
3. `npm run gen:openapi`, then add a store under `src/stores/`: a context, a
   provider holding the state, and one `useCallback` per operation, each run through
   `run` from `src/utils/error.ts`. Nest the provider in `App.tsx`.
4. Add a view under `src/views/` and a route in `App.tsx`.

One thing to get right in step 3: **reads go stale.** State changes underneath you
when another party acts, and nothing pushes that here. Poll on an interval
(`setInterval`, 5s, cleared on unmount) and re-read after every write rather than
patching local state from the response — the response tells you what one operation
did, not what the state now is.
