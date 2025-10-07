import type { RetryError } from './errors';

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

export type RetryResult<T> = { data?: T; error?: unknown } | T | null | undefined | false;
export type RetrySuccess<T> = { data: T; errors: null; attempts: number };
export type RetryFailure<E> = { data: null; errors: (E | RetryError)[]; attempts: number };
export type RetryPromiseResult<T, E> = RetrySuccess<T> | RetryFailure<E>;
