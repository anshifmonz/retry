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
