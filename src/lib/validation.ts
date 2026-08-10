/**
 * Input Validation Schemas
 * Uses Zod for strict, type-safe validation
 * 
 * Install: npm install zod
 */

import { z } from 'zod';

// ============================================================================
// AUTHENTICATION SCHEMAS
// ============================================================================

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Invalid email format')
  .transform(val => val.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// More lenient password schema for login (no complexity requirements)
export const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(128, 'Password is too long');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name is too long')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters');

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

// ============================================================================
// PLAYLIST SCHEMAS
// ============================================================================

const playlistNameSchema = z
  .string()
  .trim()
  .min(1, 'Playlist name is required')
  .max(100, 'Playlist name is too long')
  .regex(/^[a-zA-Z0-9\s'-_.!?&()]+$/, 'Playlist name contains invalid characters');

const playlistDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description is too long')
  .optional();

const playlistSchema = z.object({
  name: playlistNameSchema,
  description: playlistDescriptionSchema,
  isPublic: z.boolean(),
});

// ============================================================================
// FILE UPLOAD SCHEMAS
// ============================================================================

const imageFileSchema = z.object({
  uri: z.string().min(1, 'File URI is required'),
  name: z.string().min(1).max(255, 'Filename is too long'),
  size: z.number().max(5 * 1024 * 1024, 'File must be under 5MB'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']).refine(
    (val) => ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(val),
    { message: 'Only JPEG, PNG, and WebP images are allowed' }
  ),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate data against a schema and throw on error
 * @param schema Zod schema
 * @param data Data to validate
 * @returns Validated and typed data
 */
function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data and return result with success/error
 * @param schema Zod schema
 * @param data Data to validate
 * @returns Validation result
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Get the first error message from Zod error
  const firstError = result.error.issues?.[0];
  const error = firstError?.message || 'Validation failed';
  
  return { success: false, error };
}

/**
 * Calculate password strength
 * @param password Password string
 * @returns Strength score 0-4
 */
function getPasswordStrength(password: string): {
  score: number;
  feedback: string;
} {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  const feedback = [
    'Very weak',
    'Weak',
    'Fair',
    'Good',
    'Strong',
  ][Math.min(score, 4)];
  
  return { score: Math.min(score, 4), feedback };
}
