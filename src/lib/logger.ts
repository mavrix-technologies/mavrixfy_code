/** Development diagnostics and compact release error labels. */
type LogArgs = unknown[];
const label = (args: LogArgs): string => typeof args[0] === "string" ? args[0] : "[Mavrixfy] Error";

export const logger = {
  warn: (...args: LogArgs) => {
    if (__DEV__) console.warn(...args);
    else console.warn(label(args));
  },
  error: (...args: LogArgs) => {
    if (__DEV__) console.error(...args);
    else console.error(label(args));
  },
};
