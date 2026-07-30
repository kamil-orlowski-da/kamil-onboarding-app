/**
 * The single place an API failure becomes something the user sees. Running a store
 * operation through `run` turns a rejection into one toast; the label names the
 * operation, which is what makes it useful when several requests are in flight.
 *
 * The backend's `{ "message": ... }` is worth showing rather than replacing with
 * something generic — it names the field or the rule that was violated.
 *
 * `run` resolves to `undefined` on failure instead of rejecting, so callers need no
 * `try`/`catch` — but "returned" is not "succeeded": re-read state after a write
 * rather than assuming it landed.
 */

import { useCallback } from 'react';

import { useToast } from '../stores/toastStore';

/** Pulls the backend's `Error.message` out, falling back to whatever we have. */
function errorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}

/** The HTTP status of a failed request, if it got far enough to have one. */
export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** `await run('Fetching Vehicles', async () => { ... })`. */
export function useRun() {
  const toast = useToast();

  return useCallback(
    async <Result>(label: string, operation: () => Promise<Result>): Promise<Result | undefined> => {
      try {
        return await operation();
      } catch (error) {
        toast.displayError(`${label} failed: ${errorMessage(error) ?? 'unknown error'}`);
        return undefined;
      }
    },
    [toast],
  );
}
