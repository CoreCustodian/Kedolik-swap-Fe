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
 */
export const PROGRAM_ID = new PublicKey('HmrfmeAq6w52AESpFhxMP1dwYDn8DHawmGmtYMhbrkcq');

/**
 * Authority seed for deriving PDAs
 */
export const AUTHORITY_SEED = Buffer.from('vault_and_lp_mint_auth_seed');

// ============================================================================
// KEDOLOG TOKEN
// ============================================================================

/**
 * KEDOLOG token mint address
 * The protocol's native token used for fee discounts
 */
export const KEDOLOG_MINT = new PublicKey('22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx');

/**
 * KEDOLOG/USDC liquidity pool
 * Used as price oracle for dynamic KEDOLOG pricing
 */
export const KEDOLOG_USDC_POOL = new PublicKey('HXfXjGqTsqhwLd4oc9ZwKpvdjGYmU8Tvbca6ftp8231w');

/**
 * KEDOLOG vault in the KEDOLOG/USDC pool
 * Contract reads this to get KEDOLOG reserves
 */
export const KEDOLOG_VAULT = new PublicKey('Bon8zyjdzGBgteK7fnB4yukA9hZovWKzMv41giwDdexc');

/**
 * USDC vault in the KEDOLOG/USDC pool
 * Contract reads this to get USDC reserves
 */
export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('A6fpTY76hfrEdrEGUTJMSfYB4h6uDQdXXhBrCvmY2yLE');

// ============================================================================
// AMM CONFIGURATION
// ============================================================================

/**
 * Default AMM Config (index 0)
 * Used for KEDOLOG discount feature
 */
export const DEFAULT_AMM_CONFIG = new PublicKey('FfWb58U4MuhSBMjpG6dMRyC3CGYyV2GFT7Kaa4nYnLQg');

/**
 * Protocol Token Config
 * Stores KEDOLOG discount configuration (discount rate, treasury, etc.)
 */
export const PROTOCOL_TOKEN_CONFIG = new PublicKey('uheCbdoykKfcQXJu9qm1WruK6vLgnsMyMCpzpD1FZ1G');

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Pool creation fee receiver
 * Address that receives the 1 SOL pool creation fee
 */
export const CREATE_POOL_FEE_RECEIVER = new PublicKey('JAaHqf4p14eNij84tygdF1nQkKV8MU3h7Pi4VCtDYiqa');

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

