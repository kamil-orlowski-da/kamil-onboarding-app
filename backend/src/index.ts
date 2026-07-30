/**
 * Entry point: assemble the pieces and serve.
 *
 * Everything is in-process. The party registry keeps its state in a `Map` and loses
 * it on restart; nothing here reaches another service.
 *
 * Bearer tokens are taken at face value — see `security/authenticator.ts` before
 * pointing this anywhere but localhost.
 */

import express from 'express';

import { createRouter, errorHandler, notFoundHandler } from './api/routes.js';
import { loadConfig } from './config.js';
import { PartyRegistry } from './registry/party-registry.js';

function main(): void {
  const config = loadConfig();

  const app = express();
  app.disable('x-powered-by');
  app.use(createRouter(new PartyRegistry()));
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(config.port, config.host, () => {
    console.log(`leasing backend listening on http://${config.host}:${config.port}`);
  });

  // Finish in-flight requests rather than dropping them: the client deserves an
  // answer for a write that already changed state.
  const shutdown = (signal: string) => () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

main();
