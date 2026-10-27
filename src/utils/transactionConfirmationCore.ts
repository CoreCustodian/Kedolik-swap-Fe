import type {
  Commitment, Connection, RpcResponseAndContext, SignatureResult, SignatureStatus,
} from '@solana/web3.js';

export class TransactionConfirmationError extends Error {
  constructor(
    public readonly signature: string, public readonly reason: 'timeout' | 'expired',
    public readonly lastValidBlockHeight?: number,
  ) {
    super(reason === 'expired'
      ? 'The transaction blockhash expired and no confirmation was found. Check the transaction before retrying.'
      : 'Confirmation is unavailable. The transaction may still complete. Check the transaction before retrying.');
    this.name = 'TransactionConfirmationError';
  }
}

export class TransactionExecutionError extends Error {
  constructor(public readonly signature: string, public readonly transactionError: SignatureResult['err']) {
    super(`Transaction failed: ${JSON.stringify(transactionError)}`);
    this.name = 'TransactionExecutionError';
  }
}

export const assertTransactionSucceeded = (result: RpcResponseAndContext<SignatureResult>, signature: string): void => {
  if (result.value.err) throw new TransactionExecutionError(signature, result.value.err);
};

const commitmentLevel = (commitment: Commitment): number => {
  if (commitment === 'finalized' || commitment === 'root' || commitment === 'max') return 3;
  if (commitment === 'processed' || commitment === 'recent') return 1;
  return 2;
};

/** A deadline must also cover an RPC request that never resolves. */
export const withTimeout = async <T>(operation: Promise<T>, timeout: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); }),
    ]);
  } finally { clearTimeout(timer); }
};

/** HTTP polling stays active even if a configured WebSocket silently disconnects. */
export const confirmSignature = (
  connection: Connection, signature: string, commitment: Commitment, timeout: number,
  options: { subscribe?: boolean; lastValidBlockHeight?: number; abortSignal?: AbortSignal } = {},
): Promise<RpcResponseAndContext<SignatureResult>> => new Promise((resolve, reject) => {
  let settled = false;
  let subscriptionId: number | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let observed = false;
  const deadline = Date.now() + timeout;

  const cleanup = () => {
    clearTimeout(timeoutTimer);
    clearTimeout(pollTimer);
    options.abortSignal?.removeEventListener('abort', abort);
    if (subscriptionId !== undefined) {
      void connection.removeSignatureListener(subscriptionId).catch(() => undefined);
      subscriptionId = undefined;
    }
  };
  const finish = (result: RpcResponseAndContext<SignatureResult>) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(result);
  };
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(error);
  };
  const abort = () => fail(options.abortSignal?.reason ?? new Error('Transaction confirmation aborted'));
  const timeoutTimer = setTimeout(() => fail(new TransactionConfirmationError(signature, 'timeout', options.lastValidBlockHeight)), timeout);
  options.abortSignal?.addEventListener('abort', abort, { once: true });
  if (options.abortSignal?.aborted) { abort(); return; }

  const request = <T>(operation: Promise<T>) => withTimeout(
    operation, Math.max(1, Math.min(5000, deadline - Date.now())), 'Transaction status request timed out',
  );
  const acceptStatus = (response: RpcResponseAndContext<SignatureStatus | null>): boolean => {
    if (!response.value) return false;
    observed = true;
    const level = response.value.confirmationStatus
      ?? (response.value.confirmations === null ? 'finalized' : 'processed');
    if (commitmentLevel(level) < commitmentLevel(commitment)) return false;
    finish({ context: response.context, value: { err: response.value.err } });
    return true;
  };
  const check = async () => {
    try {
      const status = await request(connection.getSignatureStatus(signature, { searchTransactionHistory: true }));
      if (settled || acceptStatus(status)) return;
      // Once observed on-chain, let it reach the requested commitment even if its
      // original blockhash expires in the meantime.
      if (!observed && options.lastValidBlockHeight !== undefined) {
        const height = await request(connection.getBlockHeight('finalized'));
        if (settled) return;
        if (height > options.lastValidBlockHeight) {
          // A send may have landed before expiry. Recheck history after the height read.
          const finalStatus = await request(connection.getSignatureStatus(signature, { searchTransactionHistory: true }));
          if (settled || acceptStatus(finalStatus)) return;
          if (!finalStatus.value) { fail(new TransactionConfirmationError(signature, 'expired', options.lastValidBlockHeight)); return; }
        }
      }
    } catch {
      // Transient HTTP failures are retried within the original overall deadline.
    }
    if (!settled) pollTimer = setTimeout(() => { void check(); }, 2000);
  };

  if (options.subscribe) {
    try {
      subscriptionId = connection.onSignature(signature, (value, context) => finish({ value, context }), commitment);
    } catch {
      // Polling is already active, so no new timeout window is needed.
    }
  }
  void check();
});
