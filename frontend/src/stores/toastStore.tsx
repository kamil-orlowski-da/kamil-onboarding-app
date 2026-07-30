/**
 * Transient user-facing messages. The outermost provider, because every other store
 * reports failures through it (`run` in `utils/error.ts`).
 *
 * Two contexts, not one: the toast list changes whenever one appears or expires, the
 * functions that add them do not. Merged, `useToast()` would return a fresh object
 * per toast, invalidating the `useCallback` in `useRun` and re-running any effect
 * that depends on a store operation — a failing fetch would raise a toast, the toast
 * would re-run the fetch, and the two would spin.
 *
 * `useToast()` to raise one, `useToasts()` to render them.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastKind = 'success' | 'error';

interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
}

interface ToastActions {
  displaySuccess: (message: string) => void;
  displayError: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastActionsContext = createContext<ToastActions | undefined>(undefined);
const ToastListContext = createContext<readonly Toast[]>([]);

/** How long a toast stays up before it removes itself. */
const DISMISS_AFTER_MS = 5000;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  // All setter-form updates, so nothing closes over `toasts` and nothing needs it as
  // a dependency — which is what keeps `actions` stable.
  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const display = useCallback(
    (kind: ToastKind, message: string) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const displaySuccess = useCallback((message: string) => display('success', message), [display]);
  const displayError = useCallback((message: string) => display('error', message), [display]);

  const actions = useMemo(
    () => ({ displaySuccess, displayError, dismiss }),
    [displaySuccess, displayError, dismiss],
  );

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastActionsContext.Provider>
  );
};

/** Raise a toast. Stable across renders — safe in an effect's dependency list. */
export const useToast = (): ToastActions => {
  const context = useContext(ToastActionsContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/** The current toasts, for the component that renders them. */
export const useToasts = (): readonly Toast[] => useContext(ToastListContext);
