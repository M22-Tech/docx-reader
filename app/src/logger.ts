const silent = !__DEV__ || process.env.NODE_ENV === 'test';

export const logger = {
  debug(...args: unknown[]): void {
    if (!silent) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (!silent) console.info(...args);
  },
  warn(...args: unknown[]): void {
    if (!silent) console.warn(...args);
  },
  error(...args: unknown[]): void {
    if (!silent) console.error(...args);
  },
};
