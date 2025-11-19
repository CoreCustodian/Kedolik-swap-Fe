import { Connection, TransactionSignature, Commitment } from '@solana/web3.js';

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
    
    // Check if this is Alchemy RPC
    const rpcEndpoint = (connection as any)._rpcEndpoint || 
                        (connection as any).rpcEndpoint || 
                        '';
    const isAlchemyRPC = rpcEndpoint.includes('alchemy') || 
                         rpcEndpoint.includes('alchemyapi');
    
    // Use polling for Alchemy RPC
    if (isAlchemyRPC) {
      console.log('🔄 Using polling-based confirmation (Alchemy RPC detected)');
      if (blockhash && lastValidBlockHeight) {
        return confirmTransactionWithBlockhash(connection, {
          signature,
          blockhash,
          lastValidBlockHeight,
        }, actualCommitment);
      } else {
        return smartConfirmTransaction(connection, signature, actualCommitment);
      }
    }
    
    // For other RPCs, try WebSocket first, fall back to polling on error
    try {
      if (blockhash && lastValidBlockHeight) {
        return await originalConfirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, actualCommitment);
      } else {
        return await originalConfirmTransaction(signature, actualCommitment);
      }
    } catch (error: any) {
      // If signatureSubscribe fails, fall back to polling
      if (error.message && (error.message.includes('signatureSubscribe') || error.message.includes('not found'))) {
        console.log('⚠️ WebSocket subscription failed, falling back to polling');
        if (blockhash && lastValidBlockHeight) {
          return confirmTransactionWithBlockhash(connection, {
            signature,
            blockhash,
            lastValidBlockHeight,
          }, actualCommitment);
        } else {
          return smartConfirmTransaction(connection, signature, actualCommitment);
        }
      }
      throw error;
    }
  };
};

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
  const pollInterval = 1000; // Poll every 1 second
  
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
  // Try to detect if WebSocket subscriptions are supported
  // Alchemy and some other RPCs don't support signatureSubscribe
  const rpcEndpoint = (connection as any)._rpcEndpoint || 
                      (connection as any).rpcEndpoint || 
                      '';
  
  const isAlchemyRPC = rpcEndpoint.includes('alchemy') || 
                       rpcEndpoint.includes('alchemyapi');
  
  // Use polling for Alchemy RPC or if we can't determine
  if (isAlchemyRPC || !rpcEndpoint) {
    console.log('🔄 Using polling-based confirmation (WebSocket subscriptions not supported)');
    return confirmTransactionWithPolling(connection, signature, commitment, timeout);
  }
  
  // Try WebSocket-based confirmation for other RPCs
  try {
    console.log('🔄 Using WebSocket-based confirmation');
    return await connection.confirmTransaction(signature, commitment);
  } catch (error: any) {
    // If signatureSubscribe fails, fall back to polling
    if (error.message && error.message.includes('signatureSubscribe')) {
      console.log('⚠️ WebSocket subscription failed, falling back to polling');
      return confirmTransactionWithPolling(connection, signature, commitment, timeout);
    }
    throw error;
  }
};

/**
 * Confirm transaction with blockhash (for transactions with recent blockhash)
 * Uses polling for RPCs that don't support WebSocket subscriptions
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
): Promise<{ value: { err: any } | null }> => {
  const { signature, lastValidBlockHeight } = params;
  
  // Check if blockhash is still valid
  try {
    const slot = await connection.getSlot(commitment);
    if (slot > lastValidBlockHeight) {
      console.warn('⚠️ Blockhash expired, using polling confirmation');
      return confirmTransactionWithPolling(connection, signature, commitment, timeout);
    }
  } catch (error) {
    console.warn('⚠️ Could not check blockhash validity, using polling');
  }
  
  // Try smart confirmation (will use polling for Alchemy)
  return smartConfirmTransaction(connection, signature, commitment, timeout);
};

