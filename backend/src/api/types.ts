/**
 * REST DTOs — the TypeScript face of `common/openapi.yaml`, which is the source of
 * truth: change one, change the other.
 *
 * Two conventions worth keeping whatever the domain grows into: ids are opaque
 * strings the client never parses or builds, and anything monetary stays a string
 * end to end so no money goes through a binary float.
 *
 * Skeleton: the domain projections and request bodies go below, one interface per
 * schema in the spec.
 */

/** Identifies a party. Opaque to the client — see `registry/party-registry.ts`. */
export type Party = string;

// --- Parties ----------------------------------------------------------------

/**
 * Which of the three parties in the workflow this is: the fixed role it plays in
 * the story. A car dealer supplies the vehicle, a leasing company finances it, a
 * customer leases it.
 */
export type Role = 'CarDealer' | 'LeasingCompany' | 'Customer';

/** What every party in the registry carries, whatever its role. */
export interface Actor {
  readonly party: Party;
  readonly role: Role;
  readonly name: string;
  /** ISO 8601. */
  readonly createdAt: string;
}

// The three roles add no fields; each only pins `role` to one value. They are
// therefore structurally interchangeable, so the compiler will not stop you handing
// a dealer to something expecting a customer — read `role`, do not assume the type.

export interface CarDealer extends Actor {
  readonly role: 'CarDealer';
}

export interface LeasingCompany extends Actor {
  readonly role: 'LeasingCompany';
}

export interface Customer extends Actor {
  readonly role: 'Customer';
}

/**
 * `name` is the whole request. One interface per role anyway: separate endpoints,
 * and a role-specific field later goes here without disturbing the other two.
 */
export interface CreateCarDealerRequest {
  readonly name: string;
}

export interface CreateLeasingCompanyRequest {
  readonly name: string;
}

export interface CreateCustomerRequest {
  readonly name: string;
}

// --- Domain -----------------------------------------------------------------

// One `readonly` interface per aggregate the frontend reads, each carrying its `id`
// as an opaque string. Name the fields for what a frontend developer would call
// them, not for however the domain module happens to store them.

// --- Requests ---------------------------------------------------------------

// One interface per request body; `api/requests.ts` parses `unknown` into each.

// --- Infrastructure ---------------------------------------------------------

export interface Health {
  readonly status: string;
}

/**
 * The session, as the frontend sees it. The frontend only asks "am I logged in, and
 * who am I"; authorization decisions stay on this side. Anything the frontend needs
 * in order to decide what to *show* goes here — but as a display hint only, never as
 * the check itself.
 */
export interface AuthenticatedUser {
  readonly name: string;
  readonly party: Party;
  readonly role: Role;
}
