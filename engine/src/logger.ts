const silent = import.meta.env.MODE === 'production' || import.meta.env.MODE === 'test';

/** Rounds a duration in milliseconds to 3 decimals. */
export function roundMs(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

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

/** Runs a step and logs how long it took at debug level. */
export async function timed<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logger.debug(label, { durationMs: roundMs(performance.now() - start) });
  }
}
