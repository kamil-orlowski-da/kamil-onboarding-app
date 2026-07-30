/**
 * HTTP layer: the routes in `common/openapi.yaml`, wired to the registry.
 *
 * Each route resolves the acting party from the bearer token, parses the request, and
 * delegates. No business logic here.
 *
 * The leasing domain lands as its own module under `src/`, injected into
 * `createRouter` alongside the registry, with a block of routes per aggregate below
 * the party ones. Two conventions for when it does: the acting party is the first
 * argument to every domain call, and reads are scoped to what that party may see.
 */

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';

import type { PartyRegistry } from '../registry/party-registry.js';
import { actingParty } from '../security/authenticator.js';
import { isApiFailure, unauthorized } from './errors.js';
import {
  parseCreateCarDealerRequest,
  parseCreateCustomerRequest,
  parseCreateLeasingCompanyRequest,
} from './requests.js';
import type { AuthenticatedUser, Health } from './types.js';

/** What a handler returns: a status, and a body unless the status is 204. */
interface Reply {
  readonly status: number;
  readonly body?: unknown;
}

function route(handler: (request: Request) => Promise<Reply>): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request)
      .then(({ status, body }) => {
        if (body === undefined) response.status(status).end();
        else response.status(status).json(body);
      })
      .catch(next);
  };
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const created = (body: unknown): Reply => ({ status: 201, body });
const noContent = (): Reply => ({ status: 204 });

export function createRouter(registry: PartyRegistry): Router {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  // --- Health ---------------------------------------------------------------

  // Liveness only. Nothing downstream to report on: if this answers, the process is
  // up, and the process holds all the state there is.
  router.get(
    '/health',
    route(async () => {
      const health: Health = { status: 'ok' };
      return ok(health);
    }),
  );

  // --- Session --------------------------------------------------------------

  /**
   * Who the caller is. A token naming a party that was never created is a 401,
   * same as no token at all — that is what makes assuming a role mean something
   * when there is no password to check.
   */
  router.get(
    '/user',
    route(async (request) => {
      const party = actingParty(request.header('authorization'));
      const found = await registry.find(party);
      if (found === undefined) {
        throw unauthorized(`No such party ${JSON.stringify(party)}`);
      }
      const user: AuthenticatedUser = {
        name: found.name,
        party: found.party,
        role: found.role,
      };
      return ok(user);
    }),
  );

  /**
   * A no-op while the party comes from the token on each request: there is no
   * server-side session to end. Real OIDC clears the cookie here, which is why the
   * frontend calls it rather than just dropping the token locally.
   */
  router.post(
    '/logout',
    route(async () => noContent()),
  );

  // --- Parties --------------------------------------------------------------

  // All unauthenticated, and the read is not scoped to the acting party — see
  // `common/openapi.yaml`. Nobody can log in before anybody exists.

  router.get(
    '/actors',
    route(async () => ok(await registry.listActors())),
  );

  router.post(
    '/car-dealers',
    route(async (request) =>
      created(await registry.createCarDealer(parseCreateCarDealerRequest(request.body))),
    ),
  );

  router.post(
    '/leasing-companies',
    route(async (request) =>
      created(
        await registry.createLeasingCompany(parseCreateLeasingCompanyRequest(request.body)),
      ),
    ),
  );

  router.post(
    '/customers',
    route(async (request) =>
      created(await registry.createCustomer(parseCreateCustomerRequest(request.body))),
    ),
  );

  return router;
}

/** Anything that reaches here without a route. */
export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({ message: `No route for ${request.method} ${request.path}` });
};

/**
 * A 4xx status on an error object, if it carries one. `express.json` rejects with
 * `http-errors` objects — a body over the limit, an unsupported `Content-Encoding` —
 * and each already knows the status it deserves. Without this they would fall to the
 * 500 below and be logged as bugs.
 */
function clientErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' && status >= 400 && status <= 499 ? status : undefined;
}

/**
 * `ApiFailure` carries its own status; a malformed JSON body is a 400, and any other
 * rejection from `express.json` keeps the 4xx it came with. Anything else is a bug —
 * logged in full, reported as a bare 500, because an unexpected message is as likely
 * to leak internals as to help.
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isApiFailure(error)) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ message: 'Request body is not valid JSON' });
    return;
  }

  // Its `message` is safe to pass on: these are raised by the body parser about the
  // request itself, not about anything behind it.
  const status = clientErrorStatus(error);
  if (status !== undefined) {
    response.status(status).json({ message: (error as Error).message });
    return;
  }

  console.error('Unhandled error while serving a request', error);
  response.status(500).json({ message: 'Internal error' });
};
