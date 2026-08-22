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
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
