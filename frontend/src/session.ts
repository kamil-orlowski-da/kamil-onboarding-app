/**
 * Which party the browser is currently acting as.
 *
 * "Logging in" means assuming a role: no password, no server-side session, just a
 * party id attached to every request as a bearer token (see `api.ts`). The backend
 * takes it at face value (see its `security/authenticator.ts`), which is why none of
 * this may leave localhost.
 *
 * In `localStorage`, so a reload does not log you out — and so the stored party can
 * outlive the in-memory registry it was created in. `/user` answers 401 for a party
 * it does not know and `userStore` clears this, so a stale value resolves itself on
 * the next fetch.
 */

const STORAGE_KEY = 'leasing.party';

/** The assumed party, or `null` when nobody is logged in. */
export function currentParty(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null || value === '' ? null : value;
  } catch {
    // Private browsing modes can throw on access rather than returning null.
    return null;
  }
}

export function setCurrentParty(party: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, party);
  } catch {
    // Not fatal: the session just will not survive a reload.
  }
}

export function clearCurrentParty(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — see above.
  }
}
