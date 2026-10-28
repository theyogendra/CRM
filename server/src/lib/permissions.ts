/**
 * Role → permission map. The `role` column on User is the source of truth; these are the only
 * roles the application recognises. ADMIN can do everything; STAFF can run day-to-day sales
 * work but cannot change the catalog (prices/tax) or company settings.
 */
export const PERMISSIONS = [
  'customers:write',
  'documents:write',
  'payments:write',
  'catalog:read',
  'catalog:write',
  'settings:manage',
  'notifications:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'ADMIN' | 'STAFF';

export const ROLES: Role[] = ['ADMIN', 'STAFF'];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  STAFF: ['customers:write', 'documents:write', 'payments:write', 'catalog:read', 'notifications:read'],
};

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

export function permissionsFor(role: string): Permission[] {
  return isRole(role) ? [...ROLE_PERMISSIONS[role]] : [];
}

export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
