export function createFlakyAPI(failCount: number, delayMs: number = 100) {
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

export function createSlowAPI(delayMs: number = 10000) {
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

export function createSoftFailureAPI(failCount: number) {
  let attempts = 0;
  return async () => {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 50));

    if (attempts <= failCount) return null; // Soft failure - no error thrown

    return { userId: 123, name: 'John Doe' };
  };
}

export function createStatusCodeAPI(statusCodes: number[]) {
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

export function createPaymentAPI(successRate: number = 0.5) {
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
