# Vehicle Leasing

What this repository adds on top of [cn-quickstart][], which is otherwise imported
verbatim (see the commit that says so — `README.md` and everything else at this level is
upstream's).

The story: a **car dealer** supplies a vehicle, a **leasing company** finances it and owns
it for the term, a **customer** leases it and may buy it out at the end. So far only the
parties exist. The leasing workflow between them does not — there is no Daml model for it
yet, and `quickstart/daml/` is still upstream's licensing example.

A separate file rather than a section in upstream's `README.md`, so bumping the quickstart
stays a merge instead of a reconciliation.

[cn-quickstart]: https://github.com/digital-asset/cn-quickstart

## What was added

| Where | What |
| --- | --- |
| `quickstart/common/openapi.yaml` | `Parties` tag: `GET /actors`, `POST /car-dealers`, `POST /leasing-companies`, `POST /customers`; the `Role`/`Actor` schemas; `leasingRole` on `AuthenticatedUser` |
| `quickstart/backend/.../registry/PartyRegistry.java` | Who exists and what part they play. In memory, lost on restart |
| `quickstart/backend/.../service/*ApiImpl.java` | `ActorsApiImpl`, `CarDealersApiImpl`, `LeasingCompaniesApiImpl`, `CustomersApiImpl`, and `PartyRequests` for what counts as a valid name |
| `quickstart/backend/.../service/UserApiImpl.java` | Reports the caller's `leasingRole`, if the registry knows one |
| `quickstart/backend/.../security/` | Both filter chains permit the registry paths |
| `quickstart/frontend/src/` | `views/PartiesView.tsx`, `stores/partyStore.tsx`, `roles.ts`, plus the route in `App.tsx` and the nav link in `Header.tsx` |

Everything else the earlier TypeScript version of this app had was dropped, because the
quickstart already answers it: its own config for `config.ts`, real OAuth2 and
shared-secret login for the bearer-token `authenticator.ts` that validated nothing,
generated Spring interfaces and `ResponseStatusException` for the hand-written router and
error classes, Actuator for `/health`, Spring Security for `/logout`, and its existing
`utils/format.ts`, `utils/error.ts` and toast store for ours.

## Running it

From `quickstart/`:

```bash
make setup     # writes .env.local: auth mode, party hint, observability
make start     # builds everything, then brings up LocalNet, PQS, the backend and nginx
make status    # what is up
make stop
```

Then <http://app-provider.localhost:3000>, or `make start-vite-dev` for the frontend with
hot reload on port 5173. **Parties** is in the nav — and stays there when logged out, which
is deliberate (see below).

Backend only, without the browser:

```bash
curl -X POST localhost:8080/car-dealers -H 'Content-Type: application/json' \
  -d '{"name":"Acme Motors"}'          # 201, party "CarDealer::acme-motors"
curl localhost:8080/actors             # everyone, whatever their role
```

## Two things that will look wrong

**The registry is open.** `GET /actors` and the three registrations need no authentication
— they are `permitAll` in both `OAuth2Config` and `SharedSecretConfig`, and the POSTs are
exempt from CSRF. The registry starts empty, so putting registration behind a login would
deadlock, and a party-picker has to list who exists before anyone has been picked. That is
a property of this demo, not a pattern for domain endpoints: registering a party is really
an administrative act, and on a real deployment these entries come from an identity
provider instead.

**Registering a party is not logging in as one.** Identity comes from the quickstart's own
login. The registry only says what part a party plays in the leasing story. The two meet
through the optional `party` field on a registration:

- omit it and the id is derived from the name (`CarDealer::acme-motors`) — enough to fill
  a screen, works from curl, but belongs to no ledger party, so nothing can recognise you
  as it later;
- pass the party id you are logged in as — the **This is me** checkbox on each form — and
  `GET /user` reports that `leasingRole` from then on.

## Adding the leasing workflow

The order that keeps everything type-checked, since the spec is the source of truth for
both sides:

1. Model the contracts in Daml. `quickstart/daml/licensing/` is the worked example, and
   `DamlRepository`/`LedgerApi` show how the backend reads and exercises them.
2. Add the paths and schemas to `quickstart/common/openapi.yaml` — a collection path per
   aggregate plus `{id}:<verb>` for each state transition, which is the convention the
   licensing paths already follow.
3. Implement the generated interface in `quickstart/backend/.../service/`. Interfaces are
   named from the first path segment, so `/leases` gives you `LeasesApi`.
4. `npm run gen:openapi` in `quickstart/frontend`, then a store under `src/stores/` and a
   view under `src/views/`, wired into `App.tsx`.

Two conventions worth keeping whatever the domain grows into: ids stay opaque strings the
client never parses or builds, and anything monetary stays a string end to end — a
`Decimal` schema with pattern `^-?[0-9]+(\.[0-9]+)?$`, never `type: number` — so no money
goes through a binary float.

One thing to get right in step 4: **reads go stale.** State changes underneath you when
another party acts, and nothing pushes that to the browser. Re-read after every write
rather than patching local state from the response, and poll where it matters.
