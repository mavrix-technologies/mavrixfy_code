/**
 * Production-safe logger
 * Automatically disabled in production builds
 */

const isDev = __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  
  error: (...args: any[]) => {
    if (isDev) console.error(...args);
  },
  
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  },
  
  group: (label: string) => {
    if (isDev) console.group(label);
  },
  
  groupEnd: () => {
    if (isDev) console.groupEnd();
  },
  
  time: (label: string) => {
    if (isDev) console.time(label);
  },
  
  timeEnd: (label: string) => {
    if (isDev) console.timeEnd(label);
  },
};

// Performance monitoring helper
export const perfMonitor = {
  start: (label: string) => {
    if (isDev) {
      performance.mark(`${label}-start`);
    }
  },
  
  end: (label: string) => {
    if (isDev) {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
    }
  },
};
