import { PublicKey } from '@solana/web3.js';

/**
 * CENTRALIZED ADDRESS CONFIGURATION
 * 
 * All blockchain addresses for the Kedolik DEX.
 * This is the single source of truth for all addresses.
 * 
 * IMPORTANT: When deploying a new version, update addresses here ONLY.
 */

// ============================================================================
// PROGRAM
// ============================================================================

/**
 * Main AMM program ID
 * This is the deployed Kedolik CP Swap program
 * 
 * DEPLOYMENT: November 10, 2025 (Universal Pool-Based Pricing System)
 * - NO MORE ORACLE ACCOUNTS NEEDED! 🎉
 * - Uses reference liquidity pools for automatic price discovery
 * - Supports multi-hop pricing paths (Token → SOL → USDC)
 * - Contract auto-detects token ordering in pools
 * - Simpler frontend integration, no Pyth oracle management
 * - Admin can ONLY change admin and fee receiver
 * - UNIFIED fee_receiver gets ALL fees (pool creation, protocol, fund, KEDOLOG discount)
 * - Only fee receiver can claim pool fees
 */
export const PROGRAM_ID = new PublicKey('4LyaQt2uNYX7zJABAVa56th8U68brWHWLioAYZSbCeEf');

/**
 * Authority seed for deriving PDAs
 */
export const AUTHORITY_SEED = Buffer.from('vault_and_lp_mint_auth_seed');

// ============================================================================
// KEDOLOG TOKEN
// ============================================================================

/**
 * SOL token mint address (Native)
 * This is the native SOL mint address on all Solana networks
 * Same for both Devnet and Mainnet
 */
export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * KEDOLOG token mint address
 * The protocol's native token used for fee discounts
 * 
 * Devnet: 22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx
 * Mainnet: [UPDATE WHEN DEPLOYING TO MAINNET]
 */
export const KEDOLOG_MINT = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx');

/**
 * USDC token mint address
 * Used as the base pair for pool-based pricing oracles
 * 
 * Devnet: 2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32
 * Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 */
export const USDC_MINT = new PublicKey('2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32');

// ============================================================================
// NOTE: No need to hardcode other token mints!
// The system dynamically discovers pools for any token at runtime.
// Just add the token to your frontend token list and it will work automatically.
// ============================================================================

/**
 * KEDOLOG/USDC liquidity pool
 * Used as reference pool for dynamic KEDOLOG pricing
 * UPDATED: Nov 10, 2025 - New pool for universal pricing deployment
 */
export const KEDOLOG_USDC_POOL = new PublicKey('BE1AdLaWKGPV61cmdV2W6aw7GY5fBRc59noUascPBje');

/**
 * KEDOLOG vault in the KEDOLOG/USDC pool
 * Contract reads this to get KEDOLOG reserves
 * UPDATED: Nov 10, 2025
 */
export const KEDOLOG_VAULT = new PublicKey('Gg2roHP4aRbNvjbQRj7cxB1XvLKdBw45UkrNn9eeC8DJ');

/**
 * USDC vault in the KEDOLOG/USDC pool
 * Contract reads this to get USDC reserves
 * UPDATED: Nov 10, 2025
 */
export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('2yVnJLxM9Dw8YHxrEQQgvPJ12RXYXcqdYyLXftYzbJCt');

/**
 * SOL/USDC liquidity pool
 * Used as reference pool for SOL pricing in KEDOLOG fee calculations
 * UPDATED: Nov 10, 2025 - Pool created with NEW program
 */
export const SOL_USDC_POOL = new PublicKey('4pS9NNCmuSxCeE2KStwnVLujouoAPRuFJnmKd12fjs1U');

/**
 * SOL vault in the SOL/USDC pool
 * Contract reads this to get SOL reserves
 * UPDATED: Nov 10, 2025
 */
export const SOL_VAULT = new PublicKey('E2TxGdGJyk1yWG3oYMcRtcw8hcQiLGugjwCxWYTFE3S8');

/**
 * USDC vault in the SOL/USDC pool
 * Contract reads this to get USDC reserves for SOL pricing
 * UPDATED: Nov 10, 2025
 */
export const USDC_VAULT_IN_SOL_POOL = new PublicKey('J2219iKwxifoweHJW5beAmT7KYWzUpqjscQviMKew4Qa');

// ============================================================================
// DYNAMIC POOL DISCOVERY
// ============================================================================
// All intermediate pools (BTC/SOL, ETH/SOL, etc.) are discovered at RUNTIME
// No need to hardcode pool addresses - the system finds them automatically!

// ============================================================================
// AMM CONFIGURATION
// ============================================================================

/**
 * Default AMM Config (index 0)
 * Used for KEDOLOG discount feature
 * Contains unified fee_receiver for all fee types
 * UPDATED: Nov 10, 2025 - Universal pricing system deployment
 */
export const DEFAULT_AMM_CONFIG = new PublicKey('BvNxXvJbJLgEhSCuoVyHwsTWZeFMLfwdzqP1ynuimVRW');

/**
 * Protocol Token Config
 * Stores KEDOLOG discount configuration (discount rate, treasury, etc.)
 * NOW ALSO STORES: Reference pool addresses (KEDOLOG/USDC, SOL/USDC, KEDOLOG/SOL)
 * UPDATED: Nov 10, 2025 - Universal pricing system deployment
 */
export const PROTOCOL_TOKEN_CONFIG = new PublicKey('3TLoGQXLQyyExNUekdtjinSig9uBnrwLZXHbJ4ECBrq3');

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Unified fee receiver (Fallback - prefer fetching from AMM config dynamically)
 * This address receives ALL fees:
 * - Pool creation fees (1 SOL per pool)
 * - Protocol swap fees (0.05%)
 * - Fund fees (variable)
 * - KEDOLOG discount fees (0.0375% with 25% discount)
 * 
 * NOTE: Pool creation now fetches this DYNAMICALLY from AMM config
 * to avoid address constraint mismatches. This constant is kept
 * for backward compatibility only.
 */
export const CREATE_POOL_FEE_RECEIVER = new PublicKey('67D6TM8PTsuv8nU5PnUP3dV6j8kW3rmTD9KNufcEUPCa');

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

/**
 * Current network environment
 */
export const NETWORK = 'devnet' as const;

/**
 * RPC endpoint
 */
export const RPC_ENDPOINT = 'https://api.devnet.solana.com';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get AMM config PDA from index
 */
export const getAmmConfigPDA = (index: number): PublicKey => {
  const indexBuffer = Buffer.alloc(2);
  indexBuffer.writeUInt16BE(index, 0);
  
  const [ammConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('amm_config'), indexBuffer],
    PROGRAM_ID
  );
  
  return ammConfig;
};

/**
 * Get protocol token config PDA
 */
export const getProtocolTokenConfigPDA = (): PublicKey => {
  const [protocolTokenConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_token_config')],
    PROGRAM_ID
  );
  
  return protocolTokenConfig;
};

/**
 * Get authority PDA
 */
export const getAuthorityPDA = (): PublicKey => {
  const [authority] = PublicKey.findProgramAddressSync(
    [AUTHORITY_SEED],
    PROGRAM_ID
  );
  
  return authority;
};

/**
 * Get pool state PDA
 */
export const getPoolStatePDA = (token0: PublicKey, token1: PublicKey, ammConfig?: PublicKey): PublicKey => {
  const configToUse = ammConfig || DEFAULT_AMM_CONFIG;
  
  const [poolState] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      configToUse.toBuffer(),
      token0.toBuffer(),
      token1.toBuffer(),
    ],
    PROGRAM_ID
  );
  
  return poolState;
};

/**
 * Get LP mint PDA
 */
export const getLpMintPDA = (poolState: PublicKey): PublicKey => {
  const [lpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_lp_mint'), poolState.toBuffer()],
    PROGRAM_ID
  );
  
  return lpMint;
};

/**
 * Get token vault PDA
 */
export const getTokenVaultPDA = (poolState: PublicKey, tokenMint: PublicKey): PublicKey => {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault'), poolState.toBuffer(), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  
  return vault;
};

/**
 * Get observation state PDA
 */
export const getObservationStatePDA = (poolState: PublicKey): PublicKey => {
  const [observationState] = PublicKey.findProgramAddressSync(
    [Buffer.from('observation'), poolState.toBuffer()],
    PROGRAM_ID
  );
  
  return observationState;
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * KEDOLOG discount configuration
 */
export const KEDOLOG_DISCOUNT_CONFIG = {
  DISCOUNT_RATE_FALLBACK: 2500, // 25% in basis points
  MINIMUM_FEE_THRESHOLD: 0.001, // Minimum KEDOLOG fee (prevents dust)
} as const;

/**
 * Fee structure in parts per million (PPM)
 */
export const FEE_RATES = {
  LP_FEE: 2000, // 0.20%
  PROTOCOL_FEE: 500, // 0.05%
  TOTAL_FEE: 2500, // 0.25%
} as const;

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  PROGRAM_ID,
  AUTHORITY_SEED,
  KEDOLOG_MINT,
  KEDOLOG_USDC_POOL,
  KEDOLOG_VAULT,
  USDC_VAULT_IN_KEDOLOG_POOL,
  DEFAULT_AMM_CONFIG,
  PROTOCOL_TOKEN_CONFIG,
  CREATE_POOL_FEE_RECEIVER,
  NETWORK,
  RPC_ENDPOINT,
  KEDOLOG_DISCOUNT_CONFIG,
  FEE_RATES,
};

