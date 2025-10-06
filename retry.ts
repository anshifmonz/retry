// Custom error classes for retry logic.
export class AbortError extends Error {
  constructor(message = 'The operation was aborted.') {
    super(message);
    this.name = 'AbortError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'The operation timed out.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class FalsyResultError extends Error {
  constructor(message = 'The result was falsy and retryOnFalsy is enabled.') {
    super(message);
    this.name = 'FalsyResultError';
  }
}

export type RetryError = AbortError | TimeoutError | FalsyResultError;

const getStatusCode = (error: any): number | null => {
  if (error == null) return null;
  if (typeof error.statusCode === 'number') return error.statusCode;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.code === 'number') return error.code;
  if (error.response && typeof error.response.status === 'number') return error.response.status;
  return null;
};

/**
 * Default retry condition logic. Retries on 5xx server errors, timeouts, or falsy results.
 * @param error The error object.
 * @param attempt The current attempt number.
 * @returns True if the operation should be retried.
 */
const defaultShouldRetry = (error: any, attempt?: number): boolean => {
  const statusCode = getStatusCode(error);
  if (statusCode !== null && statusCode >= 500 && statusCode < 600) return true;
  if (error instanceof TimeoutError || error instanceof FalsyResultError) return true;
  return false;
};

// Defines the available jitter strategies for backoff delays.
//  `none`: No jitter is applied. The delay is constant.
//  `full`: (Default) The delay is a random value between 0 and the calculated backoff.
//  `equal`: The delay is half of the calculated backoff plus a random value up to the other half.
export type JitterStrategy = 'none' | 'full' | 'equal';

export interface RetryOptions<E> {
  retries?: number;
  delay?: number;
  maxDelay?: number;
  jitter?: JitterStrategy;
  shouldRetry?: (error: E | RetryError, attempt: number) => boolean | Promise<boolean>;
  retryOnFalsy?: boolean | ((value: any) => boolean);
  signal?: AbortSignal;
  attemptTimeout?: number;
  onRetry?: (attempt: number, error: E | RetryError, delay: number) => void;
}

type RetryResult<T> = { data?: T; error?: any } | T | null | undefined | false;
export type RetrySuccess<T> = { data: T; errors: null; attempts: number };
export type RetryFailure<E> = { data: null; errors: (E | RetryError)[]; attempts: number };
export type RetryPromiseResult<T, E> = RetrySuccess<T> | RetryFailure<E>;

/**
 * An advanced retry function with exponential backoff, jitter, error filtering,
 * abort signals, and timeout handling.
 *
 * @template T The expected data type of the successful result.
 * @template E The expected error type from the function being retried.
 * @param fn The async function to retry. It receives the attempt number and a per-attempt AbortSignal.
 *           For cancellation to work, pass the `attemptSignal` to your underlying API call (e.g., fetch).
 * @param options Configuration for the retry behavior.
 * @returns A promise that resolves with a result object indicating success or failure.
 */
export default async function retry<T, E extends Error = Error>(
  fn: (attempt: number, attemptSignal?: AbortSignal) => Promise<RetryResult<T>>,
  options: RetryOptions<E> = {}
): Promise<RetryPromiseResult<T, E>> {
  const {
    retries = 3,
    delay = 500,
    maxDelay = 7000,
    jitter = 'full',
    shouldRetry = defaultShouldRetry,
    retryOnFalsy = false,
    signal,
    attemptTimeout,
    onRetry
  } = options;

  const errors: (E | RetryError)[] = [];

  for (let i = 0; i < retries; i++) {
    if (signal?.aborted) {
      errors.push(new AbortError());
      return { data: null, errors, attempts: i };
    }

    const attemptController = new AbortController();
    const attemptSignal = attemptController.signal;
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    let globalAbortListener: (() => void) | undefined;

    try {
      const racers: Promise<any>[] = [fn(i + 1, attemptSignal)];

      if (attemptTimeout) {
        racers.push(
          new Promise<never>((_, reject) => {
            attemptTimer = setTimeout(() => {
              attemptController.abort();
              reject(new TimeoutError(`Attempt ${i + 1} timed out after ${attemptTimeout}ms`));
            }, attemptTimeout);
          })
        );
      }

      if (signal) {
        racers.push(
          new Promise<never>((_, reject) => {
            if (signal.aborted) return reject(new AbortError('Operation aborted.'));
            globalAbortListener = () => {
              attemptController.abort();
              reject(new AbortError('Operation aborted.'));
            };
            signal.addEventListener('abort', globalAbortListener, { once: true });
          })
        );
      }

      const result = await Promise.race(racers);

      const checkAndThrowFalsy = (value: any) => {
        let shouldRetryOnValue = false;
        if (typeof retryOnFalsy === 'function') {
          shouldRetryOnValue = retryOnFalsy(value);
        } else if (retryOnFalsy === true) {
          shouldRetryOnValue = value == null;
        }
        if (shouldRetryOnValue) throw new FalsyResultError('Result was considered falsy.');
      };

      if (result && typeof result === 'object' && ('data' in result || 'error' in result)) {
        const { data, error } = result as { data?: T; error?: any };
        if (error) throw error;
        checkAndThrowFalsy(data);
        return { data: data as T, errors: null, attempts: i + 1 };
      }

      checkAndThrowFalsy(result);
      return { data: result as T, errors: null, attempts: i + 1 };
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

      if (!shouldRetryResult) return { data: null, errors, attempts: i + 1 };

      let wait = Math.min(delay * 2 ** i, maxDelay);
      switch (jitter) {
        case 'full':
          wait = Math.random() * wait;
          break;
        case 'equal':
          const half = wait / 2;
          wait = half + Math.random() * half;
          break;
        case 'none':
        default:
          break;
      }

      const finalWait = Math.floor(wait);
      onRetry?.(i + 1, err as E | RetryError, finalWait);

      let delayTimer: ReturnType<typeof setTimeout> | undefined;
      let delayAbortListener: (() => void) | undefined;
      try {
        const delayPromise = new Promise<void>(resolve => {
          delayTimer = setTimeout(resolve, finalWait);
        });

        if (signal) {
          await Promise.race([
            delayPromise,
            new Promise<never>((_, reject) => {
              if (signal.aborted) return reject(new AbortError('Delay aborted.'));
              delayAbortListener = () => reject(new AbortError('Delay aborted.'));
              signal.addEventListener('abort', delayAbortListener, { once: true });
            })
          ]);
        } else {
          await delayPromise;
        }
      } catch (delayAbortErr) {
        errors.push(delayAbortErr as AbortError);
        return { data: null, errors, attempts: i + 1 };
      } finally {
        clearTimeout(delayTimer);
        if (delayAbortListener) signal?.removeEventListener('abort', delayAbortListener);
      }
    } finally {
      clearTimeout(attemptTimer);
      if (globalAbortListener) signal?.removeEventListener('abort', globalAbortListener);
      attemptController.abort();
    }
  }

  return { data: null, errors, attempts: retries };
}
