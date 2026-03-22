import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  req.user = decoded;
  next();
};

export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const { role: userRole } = req.user;
    let hasAccess = false;

    // Role Hierarchy Logic
    if (userRole === 'ADMIN') {
      hasAccess = true;
    } else if (role === 'CUSTOMER') {
      // CUSTOMER routes are accessible by any authenticated user (PROVIDER/ORGANIZATION/etc)
      hasAccess = true;
    } else if (role === 'PROVIDER' && (userRole === 'PROVIDER' || userRole === 'ORGANIZATION')) {
      // PROVIDER routes are accessible by PROVIDERS and up (ORGANIZATIONS)
      hasAccess = true;
    } else if (role === 'ORGANIZATION' && userRole === 'ORGANIZATION') {
      // ORGANIZATION routes are strict
      hasAccess = true;
    } else if (userRole === role) {
      // Exact match fallback
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};
