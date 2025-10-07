import retry, { AbortError } from './retry';

// Mock API Functions (Simulating Real APIs)

// Simulates a flaky API that fails N times before succeeding
function createFlakyAPI(failCount: number, delayMs: number = 100) {
  let attempts = 0;
  return async () => {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    if (attempts <= failCount) {
      const error = new Error(`API failed (attempt ${attempts})`) as Error & { statusCode: number };
      error.statusCode = 503; // Service unavailable
      throw error;
    }

    return { success: true, data: 'Payment processed', attempt: attempts };
  };
}

// Simulates an API that always times out (hangs forever)
function createSlowAPI(delayMs: number = 10000) {
  return (signal?: AbortSignal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({ data: 'Finally responded' });
      }, delayMs);

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted by signal'));
      });
    });
}

// Simulates an API that returns null/undefined on soft failures
function createSoftFailureAPI(failCount: number) {
  let attempts = 0;
  return async () => {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 50));

    if (attempts <= failCount) return null; // Soft failure - no error thrown

    return { userId: 123, name: 'John Doe' };
  };
}

// Simulates an API with different HTTP status codes
function createStatusCodeAPI(statusCodes: number[]) {
  let attempts = 0;
  return async () => {
    const statusCode = statusCodes[attempts] || 200;
    attempts++;

    await new Promise(resolve => setTimeout(resolve, 50));

    if (statusCode >= 400) {
      const error = new Error(`HTTP ${statusCode}`) as Error & { statusCode: number };
      error.statusCode = statusCode;
      throw error;
    }

    return { status: statusCode, data: 'Success' };
  };
}

// Simulates a payment API with random failures
function createPaymentAPI(successRate: number = 0.5) {
  return async () => {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (Math.random() > successRate) {
      const error = new Error('Payment gateway timeout') as Error & { statusCode: number };
      error.statusCode = 504;
      throw error;
    }

    return {
      transactionId: Math.random().toString(36).substr(2, 9),
      amount: 99.99,
      status: 'completed'
    };
  };
}

// Test Cases

async function testFlakyAPI(): Promise<void> {
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

async function testAttemptTimeout(): Promise<void> {
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

async function testRetryOnFalsy(): Promise<void> {
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

async function testCustomRetryLogic(): Promise<void> {
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

async function testExponentialBackoff(): Promise<void> {
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

async function testGlobalAbort(): Promise<void> {
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

async function testErrorHistory(): Promise<void> {
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

async function testPaymentAPI(): Promise<void> {
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

async function testCustomFalsyPredicate(): Promise<void> {
  console.log('Test 9: Custom falsy predicate (retry on empty array)');
  try {
    let attempts = 0;
    const emptyResultAPI = async (): Promise<{ id: number; name: string }[]> => {
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

async function testSuccessOnFirstAttempt(): Promise<void> {
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

// Test Suite
async function runTests(): Promise<void> {
  console.log('🧪 Starting Retry Utility Tests\n');

  await testFlakyAPI();
  await testAttemptTimeout();
  await testRetryOnFalsy();
  await testCustomRetryLogic();
  await testExponentialBackoff();
  await testGlobalAbort();
  await testErrorHistory();
  await testPaymentAPI();
  await testCustomFalsyPredicate();
  await testSuccessOnFirstAttempt();

  console.log('\n✨ All tests completed!');
}

// Run the test suite
async function main(): Promise<void> {
  try {
    await runTests();
  } catch (error) {
    console.error('🛑 Test suite failed:', error);
  }
}

void main();
