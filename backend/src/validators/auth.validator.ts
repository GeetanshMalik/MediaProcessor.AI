import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }).max(50),
  email: z.string().email({ message: 'A valid email is required.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long.' })
});

export const loginSchema = z.object({
  email: z.string().email({ message: 'A valid email is required.' }),
  password: z.string().min(1, { message: 'Password is required.' })
});
