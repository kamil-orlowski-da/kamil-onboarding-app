/**
 * Site chrome: navigation, who you are, and the way out. No login link — the brand
 * link leads to the home page, which is where registration and role assumption
 * live.
 *
 * Add a `NavLink` per view as views arrive. Hiding one is a display hint only — the
 * backend rejects the request regardless of what got rendered.
 */

import React from 'react';
import { NavLink } from 'react-router-dom';

import { ROLE_LABELS } from '../roles';
import { useUserStore } from '../stores/userStore';

export const Header: React.FC = () => {
  const { user, loading, logout } = useUserStore();

  return (
    <header className="header">
      <nav className="header__nav">
        <NavLink to="/">Vehicle Leasing</NavLink>
      </nav>

      <div className="header__session">
        {loading ? (
          <span className="muted">…</span>
        ) : user === null ? (
          // Not a link: the page below already is the login page.
          <span className="muted">not logged in</span>
        ) : (
          <>
            <span className="header__party" title={user.party}>
              {user.name} <span className="muted">({ROLE_LABELS[user.role]})</span>
            </span>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </>
        )}
      </div>
    </header>
  );
};
