import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
    ? process.env.JWT_SECRET
    : crypto.createHash('sha256').update(process.cwd() + '_dotboys_session_key').digest('hex');

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role_slug: string;
  role_name: string;
  must_change_password: boolean;
  permissions: string[];
}

export interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

export function signAuthToken(userId: number): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '12h' });
}

export function loadUserWithPermissions(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.must_change_password,
              r.id as role_id, r.slug as role_slug, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: number;
        username: string;
        full_name: string;
        email: string;
        is_active: number;
        must_change_password: number;
        role_id: number;
        role_slug: string;
        role_name: string;
      }
    | undefined;

  if (!row || row.is_active !== 1) return null;

  const perms = db
    .prepare(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?`
    )
    .all(row.role_id) as { code: string }[];

  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    role_slug: row.role_slug,
    role_name: row.role_name,
    must_change_password: row.must_change_password === 1,
    permissions: perms.map((p) => p.code),
  };
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'dotboys_token') {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: number | string };
    const userId = Number(payload.sub);
    const user = loadUserWithPermissions(userId);
    if (!user) {
      res.status(401).json({ error: 'Account inactive or not found' });
      return;
    }
    req.authUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requirePermission(permissionCode: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (
      req.authUser.role_slug === 'super_admin' ||
      req.authUser.permissions.includes(permissionCode)
    ) {
      next();
      return;
    }
    res.status(403).json({ error: `Permission denied: requires ${permissionCode}` });
  };
}

export function checkLoginRateLimit(identifier: string, ip: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as failures FROM login_attempts
       WHERE (identifier = ? OR ip_address = ?)
         AND success = 0
         AND attempted_at >= datetime('now', '-15 minutes')`
    )
    .get(identifier, ip) as { failures: number };
  return row.failures < 10;
}

export function recordLoginAttempt(identifier: string, ip: string, success: boolean): void {
  db.prepare(
    'INSERT INTO login_attempts (identifier, ip_address, success) VALUES (?, ?, ?)'
  ).run(identifier, ip, success ? 1 : 0);
}
