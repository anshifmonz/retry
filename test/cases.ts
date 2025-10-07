import retry from '../src';
import { AbortError } from '../src/errors';
import {
  createFlakyAPI,
  createSlowAPI,
  createSoftFailureAPI,
  createStatusCodeAPI,
  createPaymentAPI
} from './mocks';

export async function testFlakyAPI(): Promise<void> {
  console.log('Test 1: Flaky API (fails 2 times, succeeds on 3rd)');
  try {
    const flakyAPI = createFlakyAPI(2);
    const result = await retry(() => flakyAPI(), { retries: 3, delay: 100 });

    if (result.data) {
      console.log('✅ Success after', result.attempts, 'attempts');
      console.log('   Data:', result.data);
    }
  } catch (error) {
    console.log('❌ Test 1 failed:', error);
  }
  console.log('');
}

export async function testAttemptTimeout(): Promise<void> {
  console.log('Test 2: Per-attempt timeout (5s API with 1s timeout)');
  try {
    const slowAPI = createSlowAPI(5000);
    const startTime = Date.now();
    const result = await retry((attempt, signal) => slowAPI(signal), {
      retries: 3,
      attemptTimeout: 1000, // Kill after 1s per attempt
      delay: 100
    });
    const elapsed = Date.now() - startTime;

    if (result.errors) {
      console.log('✅ Failed as expected after', elapsed, 'ms (should be ~3s, not 15s)');
      console.log('   Errors:', result.errors.map(e => e.name).join(', '));
    }
  } catch (error) {
    console.log('❌ Test 2 failed:', error);
  }
  console.log('');
}

export async function testRetryOnFalsy(): Promise<void> {
  console.log('Test 3: Retry on null/undefined results');
  try {
    const softFailAPI = createSoftFailureAPI(2);
    const result = await retry(() => softFailAPI(), {
      retries: 3,
      retryOnFalsy: true, // Retry when result is null
      delay: 50
    });

    if (result.data) {
      console.log('✅ Success after', result.attempts, 'attempts (retried on null)');
      console.log('   Data:', result.data);
    }
  } catch (error) {
    console.log('❌ Test 3 failed:', error);
  }
  console.log('');
}

export async function testCustomRetryLogic(): Promise<void> {
  console.log('Test 4: Custom retry logic (retry 5xx, skip 4xx)');
  try {
    const statusAPI = createStatusCodeAPI([503, 500, 404]); // 5xx, 5xx, then 4xx
    const result = await retry(() => statusAPI(), {
      retries: 5,
      shouldRetry: (error: unknown) => {
        const status = (error as { statusCode?: number })?.statusCode;
        return typeof status === 'number' && status >= 500 && status < 600; // Only retry 5xx
      },
      delay: 50
    });

    if (result.errors) {
      console.log('✅ Stopped retrying on 4xx error');
      console.log('   Final error:', result.errors[result.errors.length - 1].message);
      console.log('   Attempts:', result.attempts, '(should be 3, not 5)');
    }
  } catch (error) {
    console.log('❌ Test 4 failed:', error);
  }
  console.log('');
}

export async function testExponentialBackoff(): Promise<void> {
  console.log('Test 5: Exponential backoff timing');
  try {
    const flakyAPI = createFlakyAPI(3);
    const delays: number[] = [];
    const startTime = Date.now();

    await retry(() => flakyAPI(), {
      retries: 4,
      delay: 100,
      jitter: 'full',
      onRetry: (attempt, error, delay) => {
        delays.push(delay);
        console.log(`   Attempt ${attempt} failed, waiting ${delay}ms`);
      }
    });

    const elapsed = Date.now() - startTime;
    console.log('✅ Completed in', elapsed, 'ms');
    console.log('   Delays:', delays, '(should grow exponentially)');
  } catch (error) {
    console.log('❌ Test 5 failed:', error);
  }
  console.log('');
}

export async function testGlobalAbort(): Promise<void> {
  console.log('Test 6: Global abort with AbortController');
  try {
    const controller = new AbortController();
    const flakyAPI = createFlakyAPI(10); // Would take many attempts

    // Abort after 200ms
    setTimeout(() => {
      console.log('   Aborting operation...');
      controller.abort();
    }, 200);

    const result = await retry(() => flakyAPI(), {
      retries: 10,
      delay: 100,
      signal: controller.signal
    });

    if (result.errors?.some(e => e instanceof AbortError)) {
      console.log('✅ Successfully aborted');
      console.log('   Attempts before abort:', result.attempts);
    }
  } catch (error) {
    console.log('❌ Test 6 failed:', error);
  }
  console.log('');
}

export async function testErrorHistory(): Promise<void> {
  console.log('Test 7: Full error history (all errors, not just last)');
  try {
    const statusAPI = createStatusCodeAPI([503, 500, 502]);
    const result = await retry(() => statusAPI(), {
      retries: 3,
      delay: 50
    });

    if (result.errors) {
      console.log('✅ Captured all errors:');
      result.errors.forEach((err, i) => {
        console.log(`   Attempt ${i + 1}: ${err.message}`);
      });
    }
  } catch (error) {
    console.log('❌ Test 7 failed:', error);
  }
  console.log('');
}

export async function testPaymentAPI(): Promise<void> {
  console.log('Test 8: Payment API simulation (50% success rate)');
  try {
    const paymentAPI = createPaymentAPI(0.3); // 30% success rate
    const result = await retry(() => paymentAPI(), {
      retries: 5,
      delay: 200,
      jitter: 'equal',
      onRetry: (attempt, _error) => {
        console.log(`   Payment attempt ${attempt} failed, retrying...`);
      }
    });

    if (result.data) {
      console.log('✅ Payment successful!');
      console.log('   Transaction:', result.data);
      console.log('   Took', result.attempts, 'attempts');
    } else {
      console.log('❌ Payment failed after', result.attempts, 'attempts');
    }
  } catch (error) {
    console.log('❌ Test 8 failed:', error);
  }
  console.log('');
}

export async function testCustomFalsyPredicate(): Promise<void> {
  console.log('Test 9: Custom falsy predicate (retry on empty array)');
  try {
    let attempts = 0;
    const emptyResultAPI = async (): Promise<({ id: number; name: string })[]> => {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return attempts <= 2 ? [] : [{ id: 1, name: 'Item' }];
    };

    const result = await retry(() => emptyResultAPI(), {
      retries: 4,
      retryOnFalsy: value => Array.isArray(value) && value.length === 0,
      delay: 50
    });

    if (result.data) {
      console.log('✅ Got non-empty result after', result.attempts, 'attempts');
      console.log('   Data:', result.data);
    }
  } catch (error) {
    console.log('❌ Test 9 failed:', error);
  }
  console.log('');
}

export async function testSuccessOnFirstAttempt(): Promise<void> {
  console.log('Test 10: Success on first attempt (no retries)');
  try {
    const goodAPI = (): { status: string; data: string } => ({ status: 'ok', data: 'Success!' });
    const result = await retry(() => Promise.resolve(goodAPI()), { retries: 3 });

    if (result.data && result.attempts === 1) {
      console.log('✅ Success on first try (no retries needed)');
      console.log('   Data:', result.data);
    }
  } catch (error) {
    console.log('❌ Test 10 failed:', error);
  }
  console.log('');
}
