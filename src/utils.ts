import type { RetryOptions } from './types';
import { AbortError, FalsyResultError, TimeoutError } from './errors';

export const getStatusCode = (error: unknown): number | null => {
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

export const defaultShouldRetry = (error: unknown, _attempt?: number): boolean => {
  const statusCode = getStatusCode(error);
  if (statusCode !== null && statusCode >= 500 && statusCode < 600) return true;
  if (error instanceof TimeoutError || error instanceof FalsyResultError) return true;
  return false;
};

export function checkAndThrowFalsy<T>(
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

export function calculateDelay<E>(options: RetryOptions<E>, attempt: number): number {
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

export async function waitForDelay(delay: number, signal?: AbortSignal): Promise<void> {
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
