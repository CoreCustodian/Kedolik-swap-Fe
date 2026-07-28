import { Connection, TransactionSignature, Commitment } from '@solana/web3.js';
import { hasWebsocketEndpoint } from '../config/rpc';

/**
 * Patch connection.confirmTransaction to use polling for RPCs that don't support WebSocket subscriptions
 * This is called once to patch the connection object globally
 */
export const patchConnectionConfirmTransaction = (connection: Connection): void => {
  const originalConfirmTransaction = connection.confirmTransaction.bind(connection);
  
  // Override confirmTransaction to use polling for Alchemy RPC
  (connection as any).confirmTransaction = async function(
    signatureOrConfig: TransactionSignature | { signature: TransactionSignature; blockhash?: string; lastValidBlockHeight?: number },
    commitment?: Commitment
  ): Promise<{ value: { err: any } | null }> {
    // Extract signature and other params
    let signature: TransactionSignature;
    let blockhash: string | undefined;
    let lastValidBlockHeight: number | undefined;
    let actualCommitment: Commitment = commitment || 'confirmed';
    
    if (typeof signatureOrConfig === 'string') {
      signature = signatureOrConfig;
    } else {
      signature = signatureOrConfig.signature;
      blockhash = signatureOrConfig.blockhash;
      lastValidBlockHeight = signatureOrConfig.lastValidBlockHeight;
      actualCommitment = commitment || 'confirmed';
    }
    
    void originalConfirmTransaction;
    void blockhash;
    void lastValidBlockHeight;

    return smartConfirmTransaction(connection, signature, actualCommitment);
  };
};

/**
 * Confirm via `signatureSubscribe` — the provider pushes the result, so this costs
 * one status check instead of a status poll every couple of seconds.
 */
const confirmTransactionWithSubscription = (
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment,
  timeout: number
): Promise<{ value: { err: any } | null }> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let subscriptionId: number | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(safetyNet);
      if (subscriptionId !== null) {
        connection.removeSignatureListener(subscriptionId).catch(() => undefined);
        subscriptionId = null;
      }
    };

    const settle = (result: { value: { err: any } | null }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const timer = setTimeout(
      () => fail(new Error(`Transaction confirmation timeout: ${signature}`)),
      timeout
    );

    // onSignature only fires for notifications after we subscribe, and a socket can
    // drop silently, so check status once up front and infrequently thereafter.
    const checkStatus = async () => {
      try {
        const status = await connection.getSignatureStatus(signature);
        if (!status.value) return;
        if (status.value.err) {
          settle({ value: { err: status.value.err } });
          return;
        }
        const levels: Record<string, number> = { processed: 1, confirmed: 2, finalized: 3 };
        const current = levels[status.value.confirmationStatus || ''] || 0;
        if (current >= (levels[commitment] || 2)) {
          settle({ value: null });
        }
      } catch {
        // Ignore; the subscription is the primary path.
      }
    };

    const safetyNet = setInterval(checkStatus, 15000);

    try {
      subscriptionId = connection.onSignature(
        signature,
        (result) => settle({ value: result.err ? { err: result.err } : null }),
        commitment
      );
    } catch (error) {
      fail(error instanceof Error ? error : new Error('signatureSubscribe failed'));
      return;
    }

    void checkStatus();
  });

/**
 * Polling-based transaction confirmation for RPCs that don't support WebSocket subscriptions
 * (e.g., Alchemy RPC which doesn't support signatureSubscribe)
 * 
 * This function polls getSignatureStatus instead of using WebSocket subscriptions
 */
export const confirmTransactionWithPolling = async (
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment = 'confirmed',
  timeout: number = 60000 // 60 seconds default timeout
): Promise<{ value: { err: any } | null }> => {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds (was 1s — reduces RPC quota use)
  
  console.log(`⏳ Confirming transaction with polling: ${signature.slice(0, 8)}...`);
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status.value) {
        if (status.value.err) {
          console.error('❌ Transaction failed:', status.value.err);
          return { value: { err: status.value.err } };
        }
        
        // Check if transaction has reached the desired commitment level
        if (status.value.confirmationStatus) {
          const confirmationLevels: Record<string, number> = {
            'processed': 1,
            'confirmed': 2,
            'finalized': 3,
          };
          
          const currentLevel = confirmationLevels[status.value.confirmationStatus] || 0;
          const requiredLevel = confirmationLevels[commitment] || 2;
          
          if (currentLevel >= requiredLevel) {
            console.log(`✅ Transaction confirmed at ${status.value.confirmationStatus} level`);
            return { value: null }; // Success
          }
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.warn('⚠️ Error polling transaction status:', error);
      // Continue polling despite error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  // Timeout reached
  console.warn(`⏱️ Transaction confirmation timeout after ${timeout}ms`);
  throw new Error(`Transaction confirmation timeout: ${signature}`);
};

/**
 * Smart transaction confirmation that detects if WebSocket subscriptions are supported
 * Falls back to polling if signatureSubscribe is not available
 */
export const smartConfirmTransaction = async (
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment = 'confirmed',
  timeout: number = 60000
): Promise<{ value: { err: any } | null }> => {
  if (!hasWebsocketEndpoint()) {
    return confirmTransactionWithPolling(connection, signature, commitment, timeout);
  }

  try {
    return await confirmTransactionWithSubscription(connection, signature, commitment, timeout);
  } catch (error: any) {
    if (error?.message?.includes('timeout')) {
      throw error;
    }
    console.warn('⚠️ signatureSubscribe failed, falling back to polling:', error);
    return confirmTransactionWithPolling(connection, signature, commitment, timeout);
  }
};

/**
 * Confirm transaction with blockhash (for transactions with recent blockhash).
 * The blockhash validity check was dropped: it cost a getSlot per confirmation and
 * the subscription path already resolves or times out on its own.
 */
export const confirmTransactionWithBlockhash = async (
  connection: Connection,
  params: {
    signature: TransactionSignature;
    blockhash: string;
    lastValidBlockHeight: number;
  },
  commitment: Commitment = 'confirmed',
  timeout: number = 60000
): Promise<{ value: { err: any } | null }> =>
  smartConfirmTransaction(connection, params.signature, commitment, timeout);

