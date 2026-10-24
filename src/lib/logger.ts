/** Keep existing diagnostic call sites silent in every build. */
type LogArgs = unknown[];
const silent = (..._args: LogArgs): void => undefined;

export const logger = {
  warn: silent,
  error: silent,
};
