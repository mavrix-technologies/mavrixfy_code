/** Development diagnostics and compact release error labels. */
type LogArgs = unknown[];
const label = (args: LogArgs): string => typeof args[0] === "string" ? args[0] : "[Mavrixfy] Error";

export const logger = {
  log: (...args: LogArgs) => { if (__DEV__) console.log(...args); },
  info: (...args: LogArgs) => { if (__DEV__) console.info(...args); },
  warn: (...args: LogArgs) => {
    if (__DEV__) console.warn(...args);
    else console.warn(label(args));
  },
  error: (...args: LogArgs) => {
    if (__DEV__) console.error(...args);
    else console.error(label(args));
  },
  debug: (...args: LogArgs) => { if (__DEV__) console.debug(...args); },
  group: (...args: LogArgs) => { if (__DEV__) console.group(...args); },
  groupEnd: () => { if (__DEV__) console.groupEnd(); },
  time: (label: string) => { if (__DEV__) console.time(label); },
  timeEnd: (label: string) => { if (__DEV__) console.timeEnd(label); },
};
