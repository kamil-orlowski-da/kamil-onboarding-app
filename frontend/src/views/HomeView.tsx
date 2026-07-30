/**
 * The whole app, for now: register parties, see who exists, become one of them.
 *
 * Reachable without logging in on purpose — the registry starts empty, so putting
 * registration behind a login would deadlock. Logging in means *assuming* a party:
 * the party id becomes the bearer token (see `session.ts` and `api.ts`) and the
 * backend takes it at face value. Localhost only.
 *
 * The real flow replaces both halves: identity from an OAuth2 provider via
 * `/oauth2/authorization/{registration}`, and parties administered rather than
 * invented by a form. What survives is the shape — the frontend asks the backend who
 * it is and never handles a credential itself.
 *
 * The `/health` line is the one end-to-end check of the client stack: typed client →
 * dev proxy → backend. If it renders, schema, proxy and backend agree.
 */

import React, { useEffect, useState } from 'react';

import { getClient } from '../api';
import { CreateForm } from '../components/CreateForm';
import type { Actor, Health } from '../openapi';
import { ROLE_LABELS } from '../roles';
import { usePartyStore } from '../stores/partyStore';
import { useUserStore } from '../stores/userStore';
import { useRun } from '../utils/error';
import { formatDateTime } from '../utils/format';

/**
 * Who exists, and the way in. Each name assumes that party; the current one is
 * disabled rather than hidden, so the row stays where you last saw it.
 */
const ActorTable: React.FC<{
  actors: readonly Actor[];
  currentParty: string | undefined;
  onSelect: (party: string) => void;
}> = ({ actors, currentParty, onSelect }) => {
  if (actors.length === 0) {
    return <p className="muted">Nobody registered yet — create someone above.</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Party</th>
          <th>Registered</th>
        </tr>
      </thead>
      <tbody>
        {actors.map((actor) => (
          <tr key={actor.party}>
            <td>
              <button
                type="button"
                className="link-button"
                disabled={actor.party === currentParty}
                onClick={() => onSelect(actor.party)}
              >
                {actor.name}
              </button>
              {actor.party === currentParty && <span className="muted"> — acting as</span>}
            </td>
            <td>{ROLE_LABELS[actor.role]}</td>
            <td>
              <code>{actor.party}</code>
            </td>
            <td>{formatDateTime(actor.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const HomeView: React.FC = () => {
  const { user, loading, login } = useUserStore();
  const { actors, refresh, createCarDealer, createLeasingCompany, createCustomer } =
    usePartyStore();
  const [health, setHealth] = useState<Health | null>(null);
  const run = useRun();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void run('Fetching backend health', async () => {
      const client = await getClient();
      const response = await client.health();
      setHealth(response.data);
    });
  }, [run]);

  return (
    <section>
      <h2>Vehicle Leasing</h2>

      <p>
        Skeleton. The parties exist; the leasing workflow between them does not yet.
        Add a store under <code>src/stores/</code> and a view per aggregate, and
        register the provider in <code>App.tsx</code>.
      </p>

      <dl className="facts">
        <dt>Backend</dt>
        <dd>{health === null ? 'unreachable' : health.status}</dd>

        <dt>Acting as</dt>
        <dd>
          {loading ? (
            'checking…'
          ) : user === null ? (
            <span className="muted">nobody — pick a name below</span>
          ) : (
            <>
              {user.name} · {ROLE_LABELS[user.role]} · <code>{user.party}</code>
            </>
          )}
        </dd>
      </dl>

      <h3>Register</h3>
      <div className="cards">
        {/*
          A name is all any of them takes, and it is what the party id is derived
          from — so the same name twice in a role is a 409.
        */}
        <CreateForm
          title="Car dealer"
          label="Name"
          placeholder="Acme Motors"
          onSubmit={(name) => createCarDealer({ name })}
        />

        <CreateForm
          title="Leasing company"
          label="Name"
          placeholder="Northern Leasing AG"
          onSubmit={(name) => createLeasingCompany({ name })}
        />

        <CreateForm
          title="Customer"
          label="Name"
          placeholder="Jamie Fletcher"
          onSubmit={(name) => createCustomer({ name })}
        />
      </div>

      <h3>Registered</h3>
      <p className="muted">Click a name to act as them. No password.</p>
      <ActorTable
        actors={actors}
        currentParty={user?.party}
        onSelect={(party) => void login(party)}
      />
    </section>
  );
};
