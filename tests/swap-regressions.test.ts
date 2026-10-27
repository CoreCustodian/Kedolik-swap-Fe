import assert from 'node:assert/strict';
import test from 'node:test';
import type { Connection, SignatureResult, SignatureStatus } from '@solana/web3.js';
import {
  assertTransactionSucceeded, confirmSignature, TransactionConfirmationError, TransactionExecutionError,
} from '../src/utils/transactionConfirmationCore.ts';
import { calculateSwapOutput, getSwapTradeFeeRate, validateSwapMinimum } from '../src/utils/swapMath.ts';
import { isSwapSlippageError } from '../src/utils/swapErrors.ts';
import { createRpcFetch } from '../src/utils/rpcFetch.ts';

const response = (value: SignatureStatus | null) => ({ context: { slot: 42 }, value });
const status = (confirmationStatus: SignatureStatus['confirmationStatus'] = 'confirmed', err: SignatureResult['err'] = null): SignatureStatus =>
  ({ slot: 42, confirmations: 1, confirmationStatus, err });
const mockConnection = (overrides: Partial<Connection> = {}): Connection => ({
  getSignatureStatus: async () => response(status()),
  getBlockHeight: async () => 100,
  removeSignatureListener: async () => undefined,
  ...overrides,
} as Connection);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('the 1% pool regression: default fee makes the minimum impossible without any price movement', () => {
  const wrongQuote = calculateSwapOutput(100, 10000, 10000);
  const actual = calculateSwapOutput(100, 10000, 10000, getSwapTradeFeeRate(10000));
  assert(actual.amountOut < wrongQuote.amountOut * 0.995);
  assert.doesNotThrow(() => validateSwapMinimum(actual.amountOut, actual.amountOut * 0.995));
});

test('each pool keeps its own fee and the discount fee is shared across quote and execution', () => {
  assert.equal(getSwapTradeFeeRate(0), 0);
  assert.equal(getSwapTradeFeeRate(2500), 2500);
  assert.equal(getSwapTradeFeeRate(10000), 10000);
  assert.equal(getSwapTradeFeeRate(10000, true), 2000);
  assert.equal(getSwapTradeFeeRate(2500, true), 2000);
});

test('fresh validation preserves the original minimum and rejects a worse quote', () => {
  const minimum = 99.5;
  assert.doesNotThrow(() => validateSwapMinimum(99.6, minimum));
  assert.throws(() => validateSwapMinimum(99.4, minimum), /price changed/i);
  assert.equal(minimum, 99.5);
  for (const invalid of [NaN, Infinity, 0, -1]) {
    assert.throws(() => validateSwapMinimum(invalid, minimum), /valid swap quote/i);
    assert.throws(() => validateSwapMinimum(100, invalid), /valid swap quote/i);
  }
});

test('6005 is decoded on Kedolik routes without assigning that meaning to other programs', () => {
  const error = new Error('Transaction failed: {"InstructionError":[4,{"Custom":6005}]}');
  assert(isSwapSlippageError(error, 'kedolik'));
  assert(!isSwapSlippageError(error, 'jupiter'));
  assert(isSwapSlippageError(new Error('custom program error: 0x1775'), 'kedolik'));
  assert(isSwapSlippageError({ logs: ['Error Code: ExceededSlippage. Error Number: 6005'] }, 'kedolik'));
  assert(!isSwapSlippageError(new Error('custom program error: 0x1776'), 'kedolik'));
});

test('successful confirmation retains the web3.js context and non-null value', async () => {
  const result = await confirmSignature(mockConnection(), 'sig', 'confirmed', 1000);
  assert.deepEqual(result, { context: { slot: 42 }, value: { err: null } });
  assert.doesNotThrow(() => assertTransactionSucceeded(result, 'sig'));
});

test('an on-chain instruction error stays a failure and retains its signature', async () => {
  const err = { InstructionError: [4, { Custom: 6005 }] };
  const result = await confirmSignature(mockConnection({ getSignatureStatus: async () => response(status('confirmed', err)) }), 'failed-sig', 'confirmed', 1000);
  assert.throws(() => assertTransactionSucceeded(result, 'failed-sig'), error =>
    error instanceof TransactionExecutionError && error.signature === 'failed-sig' && error.transactionError === err);
});

test('a stalled HTTP request cannot extend the overall confirmation deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const result = confirmSignature(mockConnection({ getSignatureStatus: () => new Promise(() => {}) }), 'stalled-sig', 'confirmed', 100);
  const rejection = assert.rejects(result, error => error instanceof TransactionConfirmationError
    && error.reason === 'timeout' && error.signature === 'stalled-sig');
  t.mock.timers.tick(100);
  await rejection;
});

test('HTTP confirmation succeeds when WebSocket registration throws', async () => {
  const result = await confirmSignature(mockConnection({ onSignature: () => { throw new Error('unsupported'); } }), 'sig', 'confirmed', 1000, { subscribe: true });
  assert.equal(result.value.err, null);
});

test('silent WebSockets do not prevent HTTP failure detection, and their listener is removed', async () => {
  let removed = false;
  const err = { InstructionError: [4, { Custom: 6005 }] };
  const result = await confirmSignature(mockConnection({
    onSignature: () => 7,
    removeSignatureListener: async id => { assert.equal(id, 7); removed = true; },
    getSignatureStatus: async () => response(status('confirmed', err)),
  }), 'sig', 'confirmed', 1000, { subscribe: true });
  assert.deepEqual(result.value.err, err);
  assert(removed);
});

test('WebSocket success resolves even while HTTP is stalled', async () => {
  let notify: Parameters<Connection['onSignature']>[1] | undefined;
  const result = confirmSignature(mockConnection({
    onSignature: (_signature, callback) => { notify = callback; return 1; },
    getSignatureStatus: () => new Promise(() => {}),
  }), 'sig', 'confirmed', 50, { subscribe: true });
  notify!({ err: null }, { slot: 55 });
  assert.deepEqual(await result, { context: { slot: 55 }, value: { err: null } });
});

test('expiry uses block height and rechecks history after the height read', async () => {
  const calls: string[] = [];
  await assert.rejects(confirmSignature(mockConnection({
    getSignatureStatus: async (_sig, config) => { assert.equal(config?.searchTransactionHistory, true); calls.push('history'); return response(null); },
    getBlockHeight: async commitment => { assert.equal(commitment, 'finalized'); calls.push('height'); return 101; },
  }), 'expired-sig', 'confirmed', 1000, { lastValidBlockHeight: 100 }), error =>
    error instanceof TransactionConfirmationError && error.reason === 'expired');
  assert.deepEqual(calls, ['history', 'height', 'history']);
});

test('a transaction found in the final history check succeeds even after blockhash expiry', async () => {
  let reads = 0;
  const result = await confirmSignature(mockConnection({
    getSignatureStatus: async () => response(++reads === 1 ? null : status()),
    getBlockHeight: async () => 101,
  }), 'sig', 'confirmed', 1000, { lastValidBlockHeight: 100 });
  assert.equal(result.value.err, null);
  assert.equal(reads, 2);
});

test('an observed processed transaction waits for confirmed, without being expired prematurely', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let reads = 0;
  const result = confirmSignature(mockConnection({
    getSignatureStatus: async () => response(status(++reads === 1 ? 'processed' : 'confirmed')),
    getBlockHeight: async () => { assert.fail('must not expire an observed transaction'); },
  }), 'sig', 'confirmed', 10000, { lastValidBlockHeight: 100 });
  await flush();
  t.mock.timers.tick(2000);
  assert.equal((await result).value.err, null);
  assert.equal(reads, 2);
});

test('transient status errors are retried within the original deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let reads = 0;
  const result = confirmSignature(mockConnection({
    getSignatureStatus: async () => { if (++reads === 1) throw new Error('HTTP 503'); return response(status()); },
  }), 'sig', 'confirmed', 10000);
  await flush();
  t.mock.timers.tick(2000);
  assert.equal((await result).value.err, null);
});

test('caller cancellation cleans up a WebSocket subscription', async () => {
  const controller = new AbortController();
  let removed = false;
  const result = confirmSignature(mockConnection({
    onSignature: () => 3,
    removeSignatureListener: async () => { removed = true; },
    getSignatureStatus: () => new Promise(() => {}),
  }), 'sig', 'confirmed', 50, { subscribe: true, abortSignal: controller.signal });
  const rejection = assert.rejects(result, /cancelled/);
  controller.abort(new Error('cancelled'));
  await rejection;
  assert(removed);
});

test('RPC fetch aborts a stalled request and preserves caller cancellation', async () => {
  const stalledFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    if (init?.signal?.aborted) { reject(init.signal.reason); return; }
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
  await assert.rejects(createRpcFetch(10, stalledFetch)('https://rpc.example'), /RPC request timed out/);
  const controller = new AbortController();
  const pending = createRpcFetch(1000, stalledFetch)('https://rpc.example', { signal: controller.signal });
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(pending, /caller cancelled/);
});

test('a read timeout is not applied to transaction submission, whose outcome could be ambiguous', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let deliver: ((response: Response) => void) | undefined;
  const submit: typeof fetch = async (_input, init) => {
    assert.equal(init?.signal, undefined);
    return new Promise(resolve => { deliver = resolve; });
  };
  const pending = createRpcFetch(10, submit)('https://rpc.example', {
    method: 'POST', body: JSON.stringify({ method: 'sendTransaction', params: ['test-bytes'] }),
  });
  t.mock.timers.tick(100);
  const delivered = new Response('{}');
  deliver!(delivered);
  assert.equal(await pending, delivered);
});
