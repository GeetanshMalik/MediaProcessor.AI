import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

/**
 * Middleware to protect endpoints. Validates the JWT in Authorization header.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required.'
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
