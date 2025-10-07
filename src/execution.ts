import { AbortError, TimeoutError } from './errors';
import type { RetryOptions, RetryResult } from './types';
import { checkAndThrowFalsy } from './utils';

export async function executeAttempt<T, E extends Error>(
  fn: (attempt: number, attemptSignal?: AbortSignal) => Promise<RetryResult<T>>,
  attempt: number,
  options: RetryOptions<E>
): Promise<T> {
  const { attemptTimeout, signal: globalSignal, retryOnFalsy = false } = options;
  const attemptController = new AbortController();
  const attemptSignal = attemptController.signal;
  let attemptTimer: ReturnType<typeof setTimeout> | undefined;
  let globalAbortListener: (() => void) | undefined;

  try {
    const racers: Promise<unknown>[] = [fn(attempt, attemptSignal)];

    if (attemptTimeout) {
      racers.push(
        new Promise<never>((_, reject) => {
          attemptTimer = setTimeout(() => {
            attemptController.abort();
            reject(new TimeoutError(`Attempt ${attempt} timed out after ${attemptTimeout}ms`));
          }, attemptTimeout);
        })
      );
    }

    if (globalSignal) {
      racers.push(
        new Promise<never>((_, reject) => {
          if (globalSignal.aborted) return reject(new AbortError('Operation aborted.'));
          globalAbortListener = () => {
            attemptController.abort();
            reject(new AbortError('Operation aborted.'));
          };
          globalSignal.addEventListener('abort', globalAbortListener, { once: true });
        })
      );
    }

    const result = await Promise.race(racers);

    if (result && typeof result === 'object' && ('data' in result || 'error' in result)) {
      const { data, error } = result as { data?: T; error?: unknown };
      if (error) throw error;
      checkAndThrowFalsy(data, retryOnFalsy);
      return data as T;
    }

    checkAndThrowFalsy(result, retryOnFalsy);
    return result as T;
  } finally {
    clearTimeout(attemptTimer);
    if (globalAbortListener) {
      globalSignal?.removeEventListener('abort', globalAbortListener);
    }
    attemptController.abort();
  }
}
