/**
 * Session state. The backend holds the OAuth2/OIDC flow and every authorization
 * decision; this store only answers "is somebody logged in, and what should the
 * chrome say". A permission check here is a display hint, never a control: it decides
 * whether to *show* a view, nothing more.
 *
 * A 401 from `/user` is the expected "not logged in" answer, so it clears the user
 * without a toast. Hence the hand-written `try`/`catch` rather than `run`
 * (`utils/error.ts`), which toasts everything.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { getClient } from '../api';
import type { AuthenticatedUser } from '../openapi';
import { clearCurrentParty, currentParty, setCurrentParty } from '../session';
import { errorStatus } from '../utils/error';
import { useToast } from './toastStore';

interface UserContextType {
  readonly user: AuthenticatedUser | null;
  /** True until the first `/user` answer lands; render nothing decisive before then. */
  readonly loading: boolean;
  fetchUser: () => Promise<void>;
  /** Assume a role. Resolves to whether the party turned out to be a real one. */
  login: (party: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const toast = useToast();

  /**
   * Resolves the stored party against the registry. A 401 clears the session rather
   * than raising a toast, which also cleans up after a backend restart — the
   * in-memory registry forgets parties the browser still remembers.
   */
  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const client = await getClient();
      const response = await client.getAuthenticatedUser();
      setUser(response.data);
    } catch (error) {
      if (errorStatus(error) === 401) {
        setUser(null);
        clearCurrentParty();
      } else {
        toast.displayError('Error fetching user');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Assume a role. The party id *is* the credential, which only works because the
   * backend validates nothing and this never leaves localhost.
   *
   * Written before the check so the interceptor picks it up, then rolled back if the
   * backend does not recognise it — otherwise a bad id would sit in storage and 401
   * every subsequent request.
   *
   * Only a 401 says anything about the party. A timeout or a restarting backend says
   * nothing, so the previous session is restored rather than dropped: switching roles
   * and failing should not log you out of the role you already had.
   */
  const login = useCallback(
    async (party: string): Promise<boolean> => {
      const previousParty = currentParty();
      setCurrentParty(party);
      setLoading(true);
      try {
        const client = await getClient();
        const response = await client.getAuthenticatedUser();
        setUser(response.data);
        return true;
      } catch (error) {
        if (errorStatus(error) === 401) {
          clearCurrentParty();
          setUser(null);
          toast.displayError(
            `No such party ${party} — it may have been lost in a backend restart`,
          );
        } else {
          if (previousParty === null) clearCurrentParty();
          else setCurrentParty(previousParty);
          toast.displayError('Could not log in');
        }
        return false;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const logout = useCallback(async () => {
    try {
      const client = await getClient();
      await client.logout();
    } catch {
      toast.displayError('Error logging out');
    } finally {
      // Either way: a stale user on screen is worse than showing the login view.
      clearCurrentParty();
      setUser(null);
    }
  }, [toast]);

  const value = useMemo(
    () => ({ user, loading, fetchUser, login, logout }),
    [user, loading, fetchUser, login, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUserStore = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserStore must be used within a UserProvider');
  }
  return context;
};
