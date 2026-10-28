import { createContext, useContext } from 'react';
import type { AuthUser } from './api';

/** The signed-in user, provided once by the app shell. The server still enforces every permission. */
export const SessionContext = createContext<AuthUser | null>(null);

export function useSession() {
  return useContext(SessionContext);
}

/** UI check only: hides controls the user cannot use. The API rejects the action regardless. */
export function useCan(permission: string) {
  return useSession()?.permissions.includes(permission) ?? false;
}

export const useCanManageCatalog = () => useCan('catalog:write');
