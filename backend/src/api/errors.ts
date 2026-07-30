/**
 * The registry and the request parsers reject with `ApiFailure`; `routes.ts` reads its
 * status straight off and replies with it. Anything else becomes a 500 with no detail.
 *
 * Add a factory below for each status the domain needs — the status lives on the
 * failure rather than in a lookup table, so there is one place to look.
 */

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export function isApiFailure(error: unknown): error is ApiFailure {
  return error instanceof ApiFailure;
}

export const badRequest = (message: string): ApiFailure => new ApiFailure(400, message);

export const unauthorized = (message: string): ApiFailure => new ApiFailure(401, message);

export const conflict = (message: string): ApiFailure => new ApiFailure(409, message);
