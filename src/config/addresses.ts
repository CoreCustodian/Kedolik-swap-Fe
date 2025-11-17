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
 * DEPLOYMENT: Mainnet (November 15, 2025)
 * - NO MORE ORACLE ACCOUNTS NEEDED! 🎉
 * - Uses reference liquidity pools for automatic price discovery
 * - Supports multi-hop pricing paths (Token → SOL → USDC)
 * - Contract auto-detects token ordering in pools
 * - Simpler frontend integration, no Pyth oracle management
 * - Admin can ONLY change admin and fee receiver
 * - UNIFIED fee_receiver gets ALL fees (pool creation, protocol, fund, KEDOLOG discount)
 * - Only fee receiver can claim pool fees
 * - Pool Creation Fee: 0.15 SOL
 * - KEDOLOG Discount: 25%
 */
export const PROGRAM_ID = new PublicKey('EvUXjxz9pc4mdUPePwF8RQUr4RG8Qk9aP9PmGXn15PVL');

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
 * MAINNET: FUHwFRWE52FJXC4KoySzy9h6nNmRrppUg5unS4mKEDQN
 */
export const KEDOLOG_MINT = new PublicKey('FUHwFRWE52FJXC4KoySzy9h6nNmRrppUg5unS4mKEDQN');

/**
 * USDC token mint address
 * Used as the base pair for pool-based pricing oracles
 * 
 * Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/**
 * USDT token mint address
 * Tether USD stablecoin
 * 
 * Mainnet: Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
 */
export const USDT_MINT = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

// ============================================================================
// NOTE: No need to hardcode other token mints!
// The system dynamically discovers pools for any token at runtime.
// Just add the token to your frontend token list and it will work automatically.
// ============================================================================

/**
 * MAINNET REFERENCE POOLS
 * These pools will be created on mainnet and used for dynamic pricing
 * The contract reads these pools to calculate KEDOLOG discount fees
 * 
 * NOTE: Create these pools first on mainnet, then update addresses here:
 * 1. KEDOLOG/USDC pool - for KEDOLOG pricing
 * 2. SOL/USDC pool - for SOL pricing (if not already exists)
 * 
 * After creating pools, get the vault addresses using:
 * - Pool state account contains vault references
 * - Or use: anchor account pool_state <POOL_ADDRESS>
 * 
 * TODO: UPDATE THESE WITH ACTUAL MAINNET POOL ADDRESSES
 */

// KEDOLOG/USDC Pool (TODO: Create on mainnet and update)
export const KEDOLOG_USDC_POOL = new PublicKey('11111111111111111111111111111111'); // Placeholder
export const KEDOLOG_VAULT = new PublicKey('11111111111111111111111111111111'); // Placeholder
export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('11111111111111111111111111111111'); // Placeholder

// SOL/USDC Pool (TODO: Create on mainnet and update, or use existing Jupiter/Raydium pool)
export const SOL_USDC_POOL = new PublicKey('11111111111111111111111111111111'); // Placeholder
export const SOL_VAULT = new PublicKey('11111111111111111111111111111111'); // Placeholder
export const USDC_VAULT_IN_SOL_POOL = new PublicKey('11111111111111111111111111111111'); // Placeholder

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
 * MAINNET DEPLOYMENT: Nov 15, 2025
 * Pool Creation Fee: 0.15 SOL
 */
export const DEFAULT_AMM_CONFIG = new PublicKey('ENDftP3K19BX29PnyQ6sAwHFGyjtuzAYW6bnnTfZzZRQ');

/**
 * Protocol Token Config (KEDOLOG Config)
 * Stores KEDOLOG discount configuration (discount rate: 25%, treasury, etc.)
 * NOW ALSO STORES: Reference pool addresses (KEDOLOG/USDC, SOL/USDC, KEDOLOG/SOL)
 * MAINNET DEPLOYMENT: Nov 15, 2025
 */
export const PROTOCOL_TOKEN_CONFIG = new PublicKey('pVRUHo1ecQA5QjyoCJzBSdPTi4hSgjW2ErK8huNYB51');

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Unified fee receiver (Fallback - prefer fetching from AMM config dynamically)
 * This address receives ALL fees:
 * - Pool creation fees (0.15 SOL per pool)
 * - Protocol swap fees (0.05%)
 * - Fund fees (variable)
 * - KEDOLOG discount fees (0.0375% with 25% discount)
 * 
 * NOTE: Pool creation now fetches this DYNAMICALLY from AMM config
 * to avoid address constraint mismatches. This constant is kept
 * for backward compatibility only.
 * 
 * MAINNET: EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom
 */
export const CREATE_POOL_FEE_RECEIVER = new PublicKey('EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom');

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

/**
 * Current network environment
 */
export const NETWORK = 'mainnet-beta' as const;

/**
 * RPC endpoint
 * For production, consider using a private RPC provider (Helius, Quicknode, etc.)
 * Set VITE_RPC_ENDPOINT in .env file to override this default
 */
export const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

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

