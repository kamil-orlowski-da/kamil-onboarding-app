/**
 * Who exists, and what role they play.
 *
 * Identity is not domain state: on a real deployment these entries come from an
 * identity provider, and creating one is an administrative act rather than a business
 * operation. It lives in its own module so that move touches this file and nothing
 * else.
 *
 * Reads are deliberately not scoped to an acting party — the login screen has to list
 * the roles available to assume before anyone is authenticated. Every method is async
 * despite the `Map` behind it, because a call to a real provider would be.
 *
 * State is per-process and lost on restart — by design.
 */

import type {
  Actor,
  CarDealer,
  CreateCarDealerRequest,
  CreateCustomerRequest,
  CreateLeasingCompanyRequest,
  Customer,
  LeasingCompany,
  Party,
  Role,
} from '../api/types.js';
import { conflict } from '../api/errors.js';

/**
 * The readable part of `CarDealer::acme-motors`. Derived from the name rather than
 * random so the id shows up legibly in a `curl`.
 *
 * Lossy — everything but ASCII alphanumerics collapses to `-` — so it cannot carry
 * uniqueness on its own: "Acme Motors" and "Acme-Motors" slug alike. `nameKey`
 * decides what counts as a duplicate; `claim` disambiguates the id.
 */
function slug(name: string): string {
  const slugged = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slugged === '' ? 'unnamed' : slugged;
}

/**
 * What counts as the same name within a role: case- and whitespace-insensitive, but
 * otherwise the name as given. Two genuinely different names never share a key, so a
 * 409 always means the name really is taken.
 */
function nameKey(role: Role, name: string): string {
  return `${role}::${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

export class PartyRegistry {
  /**
   * Every party, by id. One map rather than one per role: nothing here ever reads a
   * single role's parties, and ids are unique across all three anyway.
   */
  private readonly parties = new Map<Party, Actor>();
  /** `nameKey` to the id it was given, so a duplicate name is recognised as one. */
  private readonly partiesByName = new Map<string, Party>();

  /** Every party, flattened to what identity selection needs. */
  async listActors(): Promise<Actor[]> {
    // Projected field by field, not spread: a no-op today, but it stops a
    // role-specific field added later from silently leaking into this response.
    return [...this.parties.values()]
      .map(({ party, role, name, createdAt }) => ({ party, role, name, createdAt }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** The party a bearer token names, or `undefined` if there is no such party. */
  async find(party: Party): Promise<Actor | undefined> {
    return this.parties.get(party);
  }

  async createCarDealer(request: CreateCarDealerRequest): Promise<CarDealer> {
    return this.register('CarDealer', request.name);
  }

  async createLeasingCompany(request: CreateLeasingCompanyRequest): Promise<LeasingCompany> {
    return this.register('LeasingCompany', request.name);
  }

  async createCustomer(request: CreateCustomerRequest): Promise<Customer> {
    return this.register('Customer', request.name);
  }

  /**
   * The three roles add no fields of their own (see `api/types.ts`), so one method
   * builds all three and the return type just pins `role`. Give a role a field and
   * this splits back into three.
   */
  private register<R extends Role>(role: R, name: string): Actor & { readonly role: R } {
    const actor = {
      party: this.claim(role, name),
      role,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    this.parties.set(actor.party, actor);
    return actor;
  }

  /**
   * Reserves an id for a name, or rejects if that name is already registered in the
   * role. Two steps, because the two questions are different: the name decides
   * whether this is a duplicate, the slug only decides what the id looks like. A
   * distinct name whose slug is already spoken for gets a suffix rather than a 409.
   */
  private claim(role: Role, name: string): Party {
    const key = nameKey(role, name);
    if (this.partiesByName.has(key)) {
      throw conflict(`A ${role} named ${JSON.stringify(name.trim())} already exists`);
    }

    const base: Party = `${role}::${slug(name)}`;
    let party = base;
    for (let suffix = 2; this.parties.has(party); suffix += 1) {
      party = `${base}-${suffix}`;
    }

    this.partiesByName.set(key, party);
    return party;
  }
}
