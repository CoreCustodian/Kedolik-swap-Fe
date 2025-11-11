/**
 * Swap Restrictions - Check if KEDOLOG discount is available
 * 
 * Contract was fixed to handle all swap pairs correctly!
 * This file is kept for future extensibility.
 */

import { PublicKey } from '@solana/web3.js';

export interface KedologAvailability {
  available: boolean;
  reason?: string;
  suggestion?: string;
}

/**
 * Check if KEDOLOG discount is available for a given swap pair
 * 
 * As of contract deployment (4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf),
 * all swap pairs are supported with KEDOLOG discount!
 */
export function isKedologDiscountAvailable(
  _inputMint: PublicKey,
  _outputMint: PublicKey,
  _poolAddress?: PublicKey
): KedologAvailability {
  // All swaps now work with KEDOLOG discount! 🎉
  // The contract was fixed to handle vault borrow conflicts.
  return { available: true };
}

/**
 * Get user-friendly error message for restricted pairs
 */
export function getRestrictionMessage(
  inputSymbol: string,
  outputSymbol: string
): string {
  return `⚠️ ${inputSymbol} → ${outputSymbol} swaps with KEDOLOG discount are temporarily unavailable due to a contract limitation.\n\nYou can:\n• Swap without KEDOLOG discount\n• Use 2-step swap: ${inputSymbol} → USDC → ${outputSymbol}`;
}

