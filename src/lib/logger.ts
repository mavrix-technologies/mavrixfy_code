/**
 * Production-safe logger — all output suppressed in app builds.
 */

 
const noop = (..._args: unknown[]) => undefined;

export const logger = {
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  group: noop,
  groupEnd: noop,
  time: noop,
  timeEnd: noop,
};
