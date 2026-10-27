import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { calculateSwapOutput, getSwapTradeFeeRate } from '../src/utils/swapMath.ts';
import { assertTransactionSucceeded, TransactionConfirmationError, TransactionExecutionError } from '../src/utils/transactionConfirmationCore.ts';

const require = createRequire(import.meta.url);
const mint = (byte: number) => new PublicKey(Buffer.alloc(32, byte));
const walletPublicKey = Keypair.generate().publicKey;

// Execute the actual routing module with only its wallet/RPC/program boundaries
// replaced. No network, keys or on-chain transactions are used by this test.
const loadRouter = (confirmationError: unknown = null) => {
  const instructions: Array<{ amount: number; minimum: number }> = [];
  const programId = mint(9);
  const confirmation = {
    assertTransactionSucceeded,
    confirmTransactionWithBlockhash: async () => {
      if (confirmationError instanceof Error) throw confirmationError;
      return { context: { slot: 10 }, value: { err: confirmationError } };
    },
  };
  const dependencies: Record<string, unknown> = {
    './amm': {
      calculateSwapOutput,
      getProgram: () => ({ methods: {
        swapBaseInput: (amount: { toNumber(): number }, minimum: { toNumber(): number }) => {
          instructions.push({ amount: amount.toNumber(), minimum: minimum.toNumber() });
          return { accounts: () => ({ instruction: async () => new TransactionInstruction({ keys: [], programId, data: Buffer.alloc(0) }) }) };
        },
      } }),
      getAuthority: () => mint(7), getObservationState: () => mint(8),
      AMM_CONFIG: mint(6), isNativeSOL: () => false,
    },
    './swapMath': { getSwapTradeFeeRate },
    './transactionConfirmation': confirmation,
    '../config/fees': {},
    '../config/addresses': { getExplorerUrl: () => 'https://explorer.example/test' },
    './txSender': { sendViaWallet: async () => 'test-signature' },
  };
  const source = readFileSync(new URL('../src/utils/routing.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  new Function('require', 'exports', compiled)((name: string) => dependencies[name] ?? require(name), exports);
  return { router: exports, instructions };
};

const fixture = () => {
  const path = [mint(1), mint(2), mint(3)];
  const pools = [10000, 2500].map((tradeFeeRate, index) => ({
    address: mint(20 + index), token0Mint: path[index], token1Mint: path[index + 1],
    token0Vault: mint(30 + index), token1Vault: mint(40 + index),
    token0Reserve: 10000, token1Reserve: 10000, token0Decimals: 6, token1Decimals: 6,
    tradeFeeRate, ammConfig: mint(6),
  }));
  return { path, pools, hops: 2, expectedOutput: 0, priceImpact: 0 };
};
const connection = {
  getAccountInfo: async () => ({}),
  getLatestBlockhash: async () => ({ blockhash: mint(5).toBase58(), lastValidBlockHeight: 100 }),
};

test('the actual multi-hop builder uses the 1% fee for intermediate minimum and next-hop input', async t => {
  t.mock.method(console, 'log', () => undefined);
  const { router, instructions } = loadRouter();
  const route = fixture();
  const firstOutput = calculateSwapOutput(100, 10000, 10000, 10000).amountOut;
  const finalOutput = calculateSwapOutput(firstOutput, 10000, 10000, 2500).amountOut;
  const result = await router.executeMultiHopSwap(route, 100, finalOutput * 0.995, connection, {}, walletPublicKey, 0.5, false);
  assert.deepEqual(result, ['test-signature']);
  assert.equal(instructions[0].minimum, Math.floor(firstOutput * 0.995 * 1e6));
  assert.equal(instructions[1].amount, Math.floor(firstOutput * 1e6));
});

test('multi-hop propagates a failed confirmation instead of returning a successful signature', async t => {
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const { router } = loadRouter({ InstructionError: [4, { Custom: 6005 }] });
  await assert.rejects(router.executeMultiHopSwap(fixture(), 100, 1, connection, {}, walletPublicKey),
    error => error instanceof TransactionExecutionError && error.signature === 'test-signature');
});

test('multi-hop retains an uncertain confirmation and its signature for status recovery', async t => {
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const uncertainty = new TransactionConfirmationError('test-signature', 'timeout');
  const { router } = loadRouter(uncertainty);
  await assert.rejects(router.executeMultiHopSwap(fixture(), 100, 1, connection, {}, walletPublicKey), error => error === uncertainty);
});
