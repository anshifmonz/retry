import { executeAttempt } from './execution';
import { AbortError, type RetryError } from './errors';
import type { RetryOptions, RetryPromiseResult, RetryResult } from './types';
import { calculateDelay, defaultShouldRetry, waitForDelay } from './utils';

export default async function retry<T, E extends Error = Error>(
  fn: (attempt: number, attemptSignal?: AbortSignal) => Promise<RetryResult<T>>,
  options: RetryOptions<E> = {}
): Promise<RetryPromiseResult<T, E>> {
  const { retries = 3, shouldRetry = defaultShouldRetry, onRetry, signal } = options;
  const errors: (E | RetryError)[] = [];

  for (let i = 0; i < retries; i++) {
    if (signal?.aborted) {
      errors.push(new AbortError());
      return { data: null, errors, attempts: i };
    }

    try {
      const data = await executeAttempt(fn, i + 1, options);
      return { data, errors: null, attempts: i + 1 };
    } catch (err) {
      errors.push(err as E | RetryError);

      if (i === retries - 1) break;

      let shouldRetryResult = false;
      try {
        shouldRetryResult = await shouldRetry(err as E | RetryError, i + 1);
      } catch (shouldRetryErr) {
        errors.push(shouldRetryErr as E | RetryError);
        return { data: null, errors, attempts: i + 1 };
      }

      if (!shouldRetryResult) {
        return { data: null, errors, attempts: i + 1 };
      }

      const delay = calculateDelay(options, i + 1);
      onRetry?.(i + 1, err as E | RetryError, delay);

      try {
        await waitForDelay(delay, signal);
      } catch (delayAbortErr) {
        errors.push(delayAbortErr as AbortError);
        return { data: null, errors, attempts: i + 1 };
      }
    }
  }

  return { data: null, errors, attempts: retries };
}
