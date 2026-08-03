# Vehicle Leasing

What this repository adds on top of [cn-quickstart][], and what it takes away. The
quickstart was imported verbatim first (see the commit that says so — `README.md` and
everything else at this level is upstream's), so everything described here reads as a diff
against it.

The story: a **car dealer** supplies a vehicle, a **leasing company** finances it and owns
it for the term, a **customer** leases it and may buy it out at the end. So far only the
parties exist. The leasing workflow between them does not — there is no Daml model for it
yet, and `demo/daml/` is still upstream's licensing example.

A separate file rather than a section in upstream's `README.md`, so bumping the quickstart
stays a merge instead of a reconciliation. What the quickstart gave us — login, tenant
registration, and the licensing demo that "What was removed" below takes out — is drawn as
sequence diagrams in [QUICKSTART-FLOWS.md](QUICKSTART-FLOWS.md).

[cn-quickstart]: https://github.com/digital-asset/cn-quickstart

## What was added

| Where | What |
| --- | --- |
| `demo/common/openapi.yaml` | `Parties` tag: `GET /actors`, `POST /car-dealers`, `POST /leasing-companies`, `POST /customers`; the `Role`/`Actor` schemas; `leasingRole` on `AuthenticatedUser` |
| `demo/backend/.../registry/PartyRegistry.java` | Who exists and what part they play. In memory, lost on restart |
| `demo/backend/.../service/*ApiImpl.java` | `ActorsApiImpl`, `CarDealersApiImpl`, `LeasingCompaniesApiImpl`, `CustomersApiImpl`, and `PartyRequests` for what counts as a valid name |
| `demo/backend/.../service/UserApiImpl.java` | Reports the caller's `leasingRole`, if the registry knows one |
| `demo/backend/.../security/` | Both filter chains permit the registry paths |
| `demo/frontend/src/` | `views/PartiesView.tsx`, `stores/partyStore.tsx`, `roles.ts`, plus the route in `App.tsx` and the nav link in `Header.tsx` |
| `demo/daml/leasing/`, `leasing-tests/` | The Daml package the leasing contracts go in, and its test package. Both empty so far |

## What was removed

Upstream's licensing demo API is gone: the `/app-install-requests`, `/app-installs`,
`/licenses` and `/license-renewal-requests` paths, their four `*ApiImpl` classes, and the
views, stores and modals that drove them (`AppInstallsView`, `LicensesView`,
`appInstallStore`, `licenseStore`, the three `License*Modal`s, `types.ts`), plus
`workflow.spec.ts` and its page objects. What remains of the HTTP API is the leasing
registry and the infrastructure around it — `/feature-flags`, `/login-links`, `/user` and
`/admin/tenant-registrations`, which is how an App User's party and OAuth2 client get into
the app in the first place.

The Daml model went too. Upstream's `daml/licensing/` and its tests are replaced by
`demo/daml/leasing/`, a package with no templates in it yet, and the
`make create-app-install-request` helper that seeded the demo is gone with them.

**The plumbing stays**, and that is the whole point of the split: `LedgerApi` (submit and
exercise), `Pqs` (read), `TokenStandardProxy`, `ChoiceContextUtils`, and `DamlRepository`
— which keeps its wiring and its row-extraction helpers, but no longer has a single query,
because there is nothing yet to query. So the path from an HTTP call to a ledger
transaction is intact end to end; only the contracts travelling down it are missing.

Two consequences worth knowing. Upstream's `README.md` still documents the licensing
endpoints, since editing 28 KB of upstream prose would cost more at merge time than it
saves. And `Modal.tsx` and `DurationInput.tsx` are kept as domain-neutral components with
no current caller — a lease has a term, and confirmations need a modal.

One build detail that will look odd. `daml/build.gradle.kts` feeds the four splice
token-standard DARs to the codegen task on top of our own DAR. A DAR only carries the
dependencies its own code uses, and an empty `Leasing.Lease` uses none — so without those
lines the generated `AnyValue` and `RelTime` that `ChoiceContextUtils` and `Utils` import
would not exist and the backend would not compile. The lines become redundant as soon as
the leasing templates use the token standard.

Everything else the earlier TypeScript version of this app had was dropped, because the
quickstart already answers it: its own config for `config.ts`, real OAuth2 and
shared-secret login for the bearer-token `authenticator.ts` that validated nothing,
generated Spring interfaces and `ResponseStatusException` for the hand-written router and
error classes, Actuator for `/health`, Spring Security for `/logout`, and its existing
`utils/format.ts`, `utils/error.ts` and toast store for ours.

## Running it

From `demo/`:

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

1. Model the contracts in Daml, in `demo/daml/leasing/daml/Leasing/Lease.daml` —
   empty, waiting for them. There is no worked example left in the tree, so the reference
   is upstream's licensing model at the commit before it was removed, or the quickstart
   repo itself. Tests go in `demo/daml/leasing-tests/`, run by `make test-daml`.
2. Add the paths and schemas to `demo/common/openapi.yaml` — a collection path per
   aggregate plus `{id}:<verb>` for each state transition, which is the convention the
   licensing paths already follow.
3. Implement the generated interface in `demo/backend/.../service/`. Interfaces are
   named from the first path segment, so `/leases` gives you `LeasesApi`.
4. `npm run gen:openapi` in `demo/frontend`, then a store under `src/stores/` and a
   view under `src/views/`, wired into `App.tsx`.

Two conventions worth keeping whatever the domain grows into: ids stay opaque strings the
client never parses or builds, and anything monetary stays a string end to end — a
`Decimal` schema with pattern `^-?[0-9]+(\.[0-9]+)?$`, never `type: number` — so no money
goes through a binary float.

One thing to get right in step 4: **reads go stale.** State changes underneath you when
another party acts, and nothing pushes that to the browser. Re-read after every write
rather than patching local state from the response, and poll where it matters.
