/**
 * The party registry: who exists, and creating more of them.
 *
 * Unauthenticated on the backend, so this store works before anyone is logged in —
 * which it must, since the login screen reads `actors` to list the roles available
 * to assume.
 *
 * Every operation refreshes from the server rather than patching local state from
 * the response. That is the habit to keep once contracts arrive: another party can
 * change things underneath you.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { getClient } from '../api';
import type {
  Actor,
  Client,
  CreateCarDealerRequest,
  CreateCustomerRequest,
  CreateLeasingCompanyRequest,
} from '../openapi';
import { useRun } from '../utils/error';
import { useToast } from './toastStore';

interface PartyContextType {
  readonly actors: readonly Actor[];
  refresh: () => Promise<void>;
  createCarDealer: (request: CreateCarDealerRequest) => Promise<boolean>;
  createLeasingCompany: (request: CreateLeasingCompanyRequest) => Promise<boolean>;
  createCustomer: (request: CreateCustomerRequest) => Promise<boolean>;
}

const PartyContext = createContext<PartyContextType | undefined>(undefined);

export const PartyProvider = ({ children }: { children: React.ReactNode }) => {
  const [actors, setActors] = useState<readonly Actor[]>([]);
  const run = useRun();
  const toast = useToast();

  const refresh = useCallback(async () => {
    await run('Loading parties', async () => {
      const client = await getClient();
      const response = await client.listActors();
      setActors(response.data);
    });
  }, [run]);

  /**
   * The three registrations differ only in which client method they call, so they
   * share this. Returns whether it worked, because the caller has a form to clear and
   * must not clear it on failure — `run` swallows the rejection, so "returned" does
   * not mean "succeeded" and the boolean is how the difference gets back out.
   */
  const register = useCallback(
    async (
      label: string,
      name: string,
      call: (client: Client) => Promise<unknown>,
    ): Promise<boolean> => {
      const result = await run(label, async () => {
        await call(await getClient());
        return true;
      });
      if (result !== true) return false;
      await refresh();
      toast.displaySuccess(`Registered ${name}`);
      return true;
    },
    [run, refresh, toast],
  );

  const createCarDealer = useCallback(
    (request: CreateCarDealerRequest) =>
      register('Registering car dealer', request.name, (client) =>
        client.createCarDealer(null, request),
      ),
    [register],
  );

  const createLeasingCompany = useCallback(
    (request: CreateLeasingCompanyRequest) =>
      register('Registering leasing company', request.name, (client) =>
        client.createLeasingCompany(null, request),
      ),
    [register],
  );

  const createCustomer = useCallback(
    (request: CreateCustomerRequest) =>
      register('Registering customer', request.name, (client) =>
        client.createCustomer(null, request),
      ),
    [register],
  );

  const value = useMemo(
    () => ({ actors, refresh, createCarDealer, createLeasingCompany, createCustomer }),
    [actors, refresh, createCarDealer, createLeasingCompany, createCustomer],
  );

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
};

export const usePartyStore = (): PartyContextType => {
  const context = useContext(PartyContext);
  if (context === undefined) {
    throw new Error('usePartyStore must be used within a PartyProvider');
  }
  return context;
};
