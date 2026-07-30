/**
 * Enforces what `common/openapi.yaml` says a well-formed body looks like. Without
 * this a missing field arrives as `undefined`, reaches the service, and surfaces
 * somewhere further in as a 500 or a silently wrong record instead of a 400 naming
 * the field. Hand-written: nothing generates these from the spec on this side.
 *
 * Skeleton: the field primitives are here, the per-endpoint parsers are not. Each
 * takes `unknown`, returns the matching interface from `api/types.ts`, and threads
 * `path` through so a nested failure names the whole path, not just the leaf.
 */

import { badRequest } from './errors.js';
import type {
  CreateCarDealerRequest,
  CreateCustomerRequest,
  CreateLeasingCompanyRequest,
} from './types.js';

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${path}.${field} must be a non-empty string`);
  }
  return value;
}

// --- Parties ----------------------------------------------------------------

/**
 * The registry slugs the name into the party id, so a name with nothing sluggable in
 * it slugs to nothing. Rejecting it here gives a 400 rather than `CarDealer::unnamed`.
 *
 * ASCII on purpose: this is a demo, and names in other scripts are out of scope. The
 * cost is that "Żółć" is a 400 — widen to `/[\p{L}\p{N}]/u` (and fold in the slug) if
 * that ever needs to work.
 */
function partyName(source: Record<string, unknown>, path: string): string {
  const value = nonEmptyString(source, 'name', path);
  if (!/[a-z0-9]/i.test(value)) {
    throw badRequest(`${path}.name must contain at least one ASCII letter or digit`);
  }
  return value;
}

// Same shape for all three, kept separate: three routes, and the duplication
// disappears the moment any role gains a field of its own.

export function parseCreateCarDealerRequest(body: unknown): CreateCarDealerRequest {
  return { name: partyName(object(body, 'body'), 'body') };
}

export function parseCreateLeasingCompanyRequest(body: unknown): CreateLeasingCompanyRequest {
  return { name: partyName(object(body, 'body'), 'body') };
}

export function parseCreateCustomerRequest(body: unknown): CreateCustomerRequest {
  return { name: partyName(object(body, 'body'), 'body') };
}
