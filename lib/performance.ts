/**
 * Performance Optimization Utilities
 * 
 * Utilities to improve app performance and reduce unnecessary re-renders.
 */

import { InteractionManager } from "react-native";

/**
 * Debounce function calls to reduce frequency
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls to limit execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Run a task after interactions are complete
 * Useful for deferring non-critical work
 */
export function runAfterInteractions<T>(task: () => T): Promise<T> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      resolve(task());
    });
  });
}

/**
 * Batch multiple state updates together
 */
export function batchUpdates(callback: () => void): void {
  // React 18+ automatically batches updates
  // This is a no-op but kept for compatibility
  callback();
}

/**
 * Check if two objects are shallowly equal
 */
export function shallowEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  
  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}

/**
 * Memoize expensive computations
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Clear memoization cache
 */
export function clearMemoCache(fn: any): void {
  if (fn.cache) {
    fn.cache.clear();
  }
}
