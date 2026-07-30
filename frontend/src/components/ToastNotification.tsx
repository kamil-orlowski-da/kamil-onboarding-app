/**
 * Renders whatever is in the toast store. Mounted once, at the bottom of `App`.
 */

import React from 'react';

import { useToast, useToasts } from '../stores/toastStore';

export const ToastNotification: React.FC = () => {
  const toasts = useToasts();
  const { dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
