/**
 * Client-Side Rate Limiter
 * Provides basic protection against brute force attacks
 * 
 * NOTE: This is CLIENT-SIDE protection only. True rate limiting
 * must be implemented on the backend/Firebase side.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

// Rate limit configurations for different actions
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  'auth:login': {
    maxAttempts: 5, // 5 failed login attempts
    windowMs: 15 * 60 * 1000, // within 15 minutes
    blockDurationMs: 15 * 60 * 1000, // block for 15 minutes
  },
  'auth:register': {
    maxAttempts: 3, // 3 registration attempts
    windowMs: 60 * 60 * 1000, // within 1 hour
    blockDurationMs: 60 * 60 * 1000, // block for 1 hour
  },
  'auth:passwordReset': {
    maxAttempts: 3, // 3 password reset requests
    windowMs: 60 * 60 * 1000, // within 1 hour
    blockDurationMs: 60 * 60 * 1000, // block for 1 hour
  },
  'auth:deleteAccount': {
    maxAttempts: 2, // 2 deletion attempts
    windowMs: 60 * 60 * 1000, // within 1 hour
    blockDurationMs: 60 * 60 * 1000, // block for 1 hour
  },
  'upload:image': {
    maxAttempts: 10, // 10 image uploads
    windowMs: 60 * 60 * 1000, // within 1 hour
    blockDurationMs: 60 * 60 * 1000, // block for 1 hour
  },
};

interface RateLimitData {
  attempts: number[];
  blockedUntil: number;
}

/**
 * Check if an action is rate limited
 * @param action Action identifier (e.g., 'auth:login')
 * @param identifier Optional additional identifier (e.g., email address for per-user limits)
 * @returns Object with allowed status and optional retry time
 */
export async function checkRateLimit(
  action: string,
  identifier?: string
): Promise<{ allowed: boolean; retryAfter?: number; attemptsRemaining?: number }> {
  const config = RATE_LIMIT_CONFIGS[action];
  
  // If no config exists for this action, allow it
  if (!config) {
    return { allowed: true };
  }

  const key = `ratelimit:${action}${identifier ? ':' + identifier : ''}`;
  const dataStr = await AsyncStorage.getItem(key);
  const now = Date.now();

  let data: RateLimitData = dataStr
    ? JSON.parse(dataStr)
    : { attempts: [], blockedUntil: 0 };

  // Check if currently blocked
  if (data.blockedUntil && now < data.blockedUntil) {
    const retryAfter = Math.ceil((data.blockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Clear block if it has expired
  if (data.blockedUntil && now >= data.blockedUntil) {
    data.blockedUntil = 0;
    data.attempts = [];
  }

  // Remove attempts outside the time window
  data.attempts = data.attempts.filter(
    (timestamp: number) => now - timestamp < config.windowMs
  );

  // Check if limit exceeded
  if (data.attempts.length >= config.maxAttempts) {
    data.blockedUntil = now + config.blockDurationMs;
    await AsyncStorage.setItem(key, JSON.stringify(data));
    
    const retryAfter = Math.ceil(config.blockDurationMs / 1000);
    return { allowed: false, retryAfter };
  }

  // Calculate remaining attempts
  const attemptsRemaining = config.maxAttempts - data.attempts.length;

  // Record this attempt
  data.attempts.push(now);
  await AsyncStorage.setItem(key, JSON.stringify(data));

  return { allowed: true, attemptsRemaining };
}

/**
 * Clear rate limit for an action (e.g., after successful login)
 * @param action Action identifier
 * @param identifier Optional identifier
 */
export async function clearRateLimit(
  action: string,
  identifier?: string
): Promise<void> {
  const key = `ratelimit:${action}${identifier ? ':' + identifier : ''}`;
  await AsyncStorage.removeItem(key);
}

/**
 * Format retry time in human-readable format
 * @param seconds Number of seconds
 * @returns Formatted string
 */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Get remaining attempts for an action
 * @param action Action identifier
 * @param identifier Optional identifier
 * @returns Number of attempts remaining, or null if no limit
 */
async function getRemainingAttempts(
  action: string,
  identifier?: string
): Promise<number | null> {
  const config = RATE_LIMIT_CONFIGS[action];
  if (!config) return null;

  const key = `ratelimit:${action}${identifier ? ':' + identifier : ''}`;
  const dataStr = await AsyncStorage.getItem(key);
  const now = Date.now();

  if (!dataStr) {
    return config.maxAttempts;
  }

  const data: RateLimitData = JSON.parse(dataStr);

  // If blocked, return 0
  if (data.blockedUntil && now < data.blockedUntil) {
    return 0;
  }

  // Filter valid attempts
  const validAttempts = data.attempts.filter(
    (timestamp: number) => now - timestamp < config.windowMs
  );

  return Math.max(0, config.maxAttempts - validAttempts.length);
}
