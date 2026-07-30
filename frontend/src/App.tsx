/**
 * Providers and routing. One provider and one route per domain: a store under
 * `src/stores/`, a view under `src/views/`, both wired up here.
 *
 * `ToastProvider` stays outermost — every other store reports failures through it.
 * `UserProvider` next, since views render from the session.
 */

import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Header } from './components/Header';
import { ToastNotification } from './components/ToastNotification';
import { PartyProvider } from './stores/partyStore';
import { ToastProvider } from './stores/toastStore';
import { UserProvider, useUserStore } from './stores/userStore';
import { HomeView } from './views/HomeView';

/** Resolves the session once, before anything decides what to show. */
const SessionBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { fetchUser } = useUserStore();

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  return <>{children}</>;
};

// Nested outermost first, so a provider may use hooks from those above it and none
// from those below. Add a provider by nesting it here.
const App: React.FC = () => (
  <ToastProvider>
    <UserProvider>
      <PartyProvider>
        <SessionBootstrap>
          <Header />
          <main className="container">
            <Routes>
              <Route path="/" element={<HomeView />} />
              {/*
                Everything else lands on the home page, including `/login` — which is
                *not* a route here, because registration and role assumption both live
                on the home page anyway.
              */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <ToastNotification />
        </SessionBootstrap>
      </PartyProvider>
    </UserProvider>
  </ToastProvider>
);

export default App;
