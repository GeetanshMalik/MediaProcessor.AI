import { Request, Response } from 'express';
import { prisma } from '../database/db';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { ZodError } from 'zod';

/**
 * Handle user registration
 */
export async function register(req: Request, res: Response) {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { name, email, password } = validatedData;

    // Check if email already registered
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists.'
        }
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash
      }
    });

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email
    });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid registration input parameters.',
          details: error.errors.map(err => ({ field: err.path.join('.'), message: err.message }))
        }
      });
    }

    console.error('Registration error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong during registration.'
      }
    });
  }
}

/**
 * Handle user login
 */
export async function login(req: Request, res: Response) {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.'
        }
      });
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.'
        }
      });
    }

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid login input parameters.',
          details: error.errors.map(err => ({ field: err.path.join('.'), message: err.message }))
        }
      });
    }

    console.error('Login error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong during authentication.'
      }
    });
  }
}

/**
 * Get currently authenticated user details
 */
export async function me(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User is not authenticated.'
      }
    });
  }

  return res.status(200).json({
    user: req.user
  });
}

/**
 * Handle user logout (Stateless client token clearing verification)
 */
export async function logout(req: Request, res: Response) {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
}
