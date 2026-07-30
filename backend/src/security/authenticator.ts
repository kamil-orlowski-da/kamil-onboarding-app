/**
 * Resolves an inbound bearer token to the party the request acts as.
 *
 * **Validates nothing** — the token is taken at face value as the party id, so
 * `Authorization: Bearer <party>` makes you that party. That is what lets the
 * endpoints be driven with curl before an identity provider exists, and it is why
 * none of this may leave localhost.
 *
 * A real implementation fetches the provider's JWKS, verifies the signature, checks
 * issuer, audience and expiry, and maps the subject onto a party id. It belongs here
 * rather than in the browser: the frontend holds a session and never handles a
 * credential itself.
 */

import { unauthorized } from '../api/errors.js';
import type { Party } from '../api/types.js';

/**
 * The party a request acts as, read from `Authorization: Bearer <token>`.
 *
 * A missing or unparseable header is a 401: there is no anonymous party, and no
 * fallback to a configured one — a default would either name a party that does not
 * exist, and so do nothing, or name one that does, and silently hand every
 * unauthenticated request that party's identity.
 */
export function actingParty(header: string | undefined): Party {
  const match = header === undefined ? null : /^Bearer[ \t]+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (token === undefined || token === '') {
    throw unauthorized('No bearer token');
  }
  return token;
}
