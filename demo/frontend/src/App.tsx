// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD

import React from 'react';
import './App.css';
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './stores/toastStore';
import HomeView from './views/HomeView';
import TenantRegistrationView from './views/TenantRegistrationView.tsx';
import LoginView from './views/LoginView';
import { UserProvider } from './stores/userStore';
import Header from './components/Header';
import ToastNotification from './components/ToastNotification';
import { TenantRegistrationProvider } from "./stores/tenantRegistrationStore.tsx";
import PartiesView from './views/PartiesView';
import { PartyProvider } from './stores/partyStore';

const App: React.FC = () => {
    const AppProviders = composeProviders(
        ToastProvider,
        UserProvider,
        TenantRegistrationProvider,
        PartyProvider
    );

    return (
        <AppProviders>
            <Header />
            <main className="container mt-4">
                <Routes>
                    <Route path="/" element={<HomeView />} />
                    <Route path="/tenants" element={<TenantRegistrationView />} />
                    <Route path="/login" element={<LoginView />} />
                    <Route path="/parties" element={<PartiesView />} />
                </Routes>
            </main>
            <ToastNotification />
        </AppProviders>
    );
};

const composeProviders = (...providers: React.ComponentType<{ children: React.ReactNode }>[]) => {
    return providers.reduce(
        (AccumulatedProviders, CurrentProvider) => {
            return ({ children }: { children: React.ReactNode }) => (
                <AccumulatedProviders>
                    <CurrentProvider>
                        {children}
                    </CurrentProvider>
                </AccumulatedProviders>
            );
        },
        ({ children }: { children: React.ReactNode }) => <>{children}</>
    );
};

export default App;
