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

const getStatusCode = (error: unknown): number | null => {
  if (error == null) return null;
  if (typeof error === 'object' && error !== null) {
    if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
    if ('status' in error && typeof error.status === 'number') return error.status;
    if ('code' in error && typeof error.code === 'number') return error.code;
    if (
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'status' in error.response &&
      typeof error.response.status === 'number'
    )
      return error.response.status;
  }
  return null;
};

/**
 * Default retry condition logic. Retries on 5xx server errors, timeouts, or falsy results.
 * @param error The error object.
 * @param _attempt The current attempt number.
 * @returns True if the operation should be retried.
 */
const defaultShouldRetry = (error: unknown, _attempt?: number): boolean => {
  const statusCode = getStatusCode(error);
  if (statusCode !== null && statusCode >= 500 && statusCode < 600) return true;
  if (error instanceof TimeoutError || error instanceof FalsyResultError) return true;
  return false;
};

export type JitterStrategy = 'none' | 'full' | 'equal';

export interface RetryOptions<E> {
  retries?: number;
  delay?: number;
  maxDelay?: number;
  jitter?: JitterStrategy;
  shouldRetry?: (error: E | RetryError, attempt: number) => boolean | Promise<boolean>;
  retryOnFalsy?: boolean | ((value: unknown) => boolean);
  signal?: AbortSignal;
  attemptTimeout?: number;
  onRetry?: (attempt: number, error: E | RetryError, delay: number) => void;
}

type RetryResult<T> = { data?: T; error?: unknown } | T | null | undefined | false;
export type RetrySuccess<T> = { data: T; errors: null; attempts: number };
export type RetryFailure<E> = { data: null; errors: (E | RetryError)[]; attempts: number };
export type RetryPromiseResult<T, E> = RetrySuccess<T> | RetryFailure<E>;

function checkAndThrowFalsy<T>(
  result: T,
  retryOnFalsy: boolean | ((value: unknown) => boolean)
): void {
  let shouldRetryOnValue = false;
  if (typeof retryOnFalsy === 'function') {
    shouldRetryOnValue = retryOnFalsy(result);
  } else if (retryOnFalsy === true) {
    shouldRetryOnValue = result == null;
  }
  if (shouldRetryOnValue) {
    throw new FalsyResultError('Result was considered falsy.');
  }
}

async function executeAttempt<T, E extends Error>(
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

function calculateDelay<E>(options: RetryOptions<E>, attempt: number): number {
  const { delay = 500, maxDelay = 7000, jitter = 'full' } = options;
  let wait = Math.min(delay * 2 ** (attempt - 1), maxDelay);
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
  return Math.floor(wait);
}

async function waitForDelay(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new AbortError('Delay aborted.');
  }
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let delayAbortListener: (() => void) | undefined;

  try {
    const delayPromise = new Promise<void>(resolve => {
      delayTimer = setTimeout(resolve, delay);
    });

    if (signal) {
      await Promise.race([
        delayPromise,
        new Promise<never>((_, reject) => {
          delayAbortListener = () => reject(new AbortError('Delay aborted.'));
          signal.addEventListener('abort', delayAbortListener, { once: true });
        })
      ]);
    } else {
      await delayPromise;
    }
  } finally {
    clearTimeout(delayTimer);
    if (delayAbortListener) {
      signal?.removeEventListener('abort', delayAbortListener);
    }
  }
}

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
