import {
  testFlakyAPI,
  testAttemptTimeout,
  testRetryOnFalsy,
  testCustomRetryLogic,
  testExponentialBackoff,
  testGlobalAbort,
  testErrorHistory,
  testPaymentAPI,
  testCustomFalsyPredicate,
  testSuccessOnFirstAttempt
} from './cases';

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