import type { Connection, TransactionSignature, Commitment, TransactionConfirmationStrategy } from '@solana/web3.js';
import { hasWebsocketEndpoint } from '../config/rpc';
import { confirmSignature } from './transactionConfirmationCore';

export { assertTransactionSucceeded, TransactionConfirmationError, TransactionExecutionError } from './transactionConfirmationCore';

const patchedConnections = new WeakSet<Connection>();

/** Keep the web3.js response shape and preserve blockheight/abort strategies. */
export const patchConnectionConfirmTransaction = (connection: Connection): void => {
  if (patchedConnections.has(connection)) return;
  patchedConnections.add(connection);
  const original = connection.confirmTransaction.bind(connection);
  connection.confirmTransaction = (async (
    strategy: TransactionSignature | TransactionConfirmationStrategy, commitment: Commitment = 'confirmed',
  ) => {
    if (typeof strategy !== 'string' && !('lastValidBlockHeight' in strategy)) {
      return original(strategy, commitment); // Durable nonce transactions use their own expiry rules.
    }
    return confirmSignature(connection, typeof strategy === 'string' ? strategy : strategy.signature, commitment, 60000, {
      subscribe: hasWebsocketEndpoint(),
      ...(typeof strategy !== 'string' ? {
        lastValidBlockHeight: strategy.lastValidBlockHeight, abortSignal: strategy.abortSignal,
      } : {}),
    });
  }) as Connection['confirmTransaction'];
};

export const confirmTransactionWithPolling = (
  connection: Connection, signature: TransactionSignature, commitment: Commitment = 'confirmed', timeout = 60000,
) => confirmSignature(connection, signature, commitment, timeout);

export const smartConfirmTransaction = (
  connection: Connection, signature: TransactionSignature, commitment: Commitment = 'confirmed', timeout = 60000,
) => confirmSignature(connection, signature, commitment, timeout, { subscribe: hasWebsocketEndpoint() });

export const confirmTransactionWithBlockhash = (
  connection: Connection,
  params: { signature: TransactionSignature; blockhash: string; lastValidBlockHeight: number },
  commitment: Commitment = 'confirmed', timeout = 60000,
) => confirmSignature(connection, params.signature, commitment, timeout, {
  subscribe: hasWebsocketEndpoint(), lastValidBlockHeight: params.lastValidBlockHeight,
});
