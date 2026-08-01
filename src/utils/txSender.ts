import {
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';

/**
 * Minimal shape of a wallet that can sign AND send a transaction in one step.
 * This is satisfied by wallet-adapter's `WalletContextState` (`useWallet()`),
 * whose `sendTransaction` delegates to the wallet's `signAndSendTransaction`
 * provider method for wallets that support it (e.g. Phantom).
 */
export interface SendCapableWallet {
  publicKey: PublicKey | null;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: {
      signers?: Signer[];
      skipPreflight?: boolean;
      preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
      maxRetries?: number;
      minContextSlot?: number;
    },
  ) => Promise<TransactionSignature>;
  // Present when connected; used by Anchor's provider for building transactions.
  signTransaction?: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

export interface SendViaWalletOptions {
  signers?: Signer[];
  skipPreflight?: boolean;
  maxRetries?: number;
}

/**
 * Sign + send a transaction through the wallet's `signAndSendTransaction` flow.
 *
 * Phantom requires this (rather than the dApp calling `signTransaction` +
 * `sendRawTransaction`) so it can inject its Lighthouse guard instructions.
 * The transaction MUST be handed over unsigned — do not `partialSign` it first,
 * because Lighthouse rewrites the message and would invalidate any pre-signature.
 * Extra program signers (rare) go through the `signers` option instead.
 */
export const sendViaWallet = async (
  wallet: SendCapableWallet | null | undefined,
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  options?: SendViaWalletOptions,
): Promise<string> => {
  if (!wallet || typeof wallet.sendTransaction !== 'function') {
    throw new Error(
      'Connected wallet does not support signAndSendTransaction. Please reconnect your wallet.',
    );
  }

  return wallet.sendTransaction(transaction, connection, {
    skipPreflight: options?.skipPreflight ?? false,
    preflightCommitment: 'confirmed',
    maxRetries: options?.maxRetries ?? 3,
    ...(options?.signers && options.signers.length > 0 ? { signers: options.signers } : {}),
  });
};
