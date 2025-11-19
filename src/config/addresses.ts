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
 * DEVNET: 22NataEERKBqvBt3SFYJj5oE1fqiTx4HbsxU1FuSNWbx
 */
export const KEDOLOG_MINT = new PublicKey('FUHwFRWE52FJXC4KoySzy9h6nNmRrppUg5unS4mKEDQN');

/**
 * USDC token mint address
 * Used as the base pair for pool-based pricing oracles
 * 
 * Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 * Devnet: 2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32
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
 * REFERENCE POOLS
 * These pools are used for dynamic pricing and KEDOLOG discount calculations
 * The contract reads these pools from the protocol token config on-chain
 * 
 * NOTE: These addresses are kept as fallbacks/references.
 * The actual pool addresses are fetched dynamically from the protocol token config
 * in swapWithKedologDiscount and fetchKedologPrice functions.
 * 
 * Vault addresses are also fetched dynamically from pool data at runtime.
 * 
 * Updated: Reference pools configured in protocol token config
 */

// KEDOLOG/USDC Pool (Mainnet)
// Pool Address: 8KYfYHmPyzpzqYQzVzHR3uv94E1UX8TsaEFLqBWzenRJ
export const KEDOLOG_USDC_POOL = new PublicKey('8KYfYHmPyzpzqYQzVzHR3uv94E1UX8TsaEFLqBWzenRJ');
// Vault addresses are fetched dynamically from pool data
export const KEDOLOG_VAULT = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically
export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically

// SOL/USDC Pool (Mainnet)
// Pool Address: 3ZXK4N8Hf1uZjYqndX3bRPXf71wS6gj3DSiSjPTveE1L
export const SOL_USDC_POOL = new PublicKey('3ZXK4N8Hf1uZjYqndX3bRPXf71wS6gj3DSiSjPTveE1L');
// Vault addresses are fetched dynamically from pool data
export const SOL_VAULT = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically
export const USDC_VAULT_IN_SOL_POOL = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically

// KEDOLOG/SOL Pool (Mainnet)
// Pool Address: 9zbYdushUHfJ67SJCDAYCMtaHdg5UMnJwmGWWGuXgh3
export const KEDOLOG_SOL_POOL = new PublicKey('9zbYdushUHfJ67SJCDAYCMtaHdg5UMnJwmGWWGuXgh3');
// Vault addresses are fetched dynamically from pool data
export const KEDOLOG_VAULT_IN_SOL_POOL = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically
export const SOL_VAULT_IN_KEDOLOG_SOL_POOL = new PublicKey('11111111111111111111111111111111'); // Fetched dynamically

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
 * MAINNET: ENDftP3K19BX29PnyQ6sAwHFGyjtuzAYW6bnnTfZzZRQ
 * DEVNET: TsWSDkAJ9TfkspGLkpVEPtCsvGx8NRVurAfabPyRu9C
 * Pool Creation Fee: 0.15 SOL
 */
export const DEFAULT_AMM_CONFIG = new PublicKey('ENDftP3K19BX29PnyQ6sAwHFGyjtuzAYW6bnnTfZzZRQ');

/**
 * Protocol Token Config (KEDOLOG Config)
 * Stores KEDOLOG discount configuration (discount rate: 25%, treasury, etc.)
 * NOW ALSO STORES: Reference pool addresses (KEDOLOG/USDC, SOL/USDC, KEDOLOG/SOL)
 * MAINNET: pVRUHo1ecQA5QjyoCJzBSdPTi4hSgjW2ErK8huNYB51
 * DEVNET: EprKag9DAdRhMekcHzHzC64ZBmrbECeytd5uL1G9cXP9
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
 * Set to 'devnet' for testing, 'mainnet-beta' for production
 */
export const NETWORK = 'mainnet-beta' as const;

/**
 * Get Solscan explorer URL for a transaction signature
 * @param signature Transaction signature
 * @returns Solscan URL with correct cluster parameter
 */
export const getExplorerUrl = (signature: string): string => {
  // For mainnet, no cluster parameter needed (defaults to mainnet)
  // For devnet, add cluster parameter
  const network = NETWORK as string;
  if (network === 'devnet') {
    return `https://solscan.io/tx/${signature}?cluster=devnet`;
  }
  return `https://solscan.io/tx/${signature}`;
};

/**
 * Get Solscan explorer URL for an account address
 * @param address Account address
 * @returns Solscan URL with correct cluster parameter
 */
export const getExplorerAccountUrl = (address: string): string => {
  // For mainnet, no cluster parameter needed (defaults to mainnet)
  // For devnet, add cluster parameter
  const network = NETWORK as string;
  if (network === 'devnet') {
    return `https://solscan.io/account/${address}?cluster=devnet`;
  }
  return `https://solscan.io/account/${address}`;
};

/**
 * RPC endpoint - SINGLE SOURCE OF TRUTH
 * ⚠️ IMPORTANT: This MUST be set in your .env file as VITE_RPC_ENDPOINT
 * 
 * Example for QuickNode:
 * VITE_RPC_ENDPOINT=https://your-endpoint.solana-mainnet.quiknode.pro/your-key/
 * 
 * This is the ONLY place where RPC endpoint should be referenced.
 * All other parts of the codebase use the connection from WalletProvider context.
 */
export const getRpcEndpoint = (): string => {
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      'VITE_RPC_ENDPOINT is not set in .env file. ' +
      'Please create a .env file with your QuickNode RPC endpoint: ' +
      'VITE_RPC_ENDPOINT=https://your-endpoint.solana-mainnet.quiknode.pro/your-key/'
    );
  }
  return endpoint;
};

// For backward compatibility - lazy-loaded to avoid errors at module load time
// Prefer using getRpcEndpoint() or connection from WalletProvider context
export const RPC_ENDPOINT = getRpcEndpoint();

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
  // RPC_ENDPOINT removed from default export - use getRpcEndpoint() or connection from WalletProvider context
  getRpcEndpoint,
  KEDOLOG_DISCOUNT_CONFIG,
  FEE_RATES,
};

