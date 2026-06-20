import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_replace_in_prod';
const TOKEN_EXPIRY = '7d';

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plain text password with stored bcrypt hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token containing the user payload
 */
export function generateToken(user: UserPayload): string {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Verify a JWT token and extract the user payload
 */
export function verifyToken(token: string): UserPayload {
  return jwt.verify(token, JWT_SECRET) as UserPayload;
}
