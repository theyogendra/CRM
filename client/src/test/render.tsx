import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionContext } from '../lib/session';
import type { AuthUser } from '../lib/api';
import { ToastProvider } from '../components/ui';

export const ADMIN: AuthUser = {
  id: 'u1', name: 'Rahul Verma', email: 'owner@example.com', role: 'ADMIN',
  permissions: ['catalog:read', 'catalog:write', 'documents:write', 'settings:manage', 'notifications:read'],
};

export const STAFF: AuthUser = {
  id: 'u2', name: 'Sales Staff', email: 'staff@example.com', role: 'STAFF',
  permissions: ['catalog:read', 'documents:write', 'notifications:read'],
};

/** Shows the current path so tests can prove where a click navigated. */
export function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

export function renderWithApp(ui: ReactElement, opts: { user?: AuthUser; route?: string } = {}) {
  return render(
    <SessionContext.Provider value={opts.user ?? ADMIN}>
      <ToastProvider>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>
          <Routes>
            <Route path="*" element={<>{ui}<LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </SessionContext.Provider>,
  );
}
