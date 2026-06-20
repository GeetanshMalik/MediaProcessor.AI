import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

/**
 * Middleware to protect endpoints. Validates the JWT in Authorization header.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required.'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization token format.'
        }
      });
    }

    const decodedUser = verifyToken(token);
    req.user = decodedUser;
    
    return next();
  } catch (error) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token.'
      }
    });
  }
}
