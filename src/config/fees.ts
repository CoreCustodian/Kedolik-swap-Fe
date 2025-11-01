import { PublicKey } from '@solana/web3.js';
import * as ADDRESSES from './addresses';

/**
 * Fee Tier Configuration
 * 
 * This file defines all available fee tiers for pool creation.
 * Each fee tier corresponds to an AMM config that must be created by the admin.
 */

export interface FeeConfig {
  index: number;
  feeBps: number; // Fee in basis points (e.g., 100 = 1%, 25 = 0.25%, 5 = 0.05%)
  label: string;
  description: string;
}

/**
 * CONFIGURABLE FEE TIERS
 * 
 * Based on Raydium AMM Fee Structure:
 * - Standard AMM Pools (AMM v4): 0.25% per swap (0.22% to LPs, 0.03% to protocol)
 * - CP-Swap Pools: 0.25%, 1%, 2%, and 4% (84% to LPs, 12% to buybacks, 4% to treasury)
 * - Concentrated Liquidity (CLMM): 0.01%, 0.02%, 0.03%, 0.04%, 0.05%, 0.25%, 1%, 2%
 * 
 * To add a new fee tier:
 * 1. Add a new entry to this array
 * 2. Make sure the corresponding AMM config exists on-chain (created by admin)
 * 3. The address will be automatically calculated based on the index
 */
export const FEE_TIER_CONFIGS: FeeConfig[] = [
  // Tier 0: 0.01% - For ultra-stable pairs (USDC/USDT like pairs)
  {
    index: 0,
    feeBps: 1, // 0.01%
    label: '0.01%',
    description: 'Best for ultra-stable pairs'
  },
  // Tier 1: 0.05% - For stable pairs
  {
    index: 1,
    feeBps: 5, // 0.05%
    label: '0.05%',
    description: 'Best for stable pairs (USDC/USDT)'
  },
  // Tier 2: 0.25% - Standard AMM fee (Raydium standard)
  {
    index: 2,
    feeBps: 25, // 0.25%
    label: '0.25%',
    description: 'Standard fee - Best for most pairs'
  },
  // Tier 3: 1.00% - For volatile pairs
  {
    index: 3,
    feeBps: 100, // 1.00%
    label: '1.00%',
    description: 'Best for volatile pairs'
  }
];

/**
 * Helper function to calculate AMM config address from index
 * This uses the same derivation as the smart contract
 */
export const getAmmConfigAddress = (programId: PublicKey, index: number): PublicKey => {
  // Convert index to u16 little-endian bytes
  const indexBuffer = Buffer.alloc(2);
  // Raydium-style programs derive with big-endian for u16 indices.
  // Switch to BE to match on-chain PDA used by the program.
  indexBuffer.writeUInt16BE(index, 0);
  
  const [ammConfig] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('amm_config'),
      indexBuffer
    ],
    programId
  );
  
  return ammConfig;
};

/**
 * Get all fee tiers with their calculated addresses
 */
export const getFeeTiersWithAddresses = (programId: PublicKey) => {
  return FEE_TIER_CONFIGS.map(config => ({
    ...config,
    address: getAmmConfigAddress(programId, config.index)
  }));
};

/**
 * Get fee config by index
 */
export const getFeeConfigByIndex = (index: number): FeeConfig | undefined => {
  return FEE_TIER_CONFIGS.find(config => config.index === index);
};

/**
 * Get fee config by address
 */
export const getFeeConfigByAddress = (programId: PublicKey, address: PublicKey): FeeConfig | undefined => {
  return FEE_TIER_CONFIGS.find(config => {
    const calculatedAddress = getAmmConfigAddress(programId, config.index);
    return calculatedAddress.equals(address);
  });
};

/**
 * Format fee basis points to percentage string
 */
export const formatFeeBps = (bps: number): string => {
  return `${(bps / 100).toFixed(2)}%`;
};

// KEDOLOG Discount Feature Configuration
// All addresses imported from centralized config
export const KEDOLOG_CONFIG = {
  // KEDOLOG token mint address
  MINT: ADDRESSES.KEDOLOG_MINT,
  // Default AMM Config - using the deployed program's config (index 0)
  AMM_CONFIG: ADDRESSES.DEFAULT_AMM_CONFIG,
  // Protocol Token Config (for KEDOLOG discount feature)
  PROTOCOL_TOKEN_CONFIG: ADDRESSES.PROTOCOL_TOKEN_CONFIG,
  // KEDOLOG/USDC pool for price oracle
  PRICE_POOL: ADDRESSES.KEDOLOG_USDC_POOL,
  // Pool vaults for on-chain price reading
  KEDOLOG_VAULT: ADDRESSES.KEDOLOG_VAULT,
  USDC_VAULT: ADDRESSES.USDC_VAULT_IN_KEDOLOG_POOL,
  // DEPRECATED: Use getDiscountRate() function instead
  // This fallback is used only if blockchain fetch fails
  DISCOUNT_RATE_FALLBACK: ADDRESSES.KEDOLOG_DISCOUNT_CONFIG.DISCOUNT_RATE_FALLBACK,
};

/**
 * Get the current discount rate from the context or fallback
 * NOTE: This function should be used with the useConfig hook in components
 */
export const getDiscountRate = (discountRateFromBlockchain: number | null): number => {
  // Use blockchain value if available, otherwise fallback
  return discountRateFromBlockchain ?? KEDOLOG_CONFIG.DISCOUNT_RATE_FALLBACK;
};

/**
 * Helper function to get protocol token config PDA
 * Note: This is for compatibility. Use ADDRESSES.getProtocolTokenConfigPDA() directly.
 */
export const getProtocolTokenConfigAddress = (programId: PublicKey): PublicKey => {
  if (programId.equals(ADDRESSES.PROGRAM_ID)) {
    return ADDRESSES.PROTOCOL_TOKEN_CONFIG;
  }
  // Fallback for custom program IDs
  const [protocolTokenConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_token_config')],
    programId
  );
  return protocolTokenConfig;
};


