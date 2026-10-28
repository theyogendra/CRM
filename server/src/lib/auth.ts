import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { hasPermission, permissionsFor, type Permission } from './permissions';

const secret = () => process.env.JWT_SECRET || 'dev-secret';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Permission[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** The token only carries the user id; role and name are re-read from the database on each request. */
export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: '7d' });
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, permissions: permissionsFor(u.role) };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const { sub } = jwt.verify(token, secret()) as { sub: string };
    const user = await loadUser(sub);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/** Route guard: the signed-in user must hold the permission. Use after requireAuth. */
export function requirePermission(permission: Permission) {
  // `any` route params keep Express's path-parameter typing intact for the handler that follows
  return (req: Request<any, any, any, any>, res: Response, next: NextFunction) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      res.status(403).json({ error: 'You do not have permission to do this' });
      return;
    }
    next();
  };
}
