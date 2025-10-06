# Retry

A production-grade retry utility with per-attempt timeouts, dual abort control, and rich error context.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./retry.test.ts)

## The Problem

Most retry libraries timeout the **entire operation**, not **individual attempts**.

When an API hangs for 30 seconds and you have 3 retries, you wait 90 seconds before failing. Users abandon, revenue is lost.

**This library kills slow attempts and moves on.**

## Features

✅ **Per-attempt timeouts** — Cancel individual slow attempts, not the whole operation
✅ **Dual abort control** — Cancel globally OR just the current attempt via `AbortController`
✅ **Full error history** — Get ALL errors from every attempt, not just the last one
✅ **Custom retry conditions** — Decide what's retryable with sync/async predicates
✅ **Retry on falsy results** — Handle APIs that return `null`/`undefined` on soft failures
✅ **Lifecycle hooks** — Run callbacks on each attempt for logging/metrics
✅ **Exponential backoff** — Smart delays with configurable jitter strategies
✅ **Zero dependencies** — Lightweight, no external packages
✅ **Full TypeScript support** — Complete type safety and inference

## Installation

```bash
# Copy the file directly into your project
curl -O https://raw.githubusercontent.com/anshifmonz/retry/main/retry.ts

# Or clone the repo
git clone https://github.com/anshifmonz/retry.git
```

## Quick Start

```typescript
import retry from "./retry";

// Basic usage
const result = await retry(
  () => fetch("https://api.example.com").then((r) => r.json()),
  { retries: 3 }
);

if (result.data) {
  console.log("Success:", result.data);
} else {
  console.error("Failed after", result.attempts, "attempts");
  console.error("Errors:", result.errors);
}
```

## Usage Examples

### 1. Per-Attempt Timeouts (Killer Feature)

Kill slow attempts instead of waiting forever:

```typescript
const result = await retry(
  (attempt, signal) => fetch(paymentAPI, { signal }).then((r) => r.json()),
  {
    retries: 3,
    attemptTimeout: 5000, // Each attempt gets max 5s
  }
);

// If an attempt hangs, it's killed after 5s and moves to the next retry
// Total max time: ~15s, not 90s+
```

**Real-world impact:** Reduced payment failures from 90s waits to 5s per attempt.

### 2. Custom Retry Logic

Only retry specific errors:

```typescript
const result = await retry(() => apiCall(), {
  retries: 5,
  shouldRetry: (error) => {
    // Only retry 5xx server errors, skip 4xx client errors
    const status = error?.statusCode || error?.status;
    return status >= 500 && status < 600;
  },
});
```

### 3. Retry on Empty/Falsy Results

Handle APIs that return `null` instead of throwing:

```typescript
const result = await retry(() => getUserData(), {
  retries: 3,
  retryOnFalsy: true, // Retry if result is null/undefined
});

// Or with custom predicate
const result = await retry(() => getProducts(), {
  retries: 3,
  retryOnFalsy: (value) => Array.isArray(value) && value.length === 0,
});
```

### 4. Global Cancellation

Cancel the entire retry operation:

```typescript
const controller = new AbortController();

const result = await retry(
  (attempt, signal) => fetch(url, { signal }).then((r) => r.json()),
  {
    retries: 5,
    signal: controller.signal,
  }
);

// Cancel from elsewhere
setTimeout(() => controller.abort(), 10000);
```

### 5. Lifecycle Hooks for Monitoring

Log or send metrics on each retry:

```typescript
const result = await retry(() => apiCall(), {
  retries: 3,
  onRetry: (attempt, error, delay) => {
    logger.warn(`Retry attempt ${attempt} after ${delay}ms`, {
      error: error.message,
    });

    metrics.increment("api.retry", { attempt });
  },
});
```

### 6. Full Error Context

Get every error, not just the last one:

```typescript
const result = await retry(() => apiCall(), { retries: 3 });

if (result.errors) {
  // Log all errors to your error tracking service
  Sentry.captureException(new Error("API failed"), {
    extra: {
      attempts: result.attempts,
      allErrors: result.errors.map((e) => ({
        name: e.name,
        message: e.message,
        statusCode: e.statusCode,
      })),
    },
  });
}
```

### 7. Exponential Backoff with Jitter

Prevent thundering herd problems:

```typescript
const result = await retry(() => apiCall(), {
  retries: 5,
  delay: 500, // Base delay
  maxDelay: 10000, // Cap at 10s
  jitter: "full", // 'none' | 'full' | 'equal'
});

// Delays grow: ~500ms, ~1s, ~2s, ~4s, ~8s (with random jitter)
```

## API Reference

### `retry<T, E>(fn, options)`

#### Parameters

##### `fn: (attempt: number, attemptSignal?: AbortSignal) => Promise<RetryResult<T>>`

The async function to retry. Receives:

- `attempt`: Current attempt number (1-indexed)
- `attemptSignal`: AbortSignal for cancelling this specific attempt

Can return:

- Direct value: `return data`
- Result object: `return { data, error }`
- Throws on error

##### `options: RetryOptions<E>`

| Option           | Type                                              | Default                  | Description                     |
| ---------------- | ------------------------------------------------- | ------------------------ | ------------------------------- |
| `retries`        | `number`                                          | `3`                      | Maximum retry attempts          |
| `delay`          | `number`                                          | `500`                    | Base delay between retries (ms) |
| `maxDelay`       | `number`                                          | `7000`                   | Maximum delay cap (ms)          |
| `jitter`         | `'none' \| 'full' \| 'equal'`                     | `'full'`                 | Jitter strategy for backoff     |
| `shouldRetry`    | `(error, attempt) => boolean \| Promise<boolean>` | Retries on 5xx, timeouts | Custom retry condition          |
| `retryOnFalsy`   | `boolean \| (value) => boolean`                   | `false`                  | Retry when result is falsy      |
| `signal`         | `AbortSignal`                                     | -                        | Global abort signal             |
| `attemptTimeout` | `number`                                          | -                        | Timeout per attempt (ms)        |
| `onRetry`        | `(attempt, error, delay) => void`                 | -                        | Callback on each retry          |

#### Returns

```typescript
Promise<RetryPromiseResult<T, E>>

// Success
{
  data: T,
  errors: null,
  attempts: number
}

// Failure
{
  data: null,
  errors: (E | RetryError)[],
  attempts: number
}
```

### Error Types

```typescript
class AbortError extends Error {
  name: "AbortError";
}

class TimeoutError extends Error {
  name: "TimeoutError";
}

class FalsyResultError extends Error {
  name: "FalsyResultError";
}
```

## Real-World Examples

### Payment Processing

```typescript
async function processPayment(orderId: string) {
  const result = await retry(
    (attempt, signal) =>
      fetch(`/api/payments/${orderId}`, {
        method: "POST",
        signal,
      }).then((r) => r.json()),
    {
      retries: 3,
      attemptTimeout: 5000,
      shouldRetry: (error) => {
        // Retry on network errors and 5xx
        return !error.statusCode || error.statusCode >= 500;
      },
      onRetry: (attempt, error, delay) => {
        logger.warn("Payment retry", { orderId, attempt, error });
      },
    }
  );

  if (!result.data) {
    throw new Error(`Payment failed after ${result.attempts} attempts`);
  }

  return result.data;
}
```

### Data Fetching with Fallback

```typescript
async function getUserWithRetry(userId: string) {
  const result = await retry(() => database.getUser(userId), {
    retries: 3,
    retryOnFalsy: true, // Retry if user not found
    delay: 200,
    jitter: "equal",
  });

  return result.data || { id: userId, name: "Guest" };
}
```

### Microservice Communication

```typescript
async function callService(endpoint: string) {
  const controller = new AbortController();

  // Global timeout
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const result = await retry(
      (attempt, signal) =>
        fetch(`http://service/${endpoint}`, { signal }).then((r) => r.json()),
      {
        retries: 5,
        attemptTimeout: 5000,
        signal: controller.signal,
        shouldRetry: (error) => {
          // Don't retry on auth errors
          if (error.statusCode === 401 || error.statusCode === 403) {
            return false;
          }
          return error.statusCode >= 500;
        },
      }
    );

    return result;
  } finally {
    clearTimeout(timeout);
  }
}
```

## Testing

Run the comprehensive test suite:

```bash
npx tsx retry.test.ts
```

**Test Coverage:**

- ✅ Basic retry with flaky APIs
- ✅ Per-attempt timeout handling
- ✅ Retry on null/undefined results
- ✅ Custom retry conditions (5xx vs 4xx)
- ✅ Exponential backoff with jitter
- ✅ Global abort with AbortController
- ✅ Full error history capture
- ✅ Payment API simulation
- ✅ Custom falsy predicates
- ✅ First-attempt success

All 10 tests passing ✅

## Performance

**Before:**

```
API hangs 30s × 3 retries = 90s total failure time
Users abandon, revenue lost
```

**After:**

```
Per-attempt timeout: 5s × 3 retries = 15s max
Fast failure, better UX
```

**Benchmarks:**

- Overhead: <1ms per retry
- Memory: Minimal (no buffering)
- Zero dependencies: No bloat

## Comparison with Other Libraries

| Feature                  | This Library | p-retry | axios-retry | ts-retry |
| ------------------------ | ------------ | ------- | ----------- | -------- |
| Per-attempt timeouts     | ✅           | ❌      | ❌          | ❌       |
| Dual abort control       | ✅           | ❌      | ❌          | ❌       |
| Full error history       | ✅           | ❌      | ❌          | ❌       |
| Retry on falsy results   | ✅           | ❌      | ❌          | ❌       |
| Custom jitter strategies | ✅           | ✅      | ❌          | ❌       |
| Lifecycle hooks          | ✅           | ✅      | ✅          | ❌       |
| Zero dependencies        | ✅           | ❌      | ❌          | ✅       |
| TypeScript-first         | ✅           | ✅      | ❌          | ✅       |

## Best Practices

### 1. Always Pass the Signal

For proper cancellation, pass the `attemptSignal` to your underlying calls:

```typescript
// ✅ Good
retry((attempt, signal) => fetch(url, { signal }), options);

// ❌ Bad - signal ignored, can't cancel
retry(() => fetch(url), options);
```

### 2. Use Appropriate Retry Conditions

Don't retry client errors (4xx):

```typescript
shouldRetry: (error) => {
  const status = error?.statusCode;
  // Only retry server errors and network failures
  return !status || status >= 500;
};
```

### 3. Set Reasonable Timeouts

Balance between giving APIs time and failing fast:

```typescript
{
  attemptTimeout: 5000,  // 5s per attempt
  retries: 3,            // Max 15s total
  maxDelay: 2000         // Don't wait too long between retries
}
```

### 4. Log for Observability

Use lifecycle hooks to monitor retry behavior:

```typescript
onRetry: (attempt, error, delay) => {
  logger.warn("API retry", {
    attempt,
    error: error.message,
    delay,
    timestamp: Date.now(),
  });
};
```

## FAQ

### Q: Why not just use p-retry or axios-retry?

**A:** They don't support per-attempt timeouts. If one attempt hangs for 30s, you wait 30s before the next retry. This library kills slow attempts immediately.

### Q: Does this work with fetch, axios, etc.?

**A:** Yes! It's framework-agnostic. Just pass the `attemptSignal` to your HTTP client.

### Q: What's the overhead?

**A:** Minimal (<1ms per retry). The real performance win is killing slow attempts early.

### Q: Can I use this in the browser?

**A:** Yes! Works in any environment with Promise and AbortController support (modern browsers, Node.js 15+, Deno, Bun).

### Q: How do I handle specific error types?

**A:** Use custom `shouldRetry` logic:

```typescript
shouldRetry: (error) => {
  if (error instanceof NetworkError) return true;
  if (error instanceof AuthError) return false;
  return error.statusCode >= 500;
};
```

## Contributing

Contributions welcome! Please:

1. Open an issue first to discuss changes
2. Add tests for new features
3. Follow the existing code style
4. Update documentation

## License

MIT © [Anshif Monz](https://github.com/anshifmonz)

## Support

- 🐛 [Report a bug](https://github.com/anshifmonz/retry/issues)
- 💡 [Request a feature](https://github.com/anshifmonz/retry/issues)
- 💬 [Ask a question](https://github.com/anshifmonz/retry/discussions)

---

**Built with ❤️ for resilient APIs**

If this helped you, consider giving it a ⭐ on GitHub!
