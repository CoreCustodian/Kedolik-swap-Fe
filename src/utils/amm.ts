import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  Keypair,
} from '@solana/web3.js';
import {
  Program,
  AnchorProvider,
  Idl,
  BN,
} from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  createInitializeAccount3Instruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import IDLJson from '../../kedolik_cp_swap.json';
import { getTokenByMint } from '../config/tokens';
import { getFeeTiersWithAddresses, FeeConfig as BaseFeeConfig, getAmmConfigAddress, KEDOLOG_CONFIG, getProtocolTokenConfigAddress } from '../config/fees';
import * as ADDRESSES from '../config/addresses';
import { confirmTransactionWithBlockhash, smartConfirmTransaction } from './transactionConfirmation';

// Cast the JSON to Idl type - use 'as unknown as Idl' for proper type assertion
const IDL = IDLJson as unknown as Idl;

// Token Metadata Program ID (Metaplex)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Debug: Log the IDL address on module load
console.log('🔧 IDL loaded with address:', (IDLJson as any).address);
console.log('🔧 Centralized PROGRAM_ID:', ADDRESSES.PROGRAM_ID.toString());

// Verify IDL program ID matches
if ((IDLJson as any).address !== ADDRESSES.PROGRAM_ID.toString()) {
  console.warn('⚠️ WARNING: IDL program ID does not match centralized PROGRAM_ID!');
  console.warn('IDL address:', (IDLJson as any).address);
  console.warn('PROGRAM_ID:', ADDRESSES.PROGRAM_ID.toString());
  console.warn('This may cause issues with account validation.');
}

// Program and Config - Import from centralized config
export const PROGRAM_ID = ADDRESSES.PROGRAM_ID;
export const AUTHORITY_SEED = ADDRESSES.AUTHORITY_SEED;
console.log('✅ Using centralized addresses from config/addresses.ts');

// Extended FeeConfig with address (computed from index)
export interface FeeConfig extends BaseFeeConfig {
  address: PublicKey;
}

// Get all available fee tiers with computed addresses
export const FEE_TIERS: FeeConfig[] = getFeeTiersWithAddresses(PROGRAM_ID);

// ============================================================================
// JITO TIP CONFIGURATION
// ============================================================================

/**
 * Global flag to enable/disable Jito tip instructions
 * 
 * Set to `true` if your RPC endpoint requires Jito tips (e.g., Jito-enabled endpoints)
 * Set to `false` if your RPC endpoint does NOT require Jito tips (e.g., standard Solana RPC)
 * 
 * Default: `true` (always add tip for compatibility)
 */
export const ENABLE_JITO_TIP = false;

// Jito tip accounts (mainnet) - these are the official Jito tip accounts
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

/**
 * Get a random Jito tip account
 */
function getJitoTipAccount(): PublicKey {
  const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[randomIndex]);
}

/**
 * Add Jito tip instruction to transaction (must be LAST instruction)
 * @param transaction - The transaction to add tip to
 * @param feePayer - The account that will pay the tip
 * @param tipLamports - Amount of lamports to tip (default: 10,000 = 0.00001 SOL)
 */
function addJitoTipInstruction(
  transaction: Transaction,
  feePayer: PublicKey,
  tipLamports: number = 10_000
): void {
  const tipAccount = getJitoTipAccount();
  console.log(`💰 Adding Jito tip: ${tipLamports} lamports to ${tipAccount.toString()}`);
  
  // Create transfer instruction - SystemProgram.transfer automatically marks destination as writable
  const tipInstruction = SystemProgram.transfer({
    fromPubkey: feePayer,
    toPubkey: tipAccount,
    lamports: tipLamports,
  });
  
  // Verify the tip account is marked as writable in the instruction
  const tipAccountKey = tipInstruction.keys.find(key => key.pubkey.equals(tipAccount));
  if (!tipAccountKey || !tipAccountKey.isWritable) {
    console.error('❌ ERROR: Tip account is not writable in instruction!');
    console.error('Tip account key:', tipAccountKey);
    throw new Error('Failed to create valid Jito tip instruction - tip account must be writable');
  }
  
  console.log(`✅ Tip instruction created - tip account is writable: ${tipAccountKey.isWritable}`);
  
  // CRITICAL: Tip instruction must be LAST
  transaction.add(tipInstruction);
  
  // Double-check it's the last instruction
  const lastIx = transaction.instructions[transaction.instructions.length - 1];
  if (lastIx !== tipInstruction) {
    console.error('❌ ERROR: Tip instruction is not the last instruction!');
    throw new Error('Tip instruction must be the last instruction in the transaction');
  }
}

// Default AMM config: use updated KEDOLOG config
export const AMM_CONFIG = KEDOLOG_CONFIG.AMM_CONFIG;

// Helper to get fee config by address
export const getFeeConfigByAddress = (address: PublicKey): FeeConfig | undefined => {
  return FEE_TIERS.find(tier => tier.address.equals(address));
};

// Re-export for convenience
// re-export if needed elsewhere
export { getAmmConfigAddress } from '../config/fees';

// Wrapped SOL (WSOL) mint address - same as NATIVE_MINT  
export const WSOL_MINT = NATIVE_MINT;

/**
 * Dynamically finds intermediate pool for 1-hop pricing at RUNTIME
 * 
 * @param inputMint - The input token mint
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @returns Object with intermediate pool info, or null if direct pricing is possible
 */
interface IntermediatePoolInfo {
  poolAddress: PublicKey;
  tokenVault: PublicKey;  // The vault for the input token (e.g., BTC vault in BTC/SOL pool)
  solVault: PublicKey;    // The SOL vault in the intermediate pool
}

// Cache for discovered intermediate pools to avoid repeated searches
const intermediatePoolCache = new Map<string, IntermediatePoolInfo | null>();

async function findIntermediatePool(
  inputMint: PublicKey,
  connection: any,
  program: any
): Promise<IntermediatePoolInfo | null> {
  // Direct USDC swaps don't need intermediate pools
  if (inputMint.equals(ADDRESSES.USDC_MINT)) {
    return null;
  }

  // Direct SOL swaps don't need intermediate pools (SOL/USDC pool is already passed)
  if (inputMint.equals(ADDRESSES.SOL_MINT)) {
    return null;
  }

  // KEDOLOG doesn't need intermediate pools (KEDOLOG/USDC pool is already passed)
  if (inputMint.equals(ADDRESSES.KEDOLOG_MINT)) {
    return null;
  }

  // Check cache first
  const cacheKey = inputMint.toString();
  if (intermediatePoolCache.has(cacheKey)) {
    return intermediatePoolCache.get(cacheKey) || null;
  }

  console.log(`🔍 Searching for intermediate pool: ${getTokenSymbol(inputMint)}/SOL...`);

  try {
    // Get all pools from cache or fetch
    const pools = await fetchPools(connection, program);

    // Find a pool that has (inputToken, SOL) or (SOL, inputToken)
    const intermediatePool = pools.find(pool => {
      const hasInputToken = pool.token0Mint.equals(inputMint) || pool.token1Mint.equals(inputMint);
      const hasSol = pool.token0Mint.equals(ADDRESSES.SOL_MINT) || pool.token1Mint.equals(ADDRESSES.SOL_MINT);
      return hasInputToken && hasSol;
    });

    if (!intermediatePool) {
      console.warn(`⚠️ No ${getTokenSymbol(inputMint)}/SOL pool found for 1-hop pricing`);
      intermediatePoolCache.set(cacheKey, null);
      return null;
    }

    // Determine vault order based on token positions
    const isToken0Input = intermediatePool.token0Mint.equals(inputMint);
    const tokenVault = isToken0Input ? intermediatePool.token0Vault : intermediatePool.token1Vault;
    const solVault = isToken0Input ? intermediatePool.token1Vault : intermediatePool.token0Vault;

    const result: IntermediatePoolInfo = {
      poolAddress: intermediatePool.address,
      tokenVault,
      solVault,
    };

    console.log(`✅ Found intermediate pool:`, {
      pool: result.poolAddress.toString(),
      tokenVault: result.tokenVault.toString(),
      solVault: result.solVault.toString(),
    });

    // Cache the result
    intermediatePoolCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error(`❌ Error finding intermediate pool:`, error);
    intermediatePoolCache.set(cacheKey, null);
    return null;
  }
}

// Helper functions for wrapping/unwrapping SOL
export const isNativeSOL = (mint: PublicKey): boolean => {
  return mint.equals(WSOL_MINT);
};

/**
 * Creates instructions to wrap native SOL to WSOL
 * Returns: { instructions, wsolAccount }
 */
export const createWrapSOLInstructions = async (
  connection: Connection,
  owner: PublicKey,
  amount: number // in SOL, not lamports
): Promise<{ instructions: TransactionInstruction[]; wsolAccount: PublicKey }> => {
  const instructions: TransactionInstruction[] = [];
  const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, owner);

  // Check if WSOL account exists
  const accountInfo = await connection.getAccountInfo(wsolAccount);

  if (!accountInfo) {
    // Create WSOL token account
    instructions.push(
      createAssociatedTokenAccountInstruction(
        owner,
        wsolAccount,
        owner,
        WSOL_MINT
      )
    );
  }

  // Transfer SOL to the WSOL account
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: wsolAccount,
      lamports: Math.floor(amount * 1e9),
    })
  );

  // Sync native (this updates the WSOL balance)
  instructions.push(createSyncNativeInstruction(wsolAccount));

  return { instructions, wsolAccount };
};

/**
 * Creates instruction to unwrap WSOL back to native SOL
 * This closes the WSOL account and returns SOL to the owner
 */
export const createUnwrapSOLInstruction = async (
  owner: PublicKey
): Promise<TransactionInstruction> => {
  const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, owner);

  // Close the WSOL account, which automatically unwraps and returns SOL
  return createCloseAccountInstruction(
    wsolAccount,
    owner,
    owner
  );
};

/**
 * Unwrap WSOL to native SOL in a separate transaction
 * Call this after swapping to SOL to convert WSOL → SOL
 */
export const unwrapSOL = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey
): Promise<string> => {
  try {
    console.log('🌊 Unwrapping WSOL to native SOL...');

    const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, walletPublicKey);

    // Check if WSOL account exists and has balance
    const accountInfo = await connection.getAccountInfo(wsolAccount);
    if (!accountInfo) {
      throw new Error('No WSOL account found. Nothing to unwrap.');
    }

    // Get WSOL balance
    const balance = await connection.getTokenAccountBalance(wsolAccount);
    const wsolBalance = parseFloat(balance.value.amount) / 1e9;

    if (wsolBalance === 0) {
      throw new Error('WSOL balance is zero. Nothing to unwrap.');
    }

    console.log(`💰 Unwrapping ${wsolBalance} WSOL...`);

    // Create close account instruction
    const closeInstruction = createCloseAccountInstruction(
      wsolAccount,
      walletPublicKey,
      walletPublicKey
    );

    const transaction = new Transaction().add(closeInstruction);

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    // Sign and send
    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
    });

    // Confirm (using polling for Alchemy RPC compatibility)
    await confirmTransactionWithBlockhash(connection, {
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'processed');

    console.log(`✅ Unwrapped ${wsolBalance} WSOL to SOL`);
    return signature;
  } catch (error) {
    console.error('Error unwrapping WSOL:', error);
    throw error;
  }
};

/**
 * Fetch token balance - handles both native SOL and SPL tokens
 */
export const getTokenBalance = async (
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<number> => {
  try {
    // If it's native SOL, fetch SOL balance
    if (isNativeSOL(mint)) {
      const balance = await connection.getBalance(owner);
      return balance / 1e9; // Convert lamports to SOL
    }

    // Otherwise, fetch SPL token balance
    const tokenAccount = await getAssociatedTokenAddress(mint, owner);
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
    return parseFloat(accountInfo.value.uiAmount?.toString() || '0');
  } catch (error) {
    console.log(`Balance not found for token ${mint.toString()}:`, error);
    return 0;
  }
};

// Helper to get program (wallet should be from useAnchorWallet hook)
export const getProgram = (connection: Connection, wallet: any) => {
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  // Explicitly use PROGRAM_ID from addresses.ts to override IDL's address
  // This ensures we use the correct program ID even if IDL has a different one
  // Create a new IDL object with the correct program ID
  const idlWithCorrectAddress = {
    ...IDL,
    address: PROGRAM_ID.toString(),
  };
  return new Program(idlWithCorrectAddress as Idl, provider);
};

// Fetch pool creation fee from AMM config
export const getPoolCreationFee = async (
  connection: Connection,
  wallet: any,
  ammConfigAddress?: PublicKey
): Promise<number> => {
  try {
    const program = getProgram(connection, wallet);
    const configAddress = ammConfigAddress || AMM_CONFIG;

    // Fetch AMM config account
    const ammConfig = await (program.account as any).ammConfig.fetch(configAddress);

    // Pool creation fee is stored in lamports
    // Try both camelCase (Anchor conversion) and snake_case (raw IDL)
    const feeLamports = ammConfig.createPoolFee?.toNumber()
      || ammConfig.create_pool_fee?.toNumber()
      || 0;
    const feeSOL = feeLamports / 1e9; // Convert lamports to SOL

    // If fee is 0, it might mean the field doesn't exist or wasn't set
    // Return 0.15 SOL as default (150_000_000 lamports)
    if (feeSOL === 0) {
      console.warn('⚠️ Pool creation fee is 0 or not found, using default 0.15 SOL');
      return 0.15;
    }

    return feeSOL;
  } catch (error) {
    console.error('Error fetching pool creation fee:', error);
    // Fallback to 0.15 SOL (as documented) if fetch fails
    return 0.15;
  }
};

// Create an AMM config (fee tier) on-chain
export const createAmmConfig = async (
  connection: Connection,
  wallet: any,
  params: {
    index: number;
    tradeFeeBps: number;           // e.g., 3000 = 0.30%
    protocolFeeShareBps?: number;  // default 2000 (20% of trade fee)
    fundFeeShareBps?: number;      // default 1000 (10% of trade fee)
    createPoolFeeLamports?: number;// default 10_000_000 (0.01 SOL)
    creatorFeeShareBps?: number;   // default 500 (5% of trade fee)
  }
) => {
  const {
    index,
    tradeFeeBps,
    protocolFeeShareBps = 2000,
    fundFeeShareBps = 1000,
    createPoolFeeLamports = 10_000_000,
    creatorFeeShareBps = 500,
  } = params;

  if (!wallet?.publicKey) throw new Error('Wallet not connected');

  const program = getProgram(connection, wallet);
  const ammConfigPda = getAmmConfigAddress(PROGRAM_ID, index);

  // no-op if already exists
  const existing = await connection.getAccountInfo(ammConfigPda);
  if (existing) {
    return { address: ammConfigPda, tx: null, alreadyExists: true };
  }

  const tx = await (program as any).methods
    .createAmmConfig(
      index,
      new BN(tradeFeeBps),
      new BN(protocolFeeShareBps),
      new BN(fundFeeShareBps),
      new BN(createPoolFeeLamports),
      new BN(creatorFeeShareBps)
    )
    .accounts({ owner: wallet.publicKey })
    .rpc();

  return { address: ammConfigPda, tx, alreadyExists: false };
};

// Convenience: ensure 0.30% tier (index 1) exists
export const ensureAmmConfig030 = async (connection: Connection, wallet: any) => {
  return createAmmConfig(connection, wallet, { index: 1, tradeFeeBps: 3000 });
};

// Expose a dev helper for quick init from browser console (optional)
// Uses RPC from .env file
if (typeof window !== 'undefined') {
  (window as any).kedolikInitAmm030 = async () => {
    // Use RPC from environment variable
    const rpc = import.meta.env.VITE_RPC_ENDPOINT;
    if (!rpc) {
      throw new Error('VITE_RPC_ENDPOINT is not set in .env file');
    }
    const conn = new (await import('@solana/web3.js')).Connection(rpc, 'confirmed');
    const wallet = (window as any).solana;
    if (!wallet?.publicKey) throw new Error('Connect wallet first');
    const res = await ensureAmmConfig030(conn as unknown as Connection, wallet);
    console.log('ensureAmmConfig030 result:', res);
    return res;
  };
}

// Get Authority PDA
export const getAuthority = () => {
  const [authority] = PublicKey.findProgramAddressSync(
    [AUTHORITY_SEED],
    PROGRAM_ID
  );
  return authority;
};

/**
 * Collect creator fees from a pool
 * Only the pool creator can call this function
 */
export const collectCreatorFees = async (
  connection: Connection,
  wallet: any,
  poolAddress: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  ammConfig: PublicKey
): Promise<string> => {
  try {
    const program = getProgram(connection, wallet);
    const authority = getAuthority();

    // Get token programs
    const token0Info = await connection.getAccountInfo(token0Mint);
    const token1Info = await connection.getAccountInfo(token1Mint);
    const token0Program = token0Info?.owner || TOKEN_PROGRAM_ID;
    const token1Program = token1Info?.owner || TOKEN_PROGRAM_ID;

    // Get vault addresses
    const [vault0] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_vault'), poolAddress.toBuffer(), token0Mint.toBuffer()],
      PROGRAM_ID
    );
    const [vault1] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_vault'), poolAddress.toBuffer(), token1Mint.toBuffer()],
      PROGRAM_ID
    );

    // Get or create creator token accounts
    const creatorToken0 = await getAssociatedTokenAddress(
      token0Mint,
      wallet.publicKey,
      false,
      token0Program
    );
    const creatorToken1 = await getAssociatedTokenAddress(
      token1Mint,
      wallet.publicKey,
      false,
      token1Program
    );

    // Check if accounts exist and create if needed
    const tx = new Transaction();

    const token0AccountInfo = await connection.getAccountInfo(creatorToken0);
    if (!token0AccountInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          creatorToken0,
          wallet.publicKey,
          token0Mint,
          token0Program,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    const token1AccountInfo = await connection.getAccountInfo(creatorToken1);
    if (!token1AccountInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          creatorToken1,
          wallet.publicKey,
          token1Mint,
          token1Program,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Call collect_creator_fee instruction
    const collectIx = await (program.methods as any)
      .collectCreatorFee()
      .accounts({
        creator: wallet.publicKey,
        authority,
        poolState: poolAddress,
        ammConfig,
        token0Vault: vault0,
        token1Vault: vault1,
        vault0Mint: token0Mint,
        vault1Mint: token1Mint,
        creatorToken0,
        creatorToken1,
        token0Program,
        token1Program,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(collectIx);

    // Send transaction
    const signature = await wallet.sendTransaction(tx, connection);
    await smartConfirmTransaction(connection, signature, 'confirmed');

    console.log('✅ Creator fees collected:', signature);
    return signature;
  } catch (error) {
    console.error('❌ Error collecting creator fees:', error);
    throw error;
  }
};

// Get Pool State PDA
export const getPoolState = (token0Mint: PublicKey, token1Mint: PublicKey, ammConfig?: PublicKey) => {
  const config = ammConfig || AMM_CONFIG; // Use provided config or default
  const [poolState] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      config.toBuffer(),
      token0Mint.toBuffer(),
      token1Mint.toBuffer(),
    ],
    PROGRAM_ID
  );
  return poolState;
};

// Get LP Mint PDA
export const getLpMint = (poolState: PublicKey) => {
  const [lpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_lp_mint'), poolState.toBuffer()],
    PROGRAM_ID
  );
  return lpMint;
};

// Get Token Vault PDA
export const getTokenVault = (poolState: PublicKey, tokenMint: PublicKey) => {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault'), poolState.toBuffer(), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  return vault;
};

// Get Observation State PDA
export const getObservationState = (poolState: PublicKey) => {
  const [observationState] = PublicKey.findProgramAddressSync(
    [Buffer.from('observation'), poolState.toBuffer()],
    PROGRAM_ID
  );
  return observationState;
};

// Sort token mints (token_0 must be smaller than token_1)
export const sortTokenMints = (mintA: PublicKey, mintB: PublicKey) => {
  const comparison = Buffer.compare(mintA.toBuffer(), mintB.toBuffer());
  if (comparison < 0) {
    return { token0: mintA, token1: mintB };
  } else {
    return { token0: mintB, token1: mintA };
  }
};

// Pool Info Interface
export interface PoolInfo {
  address: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  lpMint: PublicKey;
  token0Reserve: number;
  token1Reserve: number;
  lpSupply: number;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  // Pool creator
  creator: PublicKey;
  // Fee data
  protocolFeesToken0: number;
  protocolFeesToken1: number;
  fundFeesToken0: number;
  fundFeesToken1: number;
  creatorFeesToken0: number;
  creatorFeesToken1: number;
  // Trading fee rate (from AMM config)
  tradeFeeRate: number; // in parts per million (10000 = 1%, 1000000 = 100%)
  // AMM config address for this pool (important for multi-hop swaps)
  ammConfig: PublicKey;
}

// Pool cache to reduce RPC calls
let poolCache: { pools: PoolInfo[]; timestamp: number } | null = null;
const POOL_CACHE_TTL = 10000; // 10 seconds cache
let isFetchingPools = false; // Prevent concurrent fetches

// Fetch all pools with caching
export const fetchPools = async (
  connection: Connection,
  wallet: any,
  forceRefresh: boolean = false
): Promise<PoolInfo[]> => {
  // Return cached pools if still valid
  const now = Date.now();
  if (!forceRefresh && poolCache && (now - poolCache.timestamp) < POOL_CACHE_TTL) {
    console.log('📦 Using cached pools (' + Math.round((POOL_CACHE_TTL - (now - poolCache.timestamp)) / 1000) + 's remaining)');
    return poolCache.pools;
  }

  // Prevent concurrent fetches
  if (isFetchingPools) {
    console.log('⏳ Pool fetch already in progress, waiting...');
    // Wait for ongoing fetch
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (poolCache) {
      return poolCache.pools;
    }
  }

  isFetchingPools = true;

  try {
    console.log('🔄 Fetching pools from RPC...');
    console.log('📍 PROGRAM_ID being used:', PROGRAM_ID.toString());
    console.log('📍 Expected program (unified fee receiver):', '2LVtzKZ7DwoowxeKnwmia6JGKdZy9cjAzH62RrburWtq');
    const program = getProgram(connection, wallet);
    console.log('📍 Program address from program object:', program.programId.toString());

    // Fetch all pool accounts
    const pools = await (program.account as any).poolState.all();
    console.log('📊 Found', pools.length, 'pools from program:', program.programId.toString());

    const poolInfos: PoolInfo[] = [];

    for (const pool of pools) {
      const data = pool.account as any;

      // Get vault balances
      const token0VaultInfo = await connection.getTokenAccountBalance(data.token0Vault);
      const token1VaultInfo = await connection.getTokenAccountBalance(data.token1Vault);

      // Get token metadata
      const token0MintInfo = await connection.getParsedAccountInfo(data.token0Mint);
      const token1MintInfo = await connection.getParsedAccountInfo(data.token1Mint);

      const token0Decimals = (token0MintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
      const token1Decimals = (token1MintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

      // Parse fee data (these are in base units)
      // Log raw values for debugging
      const rawProtocolFeesToken0 = data.protocolFeesToken0?.toString() || '0';
      const rawProtocolFeesToken1 = data.protocolFeesToken1?.toString() || '0';
      const rawFundFeesToken0 = data.fundFeesToken0?.toString() || '0';
      const rawFundFeesToken1 = data.fundFeesToken1?.toString() || '0';
      const rawCreatorFeesToken0 = data.creatorFeesToken0?.toString() || '0';
      const rawCreatorFeesToken1 = data.creatorFeesToken1?.toString() || '0';

      if (rawProtocolFeesToken0 !== '0' || rawProtocolFeesToken1 !== '0' ||
        rawFundFeesToken0 !== '0' || rawFundFeesToken1 !== '0' ||
        rawCreatorFeesToken0 !== '0' || rawCreatorFeesToken1 !== '0') {
        console.log(`💰 Pool ${pool.publicKey.toString().slice(0, 8)}... has fees:`, {
          protocolToken0: rawProtocolFeesToken0,
          protocolToken1: rawProtocolFeesToken1,
          fundToken0: rawFundFeesToken0,
          fundToken1: rawFundFeesToken1,
          creatorToken0: rawCreatorFeesToken0,
          creatorToken1: rawCreatorFeesToken1,
          token0Decimals,
          token1Decimals,
        });
      }

      const protocolFeesToken0 = Number(rawProtocolFeesToken0) / Math.pow(10, token0Decimals);
      const protocolFeesToken1 = Number(rawProtocolFeesToken1) / Math.pow(10, token1Decimals);
      const fundFeesToken0 = Number(rawFundFeesToken0) / Math.pow(10, token0Decimals);
      const fundFeesToken1 = Number(rawFundFeesToken1) / Math.pow(10, token1Decimals);
      const creatorFeesToken0 = Number(rawCreatorFeesToken0) / Math.pow(10, token0Decimals);
      const creatorFeesToken1 = Number(rawCreatorFeesToken1) / Math.pow(10, token1Decimals);

      // Fetch trade fee rate from pool's specific AMM config
      let tradeFeeRate = 100; // Default 0.01% (100 parts per million)
      const poolAmmConfig = data.ammConfig || AMM_CONFIG;
      try {
        const ammConfigData = await (program.account as any).ammConfig.fetch(poolAmmConfig);
        tradeFeeRate = ammConfigData.tradeFeeRate || 100;
        console.log(`📊 Pool ${pool.publicKey.toString().slice(0, 8)}... - Trade Fee Rate: ${tradeFeeRate} (${tradeFeeRate / 10000}%)`);
        console.log(`   Full address: ${pool.publicKey.toString()}`);
      } catch (error) {
        console.warn(`Could not fetch AMM config for pool ${pool.publicKey.toString().slice(0, 8)}..., using default fee rate`);
      }

      const token0Symbol = getTokenSymbol(data.token0Mint);
      const token1Symbol = getTokenSymbol(data.token1Mint);

      console.log(`   Tokens: ${token0Symbol}/${token1Symbol}`);
      console.log(`   Token0: ${data.token0Mint.toString()}`);
      console.log(`   Token1: ${data.token1Mint.toString()}`);
      console.log(`   🏦 Token0 Vault: ${data.token0Vault.toString()}`);
      console.log(`   🏦 Token1 Vault: ${data.token1Vault.toString()}`);

      poolInfos.push({
        address: pool.publicKey,
        token0Mint: data.token0Mint,
        token1Mint: data.token1Mint,
        token0Vault: data.token0Vault,
        token1Vault: data.token1Vault,
        lpMint: data.lpMint,
        token0Reserve: parseFloat(token0VaultInfo.value.uiAmount?.toString() || '0'),
        token1Reserve: parseFloat(token1VaultInfo.value.uiAmount?.toString() || '0'),
        lpSupply: Number(data.lpSupply?.toString() || '0'),
        token0Symbol,
        token1Symbol,
        token0Decimals,
        token1Decimals,
        creator: data.poolCreator || data.pool_creator || PublicKey.default, // Pool creator address
        protocolFeesToken0,
        protocolFeesToken1,
        fundFeesToken0,
        fundFeesToken1,
        creatorFeesToken0,
        creatorFeesToken1,
        tradeFeeRate,
        ammConfig: poolAmmConfig, // Store pool's AMM config
      });
    }

    // Cache the results
    poolCache = {
      pools: poolInfos,
      timestamp: Date.now()
    };

    console.log('✅ Pools cached:', poolInfos.length, 'pools');

    // Find and display KEDOLOG/USDC pool vault addresses
    const kedologPool = poolInfos.find(p =>
      (p.token0Symbol === 'KEDOLOG' && p.token1Symbol === 'USDC') ||
      (p.token0Symbol === 'USDC' && p.token1Symbol === 'KEDOLOG')
    );

    if (kedologPool) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 KEDOLOG/USDC POOL - COPY THESE ADDRESSES:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Pool Address (for price oracle):');
      console.log(kedologPool.address.toString());
      console.log('');
      const kedologVault = kedologPool.token0Symbol === 'KEDOLOG' ? kedologPool.token0Vault : kedologPool.token1Vault;
      const usdcVault = kedologPool.token0Symbol === 'USDC' ? kedologPool.token0Vault : kedologPool.token1Vault;
      console.log('KEDOLOG Vault:');
      console.log(kedologVault.toString());
      console.log('');
      console.log('USDC Vault:');
      console.log(usdcVault.toString());
      console.log('');
      console.log('📝 Update src/config/addresses.ts lines 47, 54, 61:');
      console.log('');
      console.log(`export const KEDOLOG_USDC_POOL = new PublicKey('${kedologPool.address.toString()}');`);
      console.log(`export const KEDOLOG_VAULT = new PublicKey('${kedologVault.toString()}');`);
      console.log(`export const USDC_VAULT_IN_KEDOLOG_POOL = new PublicKey('${usdcVault.toString()}');`);
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    return poolInfos;
  } catch (error) {
    console.error('Error fetching pools:', error);
    // Return cached pools if available, even if expired
    if (poolCache) {
      console.warn('⚠️ Using stale cache due to fetch error');
      return poolCache.pools;
    }
    return [];
  } finally {
    isFetchingPools = false;
  }
};

// Export function to manually clear cache (useful after creating/modifying pools)
export const clearPoolCache = () => {
  poolCache = null;
  console.log('🗑️ Pool cache cleared');
};

// Get token symbol from mint - uses token configuration
export const getTokenSymbol = (mint: PublicKey): string => {
  // Check if it's native SOL (WSOL)
  if (isNativeSOL(mint)) {
    return 'SOL';
  }

  // Use the token configuration
  const tokenInfo = getTokenByMint(mint);

  if (tokenInfo) {
    return tokenInfo.symbol;
  }

  // Fallback using centralized addresses from config
  if (mint.equals(ADDRESSES.KEDOLOG_MINT)) return 'KEDOLOG';
  if (mint.equals(ADDRESSES.USDC_MINT)) return 'USDC';
  if (mint.equals(ADDRESSES.SOL_MINT)) return 'SOL';

  // For unknown tokens, return shortened address
  return mint.toString().substring(0, 8) + '...';
};

// Calculate swap output
export const calculateSwapOutput = (
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  tradeFeeRate: number = 100 // 0.01% = 100 in parts per million (10000 = 1%, 1000000 = 100%)
): { amountOut: number; priceImpact: number; fee: number } => {
  if (reserveIn === 0 || reserveOut === 0) {
    return { amountOut: 0, priceImpact: 0, fee: 0 };
  }

  // Calculate fee
  const fee = (amountIn * tradeFeeRate) / 1000000;
  const amountInAfterFee = amountIn - fee;

  // Constant product formula: x * y = k
  const amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);

  // Calculate price impact
  const priceImpact = ((amountIn / reserveIn) / (amountOut / reserveOut) - 1) * 100;

  return {
    amountOut,
    priceImpact: Math.abs(priceImpact),
    fee,
  };
};

// Swap tokens (base input) - with automatic SOL wrapping/unwrapping
export const swapBaseInput = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: number,
  minimumAmountOut: number,
  _slippage: number = 0.5
) => {
  try {
    const program = getProgram(connection, wallet);

    // Check if we need to wrap/unwrap SOL
    const needsWrapInput = isNativeSOL(inputMint);
    const needsUnwrapOutput = isNativeSOL(outputMint);

    console.log('🌊 SOL handling:', { needsWrapInput, needsUnwrapOutput });

    // Sort tokens
    const { token0, token1 } = sortTokenMints(inputMint, outputMint);
    const isInputToken0 = inputMint.equals(token0);

    // Get PDAs
    const poolState = getPoolState(token0, token1);
    const authority = getAuthority();
    const observationState = getObservationState(poolState);

    // Fetch pool data to get vault addresses
    console.log('📦 Fetching pool data for swap...');
    const poolData = await (program.account as any).poolState.fetch(poolState);
    console.log('📦 Pool data fetched:', {
      token0Vault: poolData.token0Vault.toString(),
      token1Vault: poolData.token1Vault.toString(),
      token0Reserve: poolData.token0Reserve?.toString(),
      token1Reserve: poolData.token1Reserve?.toString(),
    });

    const inputVault = isInputToken0 ? poolData.token0Vault : poolData.token1Vault;
    const outputVault = isInputToken0 ? poolData.token1Vault : poolData.token0Vault;

    console.log('🔑 Vault selection:', {
      isInputToken0,
      inputVault: inputVault.toString(),
      outputVault: outputVault.toString(),
    });

    // Get user token accounts
    const userInputAccount = await getAssociatedTokenAddress(
      inputMint,
      walletPublicKey
    );

    // For WSOL output, we'll create a temporary account and close it in the same transaction
    // This allows us to receive native SOL in ONE transaction!
    let userOutputAccount: PublicKey;
    let needsCreateOutputAccount = false;
    let tempWsolKeypair: Keypair | null = null;

    if (needsUnwrapOutput) {
      // Create a temporary WSOL account that we'll close immediately
      tempWsolKeypair = Keypair.generate();
      userOutputAccount = tempWsolKeypair.publicKey;
      needsCreateOutputAccount = true;
      console.log('🔑 Using temporary WSOL account for unwrap:', tempWsolKeypair.publicKey.toString());
    } else {
      // For regular tokens, get the ATA address
      userOutputAccount = await getAssociatedTokenAddress(
        outputMint,
        walletPublicKey
      );

      // Check if the output account exists
      const outputAccountInfo = await connection.getAccountInfo(userOutputAccount);
      if (!outputAccountInfo) {
        console.log('⚠️ Output token account does not exist, will create it');
        needsCreateOutputAccount = true;
      } else {
        console.log('✅ Output token account exists');
      }
    }

    // Get token programs
    const inputTokenProgram = TOKEN_PROGRAM_ID;
    const outputTokenProgram = TOKEN_PROGRAM_ID;

    // Get token decimals from mint accounts
    const inputMintInfo = await connection.getParsedAccountInfo(inputMint);
    const outputMintInfo = await connection.getParsedAccountInfo(outputMint);

    const inputDecimals = (inputMintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
    const outputDecimals = (outputMintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

    console.log('💱 Swap details:', {
      inputMint: inputMint.toString(),
      outputMint: outputMint.toString(),
      inputDecimals,
      outputDecimals,
      amountIn,
      minimumAmountOut,
      isInputToken0,
    });

    // Use Math.floor and toFixed(0) to avoid BN assertion errors and scientific notation
    const amountInScaled = Math.floor(amountIn * Math.pow(10, inputDecimals));
    const minAmountOutScaled = Math.floor(minimumAmountOut * Math.pow(10, outputDecimals));
    // Use toFixed(0) to prevent scientific notation for large numbers
    const amountInBN = new BN(amountInScaled.toFixed(0));
    const minAmountOutBN = new BN(minAmountOutScaled.toFixed(0));

    console.log('📤 Preparing swap transaction:', {
      amountInBN: amountInBN.toString(),
      minAmountOutBN: minAmountOutBN.toString(),
      payer: walletPublicKey.toString(),
      poolState: poolState.toString(),
      inputTokenAccount: userInputAccount.toString(),
      outputTokenAccount: userOutputAccount.toString(),
      inputVault: inputVault.toString(),
      outputVault: outputVault.toString(),
    });

    // Build the transaction
    const transaction = new Transaction();
    const signers: Keypair[] = [];

    // Step 0: Create output account if needed
    if (needsCreateOutputAccount) {
      if (tempWsolKeypair) {
        // For WSOL unwrap, create a temporary account
        console.log('🔨 Creating temporary WSOL account...');

        // Calculate rent exemption for token account
        const rentExemption = await connection.getMinimumBalanceForRentExemption(165); // Token account size

        // Create the temporary account
        const createAccountIx = SystemProgram.createAccount({
          fromPubkey: walletPublicKey,
          newAccountPubkey: tempWsolKeypair.publicKey,
          lamports: rentExemption,
          space: 165,
          programId: TOKEN_PROGRAM_ID,
        });

        // Initialize the token account
        const initAccountIx = createInitializeAccount3Instruction(
          tempWsolKeypair.publicKey,
          outputMint,
          walletPublicKey
        );

        transaction.add(createAccountIx, initAccountIx);

        // Add the temp keypair as a signer
        signers.push(tempWsolKeypair);
      } else {
        // For regular tokens, create an ATA (Associated Token Account)
        console.log('🔨 Creating Associated Token Account for output token...');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          walletPublicKey,      // payer
          userOutputAccount,    // ata
          walletPublicKey,      // owner
          outputMint            // mint
        );
        transaction.add(createAtaIx);
      }
    }

    // Step 1: If input is SOL, wrap it first
    if (needsWrapInput) {
      console.log('🌊 Wrapping SOL for input...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        amountIn
      );
      transaction.add(...wrapInstructions);
    }

    // Step 2: Build the swap instruction
    console.log('🚀 Building swap instruction...');
    const swapInstruction = await program.methods
      .swapBaseInput(amountInBN, minAmountOutBN)
      .accounts({
        payer: walletPublicKey,
        authority,
        ammConfig: AMM_CONFIG,
        poolState,
        inputTokenAccount: userInputAccount,
        outputTokenAccount: userOutputAccount,
        inputVault,
        outputVault,
        inputTokenProgram,
        outputTokenProgram,
        inputTokenMint: inputMint,
        outputTokenMint: outputMint,
        observationState,
      })
      .instruction();

    transaction.add(swapInstruction);

    // Step 3: If output is SOL using temp account, close it to unwrap
    if (needsUnwrapOutput && tempWsolKeypair) {
      console.log('🌊 Adding unwrap SOL instruction (close temp account)...');
      const unwrapInstruction = createCloseAccountInstruction(
        tempWsolKeypair.publicKey,
        walletPublicKey, // Send SOL to user's wallet
        walletPublicKey  // Authority
      );
      transaction.add(unwrapInstruction);
    }

    // Execute transaction - get fresh blockhash right before sending
    console.log('📡 Getting fresh blockhash...');

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    console.log(`🔑 Using blockhash: ${blockhash.substring(0, 8)}... (processed - freshest)`);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    console.log('✍️ Signing transaction...');

    // If we have additional signers (temp account), we need to sign them first
    if (signers.length > 0) {
      console.log(`🔑 Pre-signing with ${signers.length} additional signer(s)...`);
      transaction.partialSign(...signers);
    }

    // Then sign with wallet
    const signedTransaction = await wallet.signTransaction(transaction);

    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    console.log(`🔗 Transaction sent: ${signature}`);

    console.log('⏳ Confirming transaction...');
    const confirmation = await confirmTransactionWithBlockhash(connection, {
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value && confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Swap successful!');
    return signature;
  } catch (error) {
    console.error('Error swapping:', error);
    throw error;
  }
};

// Swap tokens with KEDOLOG discount - with automatic SOL wrapping/unwrapping
export const swapWithKedologDiscount = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: number,
  minimumAmountOut: number,
  _slippage: number = 0.5
) => {
  try {
    const program = getProgram(connection, wallet);

    console.log('💰 Swapping with KEDOLOG discount - inputs:', {
      inputMint: inputMint.toString(),
      outputMint: outputMint.toString(),
      amountIn,
      minimumAmountOut,
    });

    // Validate swap amount is not zero or negative
    if (amountIn <= 0) {
      throw new Error('Swap amount must be greater than 0');
    }

    // Get protocol token config
    const protocolTokenConfig = getProtocolTokenConfigAddress(PROGRAM_ID);
    console.log('📊 Protocol Token Config:', protocolTokenConfig.toString());

    // Fetch config to get treasury, protocol token mint, and reference pool addresses
    const config = await (program.account as any).protocolTokenConfig.fetch(protocolTokenConfig);
    console.log('⚙️ Config loaded:', {
      treasury: config.treasury.toString(),
      protocolTokenMint: config.protocolTokenMint.toString(),
      discountRate: config.discountRate.toString(),
      kedologUsdcPool: config.kedologUsdcPool?.toString() || 'Not set',
      solUsdcPool: config.solUsdcPool?.toString() || 'Not set',
      kedologSolPool: config.kedologSolPool?.toString() || 'Not set',
    });

    // Sort tokens
    const { token0, token1 } = sortTokenMints(inputMint, outputMint);
    const poolState = getPoolState(token0, token1);
    const authority = getAuthority();

    console.log('🏊 Pool info:', {
      poolState: poolState.toString(),
      token0: token0.toString(),
      token1: token1.toString(),
    });

    // Determine token programs
    const inputTokenInfo = await connection.getAccountInfo(inputMint);
    const outputTokenInfo = await connection.getAccountInfo(outputMint);
    const inputTokenProgram = inputTokenInfo?.owner || TOKEN_PROGRAM_ID;
    const outputTokenProgram = outputTokenInfo?.owner || TOKEN_PROGRAM_ID;
    const protocolTokenProgram = TOKEN_PROGRAM_ID; // KEDOLOG is standard SPL token

    // Get token decimals
    const inputTokenData = getTokenByMint(inputMint);
    const outputTokenData = getTokenByMint(outputMint);
    const inputDecimals = inputTokenData?.decimals || 9;
    const outputDecimals = outputTokenData?.decimals || 9;

    // Get vault PDAs (needed for both validation and swap)
    const [inputVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_vault'), poolState.toBuffer(), inputMint.toBuffer()],
      PROGRAM_ID
    );
    const [outputVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_vault'), poolState.toBuffer(), outputMint.toBuffer()],
      PROGRAM_ID
    );

    // Fetch pool data (needed for validation and swap)
    const poolData = await (program.account as any).poolState.fetch(poolState);

    // Validate minimumAmountOut - it cannot be 0
    if (minimumAmountOut <= 0) {
      console.warn('⚠️ minimumAmountOut is 0 or negative, calculating from pool reserves...');
      
      // Get vault balances
      const inputVaultInfo = await connection.getTokenAccountBalance(inputVault);
      const outputVaultInfo = await connection.getTokenAccountBalance(outputVault);
      
      const reserveIn = parseFloat(inputVaultInfo.value.uiAmount?.toString() || '0');
      const reserveOut = parseFloat(outputVaultInfo.value.uiAmount?.toString() || '0');
      
      if (reserveIn === 0 || reserveOut === 0) {
        throw new Error('Pool has zero liquidity. Cannot calculate minimum output.');
      }
      
      // Calculate expected output using constant product formula
      const tradeFeeRate = poolData.tradeFeeRate ? Number(poolData.tradeFeeRate) : 100; // Default 0.01%
      const fee = (amountIn * tradeFeeRate) / 1000000;
      const amountInAfterFee = amountIn - fee;
      const expectedOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
      
      // Apply slippage tolerance (default 0.5% if not provided)
      const slippageTolerance = _slippage || 0.5;
      minimumAmountOut = expectedOut * (1 - slippageTolerance / 100);
      
      console.log('✅ Calculated minimumAmountOut from pool:', {
        reserveIn,
        reserveOut,
        amountIn,
        expectedOut,
        minimumAmountOut,
        slippageTolerance,
      });
    }

    // Use Math.floor and toFixed(0) to avoid BN assertion errors and scientific notation
    const amountInScaled = Math.floor(amountIn * Math.pow(10, inputDecimals));
    const minAmountOutScaled = Math.floor(minimumAmountOut * Math.pow(10, outputDecimals));
    
    // Ensure minimum amount out is at least 1 base unit
    if (minAmountOutScaled <= 0) {
      throw new Error(`Calculated minimum amount out is too small: ${minimumAmountOut}. Cannot proceed with swap.`);
    }
    
    // Use toFixed(0) to prevent scientific notation for large numbers
    const amountInBN = new BN(amountInScaled.toFixed(0));
    const minAmountOutBN = new BN(minAmountOutScaled.toFixed(0));

    // Calculate expected protocol fee for debugging
    const protocolFeeRate = 500; // 0.05% in basis points
    const protocolFeeAmount = (amountIn * protocolFeeRate) / 1000000;
    const kedologPerUsd = config.protocolTokenPerUsd ? Number(config.protocolTokenPerUsd) / 1e9 : 10;
    const estimatedKedologFee = protocolFeeAmount * kedologPerUsd;

    console.log('💱 Amounts:', {
      amountIn,
      amountInBN: amountInBN.toString(),
      minAmountOutBN: minAmountOutBN.toString(),
      minimumAmountOut,
      protocolFeeUsd: protocolFeeAmount.toFixed(6),
      kedologPerUsd,
      estimatedKedologFee: estimatedKedologFee.toFixed(6),
    });

    // Get observation state (poolData already fetched above)
    const observationState = poolData.observationKey;

    // Create transaction
    const transaction = new Transaction();

    // Handle SOL wrapping if needed (Step 1: Wrap SOL)
    const needsInputWrap = isNativeSOL(inputMint);
    const needsOutputWrap = isNativeSOL(outputMint);

    // Get or create user token accounts
    let userInputAccount: PublicKey;
    let userOutputAccount: PublicKey;

    if (needsInputWrap) {
      // Use WSOL account for input
      userInputAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        walletPublicKey,
        false,
        inputTokenProgram
      );

      console.log('🌯 Wrapping SOL input...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        amountIn
      );
      transaction.add(...wrapInstructions);
    } else {
      userInputAccount = await getAssociatedTokenAddress(
        inputMint,
        walletPublicKey,
        false,
        inputTokenProgram
      );
    }

    if (needsOutputWrap) {
      // Use WSOL account for output
      userOutputAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        walletPublicKey,
        false,
        outputTokenProgram
      );

      // Create WSOL account if it doesn't exist
      const outputAccountInfo = await connection.getAccountInfo(userOutputAccount);
      if (!outputAccountInfo) {
        console.log('🆕 Creating WSOL output account...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            walletPublicKey,
            userOutputAccount,
            walletPublicKey,
            NATIVE_MINT,
            outputTokenProgram
          )
        );
      }
    } else {
      userOutputAccount = await getAssociatedTokenAddress(
        outputMint,
        walletPublicKey,
        false,
        outputTokenProgram
      );

      // Create output account if it doesn't exist
      const outputAccountInfo = await connection.getAccountInfo(userOutputAccount);
      if (!outputAccountInfo) {
        console.log('🆕 Creating output token account...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            walletPublicKey,
            userOutputAccount,
            walletPublicKey,
            outputMint,
            outputTokenProgram
          )
        );
      }
    }

    // Get user's KEDOLOG account
    const userKedologAccount = await getAssociatedTokenAddress(
      config.protocolTokenMint,
      walletPublicKey,
      false,
      protocolTokenProgram
    );

    // Check if user has KEDOLOG account
    const kedologAccountInfo = await connection.getAccountInfo(userKedologAccount);
    if (!kedologAccountInfo) {
      throw new Error('You need a KEDOLOG token account. Please acquire some KEDOLOG tokens first.');
    }

    // Get treasury KEDOLOG account from AMM config fee_receiver (NEW!)
    // The contract now validates that treasury.owner == amm_config.fee_receiver
    console.log('💰 Fetching fee receiver from AMM config...');
    const ammConfigData = await (program.account as any).ammConfig.fetch(AMM_CONFIG);
    const feeReceiver = ammConfigData.feeReceiver || ammConfigData.fundOwner;

    if (!feeReceiver) {
      throw new Error('Could not find fee receiver in AMM config');
    }

    console.log('✅ Fee receiver from AMM config:', feeReceiver.toString());

    // Get the fee receiver's KEDOLOG token account (this is the correct treasury)
    const treasuryKedologAccount = await getAssociatedTokenAddress(
      config.protocolTokenMint,
      feeReceiver,
      false,
      protocolTokenProgram
    );

    console.log('💰 Treasury KEDOLOG account:', treasuryKedologAccount.toString());

    // Check if treasury KEDOLOG account exists, create if needed
    const treasuryAccountInfo = await connection.getAccountInfo(treasuryKedologAccount);
    if (!treasuryAccountInfo) {
      console.log('⚠️ Treasury KEDOLOG account does not exist, creating it...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          walletPublicKey,
          treasuryKedologAccount,
          feeReceiver,
          config.protocolTokenMint,
          protocolTokenProgram
        )
      );
      console.log('✅ Treasury account creation instruction added');
    } else {
      console.log('✅ Treasury KEDOLOG account exists');
    }

    // Step 2: Build the swap instruction with KEDOLOG discount
    console.log('🚀 Building KEDOLOG discount swap instruction...');

    // Get KEDOLOG price pool for on-chain price oracle
    // Try to get from protocol token config first (on-chain), fallback to hardcoded address
    const kedologPricePool = config.kedologUsdcPool
      ? new PublicKey(config.kedologUsdcPool)
      : KEDOLOG_CONFIG.PRICE_POOL;

    console.log('🔮 Using KEDOLOG/USDC pool for on-chain price oracle:', kedologPricePool.toString());

    // Validate pool address is not placeholder
    if (kedologPricePool.equals(new PublicKey('11111111111111111111111111111111'))) {
      throw new Error('KEDOLOG/USDC pool address is not configured. Please set reference pools in protocol token config.');
    }

    // Fetch the pool data to get vault addresses
    const kedologPoolData = await (program.account as any).poolState.fetch(kedologPricePool);

    // Get token mints to detect vault order
    const token0Mint = kedologPoolData.token0Mint || kedologPoolData.mint0;

    // Detect which vault is KEDOLOG and which is USDC by checking mint addresses
    const isToken0Kedolog = token0Mint?.equals(KEDOLOG_CONFIG.MINT);

    let kedologVault: PublicKey;
    let usdcVault: PublicKey;

    if (isToken0Kedolog) {
      // KEDOLOG is token0, USDC is token1
      kedologVault = kedologPoolData.token0Vault;
      usdcVault = kedologPoolData.token1Vault;
      console.log('📦 Pool vaults: KEDOLOG is token0, USDC is token1');
    } else {
      // USDC is token0, KEDOLOG is token1
      kedologVault = kedologPoolData.token1Vault;
      usdcVault = kedologPoolData.token0Vault;
      console.log('📦 Pool vaults: USDC is token0, KEDOLOG is token1');
    }

    console.log('📦 Vault addresses:', {
      kedologVault: kedologVault.toString(),
      usdcVault: usdcVault.toString(),
    });

    // IMPORTANT: Contract expects vaults in POOL ORDER (token_0, token_1), not semantic order!
    // The contract's get_pool_price function has parameters: token_0_vault, token_1_vault
    // So we must pass them in the same order as the pool, then the contract detects which is which
    const token0Vault = kedologPoolData.token0Vault;
    const token1Vault = kedologPoolData.token1Vault;

    console.log('📦 KEDOLOG/USDC pool vaults (will pass in remainingAccounts):', {
      token0Vault: token0Vault.toString(),
      token1Vault: token1Vault.toString(),
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🆕 UNIVERSAL PRICING SYSTEM
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // The new contract NO LONGER uses oracle accounts (inputTokenOracle, protocolTokenOracle).
    // Instead, it uses reference liquidity pools passed via remainingAccounts.
    // The contract automatically:
    //   - Reads pool reserves to calculate token prices
    //   - Detects token ordering (token_0 vs token_1)
    //   - Supports multi-hop pricing (Token → SOL → USDC)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('🆕 Using universal pool-based pricing system (no oracle accounts!)');
    console.log('📊 Contract will read reference pool reserves directly');

    // Build remainingAccounts dynamically based on input token
    const remainingAccounts = [
      // 1. KEDOLOG/USDC pool (always required for KEDOLOG fee calculation)
      { pubkey: kedologPricePool, isSigner: false, isWritable: false },
      { pubkey: token0Vault, isSigner: false, isWritable: false },
      { pubkey: token1Vault, isSigner: false, isWritable: false },
    ];

    // 2. Dynamically find intermediate pool for 1-hop pricing (e.g., BTC → SOL → USDC)
    console.log(`🔍 Checking if ${getTokenSymbol(inputMint)} needs intermediate pool...`);
    const intermediatePool = await findIntermediatePool(inputMint, connection, program);
    let isIntermediatePoolSameAsSwapPool = false;

    if (intermediatePool) {
      isIntermediatePoolSameAsSwapPool = intermediatePool.poolAddress.equals(poolState);

      console.log('🔀 1-hop pricing required! Adding intermediate pool VAULTS:', {
        token: getTokenSymbol(inputMint),
        poolAddress: intermediatePool.poolAddress.toString(),
        isSameAsSwapPool: isIntermediatePoolSameAsSwapPool,
      });

      // IMPORTANT: Contract expects ONLY VAULTS, not pool addresses!
      // Format: [0] KEDOLOG/USDC pool, [1-2] KEDOLOG vaults, [3-4] intermediate vaults, [5-6] SOL/USDC vaults
      remainingAccounts.push(
        { pubkey: intermediatePool.tokenVault, isSigner: false, isWritable: false },
        { pubkey: intermediatePool.solVault, isSigner: false, isWritable: false },
      );

      if (isIntermediatePoolSameAsSwapPool) {
        console.log('  ⚠️ Note: This pool is ALSO the swap pool (will appear twice in transaction)');
      }
    } else {
      console.log(`✅ ${getTokenSymbol(inputMint)} uses direct pricing (no intermediate pool needed)`);
    }

    // 3. Add SOL/USDC pool + vaults for final USD conversion
    // Get SOL/USDC pool from protocol token config (on-chain) or fallback to hardcoded
    const solUsdcPoolAddress = config.solUsdcPool
      ? new PublicKey(config.solUsdcPool)
      : ADDRESSES.SOL_USDC_POOL;

    // Fetch SOL/USDC pool data to get vault addresses dynamically
    let solUsdcToken0Vault: PublicKey | null = null;
    let solUsdcToken1Vault: PublicKey | null = null;

    if (!solUsdcPoolAddress.equals(new PublicKey('11111111111111111111111111111111'))) {
      try {
        const solUsdcPoolData = await (program.account as any).poolState.fetch(solUsdcPoolAddress);
        solUsdcToken0Vault = solUsdcPoolData.token0Vault || solUsdcPoolData.token_0_vault;
        solUsdcToken1Vault = solUsdcPoolData.token1Vault || solUsdcPoolData.token_1_vault;
        if (solUsdcToken0Vault && solUsdcToken1Vault) {
          console.log('✅ Fetched SOL/USDC pool vaults from on-chain:', {
            pool: solUsdcPoolAddress.toString(),
            vault0: solUsdcToken0Vault.toString(),
            vault1: solUsdcToken1Vault.toString(),
          });
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch SOL/USDC pool data, using hardcoded vaults:', error);
        solUsdcToken0Vault = ADDRESSES.SOL_VAULT;
        solUsdcToken1Vault = ADDRESSES.USDC_VAULT_IN_SOL_POOL;
      }
    } else {
      // Fallback to hardcoded if not set in config
      solUsdcToken0Vault = ADDRESSES.SOL_VAULT;
      solUsdcToken1Vault = ADDRESSES.USDC_VAULT_IN_SOL_POOL;
    }

    // Check if intermediate pool already provides SOL → USDC path
    const intermediatePoolProvidesSolPrice = intermediatePool &&
      (intermediatePool.poolAddress.equals(solUsdcPoolAddress) ||
        (solUsdcToken0Vault && intermediatePool.solVault.equals(solUsdcToken0Vault)) ||
        (solUsdcToken1Vault && intermediatePool.solVault.equals(solUsdcToken1Vault)));

    const isSolUsdcPoolSameAsSwapPool = solUsdcPoolAddress.equals(poolState);

    if (!isSolUsdcPoolSameAsSwapPool && !intermediatePoolProvidesSolPrice && solUsdcToken0Vault && solUsdcToken1Vault) {
      // IMPORTANT: Contract expects ONLY VAULTS, not pool address!
      remainingAccounts.push(
        { pubkey: solUsdcToken0Vault, isSigner: false, isWritable: false },
        { pubkey: solUsdcToken1Vault, isSigner: false, isWritable: false },
      );
      console.log('✅ Added SOL/USDC VAULTS for SOL → USD pricing');
    } else if (isSolUsdcPoolSameAsSwapPool) {
      console.log('✅ SOL/USDC pool is the SWAP POOL - skipping to avoid duplicate');
    } else if (intermediatePoolProvidesSolPrice) {
      console.log('✅ Intermediate pool already provides SOL pricing path');
    }

    // DEBUG: Show EXACTLY what will be passed
    console.log('');
    console.log('🔍 DEBUG - remainingAccounts being passed:');
    remainingAccounts.forEach((acc, index) => {
      console.log(`  [${index}] ${acc.pubkey.toString()}`);
    });
    console.log(`  Total: ${remainingAccounts.length} accounts`);
    console.log('');

    const swapInstruction = await program.methods
      .swapBaseInputWithProtocolToken(amountInBN, minAmountOutBN)
      .accountsPartial({
        payer: walletPublicKey,
        authority,
        ammConfig: AMM_CONFIG,
        protocolTokenConfig,
        poolState,
        inputTokenAccount: userInputAccount,
        outputTokenAccount: userOutputAccount,
        protocolTokenAccount: userKedologAccount,
        protocolTokenTreasury: treasuryKedologAccount,
        inputVault,
        outputVault,
        inputTokenProgram,
        outputTokenProgram,
        protocolTokenProgram,
        inputTokenMint: inputMint,
        outputTokenMint: outputMint,
        protocolTokenMint: config.protocolTokenMint,
        observationState,
        // ⚠️ NOTE: inputTokenOracle and protocolTokenOracle REMOVED in new contract!
        // Contract now uses reference pools passed via remainingAccounts
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    console.log('✅ Swap instruction built successfully:', {
      swap: `${getTokenSymbol(inputMint)} → ${getTokenSymbol(outputMint)}`,
      remainingAccountsCount: remainingAccounts.length,
      hasIntermediatePool: intermediatePool && !isIntermediatePoolSameAsSwapPool,
      hasSolUsdcPool: !isSolUsdcPoolSameAsSwapPool,
    });

    transaction.add(swapInstruction);

    // Step 3: Unwrap SOL if output is SOL
    if (needsOutputWrap) {
      console.log('🌯 Unwrapping SOL output...');
      const unwrapInstruction = await createUnwrapSOLInstruction(walletPublicKey);
      transaction.add(unwrapInstruction);
    }

    // CRITICAL DEBUG: Inspect the actual transaction object
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚨 CRITICAL CHECK - INSPECTING ACTUAL TRANSACTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Transaction has', transaction.instructions.length, 'instructions');

    // Find the swap instruction (might be last or second-to-last if unwrap is added)
    let swapInstrIndex = transaction.instructions.length - 1;
    let actualSwapInstr = transaction.instructions[swapInstrIndex];

    // If last instruction is unwrap, swap is second-to-last
    if (actualSwapInstr.programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
      swapInstrIndex = transaction.instructions.length - 2;
      actualSwapInstr = transaction.instructions[swapInstrIndex];
      console.log('Swap instruction is at index', swapInstrIndex, '(unwrap is last)');
    }

    console.log('Swap instruction programId:', actualSwapInstr.programId.toString());
    console.log('Swap instruction has', actualSwapInstr.keys.length, 'account keys');

    // The swap instruction should have all the accounts
    // Log the last 6 keys (which should be the remainingAccounts)
    const totalKeys = actualSwapInstr.keys.length;
    console.log('');
    console.log('🔍 Last 6 account keys (should be remainingAccounts):');
    for (let i = Math.max(0, totalKeys - 6); i < totalKeys; i++) {
      const key = actualSwapInstr.keys[i];
      console.log(`  [${i}] ${key.pubkey.toString()} (isSigner: ${key.isSigner}, isWritable: ${key.isWritable})`);
    }
    console.log('');
    console.log('📋 Expected remainingAccounts order (VAULTS ONLY after index 0):');
    console.log('  [0] KEDOLOG/USDC Pool: BE1AdLaWKGPV61cmdV2W6aw7GY5fBRc59noUascPBje');
    console.log('  [1] KEDOLOG Vault: Gg2roHP4aRbNvjbQRj7cxB1XvLKdBw45UkrNn9eeC8DJ');
    console.log('  [2] USDC Vault: 2yVnJLxM9Dw8YHxrEQQgvPJ12RXYXcqdYyLXftYzbJCt');
    console.log('  [3-4] Intermediate vaults (if needed for BTC → SOL)');
    console.log('  [5-6] SOL/USDC vaults (SOL vault + USDC vault, NO POOL ADDRESS)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Get fresh blockhash - use 'processed' for freshest possible blockhash
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    console.log(`🔑 Using blockhash: ${blockhash.substring(0, 8)}... (processed - freshest)`);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    // Sign and send transaction
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);

    console.log('📤 Sending transaction...');
    let signature: string;

    try {
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'processed',
        maxRetries: 3,
      });
      console.log(`🔗 Transaction sent: ${signature}`);
    } catch (sendError: any) {
      console.error('❌ Error sending transaction:', sendError);

      // Check if it's "already processed" error - transaction might have succeeded!
      if (sendError.message && sendError.message.includes('already been processed')) {
        console.log('⚠️ Transaction might have already succeeded despite error!');
        console.log('✅ Treating as success - please check your wallet balance');
        // Return a success indicator even though we don't have the signature
        return 'success-already-processed';
      }

      throw sendError;
    }

    console.log('⏳ Confirming transaction...');
    try {
      await confirmTransactionWithBlockhash(connection, {
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('✅ KEDOLOG discount swap successful!');
      console.log('💚 You saved 25% on protocol fees!');
      return signature;
    } catch (confirmError: any) {
      console.error('❌ Confirmation error:', confirmError);

      // Check if it's "already processed" error
      if (confirmError.message && confirmError.message.includes('already been processed')) {
        console.log('⚠️ Confirmation failed but transaction was already processed');
        console.log('✅ Swap likely succeeded! Signature:', signature);
        return signature;
      }

      throw confirmError;
    }
  } catch (error) {
    console.error('Error swapping with KEDOLOG discount:', error);
    throw error;
  }
};

// Calculate KEDOLOG fee for a swap (for UI display)
/**
 * Fetch KEDOLOG price from the KEDOLOG/USDC pool
 * @returns Price of 1 KEDOLOG in USDC
 */
export const fetchKedologPrice = async (
  connection: Connection,
  wallet: any
): Promise<number> => {
  try {
    const program = getProgram(connection, wallet);

    // Try to get pool address from protocol token config first
    const protocolTokenConfig = getProtocolTokenConfigAddress(PROGRAM_ID);
    let poolAddress: PublicKey;

    try {
      const config = await (program.account as any).protocolTokenConfig.fetch(protocolTokenConfig);
      poolAddress = config.kedologUsdcPool
        ? new PublicKey(config.kedologUsdcPool)
        : KEDOLOG_CONFIG.PRICE_POOL;
    } catch (error) {
      console.warn('⚠️ Could not fetch protocol token config, using hardcoded pool address');
      poolAddress = KEDOLOG_CONFIG.PRICE_POOL;
    }

    // Validate pool address is not placeholder
    if (poolAddress.equals(new PublicKey('11111111111111111111111111111111'))) {
      console.warn('⚠️ KEDOLOG/USDC pool address is not configured, using fallback price');
      return 0.01;
    }

    console.log('💰 Fetching KEDOLOG price from pool:', poolAddress.toString());

    // Fetch pool data
    const poolData = await (program.account as any).poolState.fetch(poolAddress);

    // Get token mints to verify order
    const token0Mint = poolData.token0Mint || poolData.mint0;
    const token1Mint = poolData.token1Mint || poolData.mint1;

    console.log('💰 Pool token mints:', {
      token0: token0Mint?.toString(),
      token1: token1Mint?.toString(),
      expectedKEDOLOG: KEDOLOG_CONFIG.MINT.toString(),
    });

    // Get vault addresses (these are PublicKeys, not amounts)
    const token0VaultAddress = poolData.token0Vault || poolData.token_0_vault;
    const token1VaultAddress = poolData.token1Vault || poolData.token_1_vault;

    // Get decimals from mint accounts (DON'T use fallbacks - fetch actual decimals!)
    const { getMint } = await import('@solana/spl-token');
    const token0MintInfo = await getMint(connection, token0Mint);
    const token1MintInfo = await getMint(connection, token1Mint);
    const token0Decimals = token0MintInfo.decimals;
    const token1Decimals = token1MintInfo.decimals;

    console.log('💰 Actual decimals from mints:', {
      token0Decimals,
      token1Decimals,
      token0Mint: token0Mint.toString(),
      token1Mint: token1Mint.toString(),
    });

    if (!token0VaultAddress || !token1VaultAddress) {
      console.error('💰 Could not find vault addresses in pool data');
      console.log('💰 Available fields:', Object.keys(poolData));
      return 0.01;
    }

    console.log('💰 Vault addresses:', {
      token0Vault: token0VaultAddress.toString(),
      token1Vault: token1VaultAddress.toString(),
    });

    // Fetch actual token account balances from the vault addresses
    const { getAccount } = await import('@solana/spl-token');

    const token0VaultAccount = await getAccount(connection, token0VaultAddress);
    const token1VaultAccount = await getAccount(connection, token1VaultAddress);

    // Get the actual balances
    const token0Reserve = Number(token0VaultAccount.amount) / Math.pow(10, token0Decimals);
    const token1Reserve = Number(token1VaultAccount.amount) / Math.pow(10, token1Decimals);

    console.log('💰 Reserves:', {
      token0Reserve,
      token1Reserve,
      token0Decimals,
      token1Decimals,
    });

    // Validate reserves
    if (!token0Reserve || !token1Reserve || token0Reserve === 0 || token1Reserve === 0 || isNaN(token0Reserve) || isNaN(token1Reserve)) {
      console.error('💰 Invalid reserves - pool might be empty or not initialized:', { token0Reserve, token1Reserve });
      console.warn('⚠️ Using fallback KEDOLOG price: $0.01 per KEDOLOG');
      console.warn('⚠️ Please add liquidity to the KEDOLOG/USDC pool for accurate pricing');
      return 0.01;
    }

    // Determine which token is KEDOLOG
    const isToken0Kedolog = token0Mint?.equals(KEDOLOG_CONFIG.MINT);

    // Calculate price of KEDOLOG in USDC
    let kedologPrice: number;
    if (isToken0Kedolog) {
      // token0 = KEDOLOG, token1 = USDC
      // Price = USDC reserve / KEDOLOG reserve
      kedologPrice = token1Reserve / token0Reserve;
      console.log('💰 KEDOLOG is token0, USDC is token1');
    } else {
      // token0 = USDC, token1 = KEDOLOG
      // Price = USDC reserve / KEDOLOG reserve
      kedologPrice = token0Reserve / token1Reserve;
      console.log('💰 USDC is token0, KEDOLOG is token1');
    }

    // Validate price
    if (!isFinite(kedologPrice) || isNaN(kedologPrice) || kedologPrice <= 0) {
      console.error('💰 Invalid price calculated:', kedologPrice);
      return 0.01;
    }

    // Sanity check: KEDOLOG price should be reasonable (between $0.0001 and $100)
    // Note: Frontend uses pool price for display only. Contract uses manual price from config.
    if (kedologPrice < 0.0001 || kedologPrice > 100) {
      console.error('💰 KEDOLOG price out of reasonable range:', {
        price: kedologPrice,
        expectedRange: '$0.0001 - $100',
      });
      console.warn('⚠️ Pool might have incorrect liquidity ratios. Using fallback price.');
      return 0.01;
    }

    // Warn if price is suspiciously high
    if (kedologPrice > 1) {
      console.warn('⚠️ KEDOLOG price seems high:', {
        price: `$${kedologPrice.toFixed(6)}`,
        recommendation: 'Check pool liquidity ratios',
      });
    }

    console.log('💰 KEDOLOG Price:', {
      token0Reserve: token0Reserve.toFixed(2),
      token1Reserve: token1Reserve.toFixed(2),
      price: kedologPrice.toFixed(6),
      priceDisplay: `$${kedologPrice.toFixed(6)} per KEDOLOG`,
    });

    return kedologPrice;
  } catch (error) {
    console.error('Error fetching KEDOLOG price from pool:', error);
    // Return default price if fetch fails (e.g., 0.01 USDC per KEDOLOG)
    return 0.01;
  }
};

export const calculateKedologFee = async (
  connection: Connection,
  wallet: any,
  amountIn: number,
  inputTokenPrice: number = 1 // Default to 1 if price not available
): Promise<{
  kedologFee: number;
  discountedFeeUsd: number;
  normalFeeUsd: number;
  protocolFeeInInputToken: number; // Protocol fee in input token (0.05% of input)
  savingsInInputToken: number; // Savings in input token (25% of protocol fee)
  lpFeeInInputToken: number; // LP fee in input token (0.20% of input)
  totalFeeInInputToken: number; // Total fee without discount (0.25% of input)
  discountedTotalFeeInInputToken: number; // Effective total fee with discount
}> => {
  try {
    const program = getProgram(connection, wallet);

    // Get protocol token config for discount rate
    const protocolTokenConfig = getProtocolTokenConfigAddress(PROGRAM_ID);
    const config = await (program.account as any).protocolTokenConfig.fetch(protocolTokenConfig);

    // Fee breakdown (in parts per million)
    const lpFeeRate = 2000; // 0.20% = 2000 parts per million
    const protocolFeeRate = 500; // 0.05% = 500 parts per million
    const totalFeeRate = 2500; // 0.25% = 2500 parts per million

    // Calculate fees in input token
    const lpFeeInInputToken = (amountIn * lpFeeRate) / 1_000_000;
    const protocolFeeInInputToken = (amountIn * protocolFeeRate) / 1_000_000;
    const totalFeeInInputToken = (amountIn * totalFeeRate) / 1_000_000;

    // Calculate discount
    const discountRate = config.discountRate.toNumber(); // e.g., 2500 = 25%
    // When using KEDOLOG discount, protocol fee is paid in KEDOLOG (not input token)
    // So the actual fee deducted from input token is ONLY the LP fee
    const discountedTotalFeeInInputToken = lpFeeInInputToken;
    // Savings in input token = full protocol fee (since you're not paying it in input token)
    // Plus 25% discount on the KEDOLOG you pay (represented as input token equivalent)
    const savingsInInputToken = (protocolFeeInInputToken * discountRate) / 10000;

    // Calculate protocol fee in USD for KEDOLOG conversion
    const amountInUsd = amountIn * inputTokenPrice;
    const protocolFeeUsd = (amountInUsd * protocolFeeRate) / 1_000_000;
    const discountedFeeUsd = (protocolFeeUsd * (10000 - discountRate)) / 10000;

    // Fetch KEDOLOG price from pool (price in USDC per KEDOLOG)
    const kedologPriceUsd = await fetchKedologPrice(connection, wallet);

    console.log('💰 Calculating KEDOLOG fee:', {
      amountIn,
      inputTokenPrice,
      amountInUsd,
      protocolFeeUsd,
      discountedFeeUsd,
      kedologPriceUsd,
    });

    // Convert discounted fee to KEDOLOG
    let kedologFee = discountedFeeUsd / kedologPriceUsd;

    // Validate the calculated fee
    if (!isFinite(kedologFee) || isNaN(kedologFee) || kedologFee < 0) {
      console.error('💰 Invalid KEDOLOG fee calculated:', kedologFee);
      kedologFee = 0;
    }

    console.log('💰 Final KEDOLOG fee:', kedologFee);

    return {
      kedologFee,
      discountedFeeUsd,
      normalFeeUsd: protocolFeeUsd,
      protocolFeeInInputToken,
      savingsInInputToken,
      lpFeeInInputToken,
      totalFeeInInputToken,
      discountedTotalFeeInInputToken,
    };
  } catch (error) {
    console.error('Error calculating KEDOLOG fee:', error);
    // Return default values if calculation fails
    const lpFee = (amountIn * 2000) / 1_000_000; // 0.20%
    const protocolFee = (amountIn * 500) / 1_000_000; // 0.05%
    const totalFee = (amountIn * 2500) / 1_000_000; // 0.25%

    return {
      kedologFee: 0,
      discountedFeeUsd: 0,
      normalFeeUsd: 0,
      protocolFeeInInputToken: protocolFee,
      savingsInInputToken: 0,
      lpFeeInInputToken: lpFee,
      totalFeeInInputToken: totalFee,
      discountedTotalFeeInInputToken: totalFee,
    };
  }
};

// Add liquidity - with automatic SOL wrapping
export const addLiquidity = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  amount0: number,
  amount1: number,
  _slippage: number = 0.5,
  ammConfigOverride?: PublicKey
) => {
  try {
    const program = getProgram(connection, wallet);

    console.log('💵 Adding liquidity - inputs:', {
      token0Mint: token0Mint.toString(),
      token1Mint: token1Mint.toString(),
      amount0,
      amount1,
    });

    // Sort tokens FIRST
    const { token0, token1 } = sortTokenMints(token0Mint, token1Mint);
    const tokensWereSwapped = !token0Mint.equals(token0);

    // If tokens were swapped, swap amounts too
    let finalAmount0 = amount0;
    let finalAmount1 = amount1;

    if (tokensWereSwapped) {
      finalAmount0 = amount1;
      finalAmount1 = amount0;
      console.log('⚠️ Tokens were swapped during sorting! Swapping amounts too:', {
        originalAmount0: amount0,
        originalAmount1: amount1,
        finalAmount0,
        finalAmount1,
      });
    }

    // Check if we need to wrap SOL (check AFTER sorting, using sorted tokens)
    const needsWrapToken0 = isNativeSOL(token0);
    const needsWrapToken1 = isNativeSOL(token1);

    console.log('🌊 SOL handling (after sorting):', {
      needsWrapToken0,
      needsWrapToken1,
      token0: token0.toString().slice(0, 8),
      token1: token1.toString().slice(0, 8),
    });

    // Get PDAs (use pool's AMM config if provided)
    const poolState = getPoolState(token0, token1, ammConfigOverride);
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);

    // Get user token accounts
    const userToken0Account = await getAssociatedTokenAddress(token0, walletPublicKey);
    const userToken1Account = await getAssociatedTokenAddress(token1, walletPublicKey);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, walletPublicKey);

    // Check if LP account exists - create if needed
    const lpAccountInfo = await connection.getAccountInfo(userLpAccount);
    if (!lpAccountInfo) {
      console.log('📝 LP token account does not exist - will create it in transaction');
    }

    // Get pool data
    const poolData = await (program.account as any).poolState.fetch(poolState);
    const token0Decimals = (poolData as any).mint0Decimals;
    const token1Decimals = (poolData as any).mint1Decimals;

    // Get vault balances (reserves are stored in vault token accounts, not in pool state)
    const token0VaultInfo = await connection.getTokenAccountBalance(token0Vault);
    const token1VaultInfo = await connection.getTokenAccountBalance(token1Vault);
    const token0Reserve = parseFloat(token0VaultInfo.value.amount) / Math.pow(10, token0Decimals);
    const token1Reserve = parseFloat(token1VaultInfo.value.amount) / Math.pow(10, token1Decimals);

    console.log('💧 Pool reserves (from vaults):', {
      token0Vault: token0Vault.toString(),
      token1Vault: token1Vault.toString(),
      token0Reserve,
      token1Reserve,
      token0Decimals,
      token1Decimals,
      depositAmount0: finalAmount0,
      depositAmount1: finalAmount1,
    });

    // Get LP mint info to check total supply
    const lpMintInfo = await connection.getParsedAccountInfo(lpMint);

    if (!lpMintInfo || !lpMintInfo.value) {
      console.error('❌ LP Mint does not exist! This is a BROKEN/DUST POOL!', {
        lpMint: lpMint.toString(),
        poolState: poolState.toString(),
        token0: token0.toString(),
        token1: token1.toString(),
      });
      throw new Error(
        `🚫 BROKEN POOL DETECTED\n\n` +
        `This pool is in an invalid state (LP Mint doesn't exist).\n` +
        `This happens when a pool was created but never properly initialized, or became a "dust pool".\n\n` +
        `❌ Cannot add or remove liquidity from this pool.\n\n` +
        `✅ SOLUTION: This pool cannot be fixed. You'll need to:\n` +
        `1. Contact the DEX admin to manually close this broken pool account\n` +
        `2. Or wait for admin to implement pool cleanup tools\n\n` +
        `Pool Address: ${poolState.toString().slice(0, 12)}...\n` +
        `LP Mint (Missing): ${lpMint.toString().slice(0, 12)}...`
      );
    }

    const lpTotalSupply = parseFloat((lpMintInfo.value?.data as any)?.parsed?.info?.supply || '0') / Math.pow(10, 9);

    console.log('🪙 LP Token info:', {
      lpTotalSupply,
      lpMint: lpMint.toString(),
    });

    // Detect if pool has dust reserves
    const isDustReserve = token0Reserve < (finalAmount0 * 0.001) || token1Reserve < (finalAmount1 * 0.001);
    const isDustLPSupply = lpTotalSupply < 0.01;
    const hasDust = (isDustReserve || isDustLPSupply) && token0Reserve > 0 && token1Reserve > 0;

    // For dust pools, adjust amounts to match the existing ratio
    if (hasDust) {
      const existingRatio = token1Reserve / token0Reserve;
      const depositRatio = finalAmount1 / finalAmount0;

      console.log('⚠️ DUST POOL DETECTED - Adjusting amounts to match existing ratio:', {
        existingRatio,
        depositRatio,
        currentAmount0: finalAmount0,
        currentAmount1: finalAmount1,
        token0Reserve,
        token1Reserve,
      });

      // Fetch user balances to ensure we don't exceed them
      const balance0 = await getTokenBalance(connection, token0, walletPublicKey);
      const balance1 = await getTokenBalance(connection, token1, walletPublicKey);

      console.log('💰 User balances:', { balance0, balance1 });

      // Calculate what amounts would be needed to match ratio
      const option1Amount1 = finalAmount0 * existingRatio; // Keep amount0, adjust amount1
      const option2Amount0 = finalAmount1 / existingRatio; // Keep amount1, adjust amount0

      // Choose option that doesn't exceed balances
      let chosenOption = 1;
      if (option1Amount1 <= balance1 && finalAmount0 <= balance0) {
        // Option 1: Keep amount0, adjust amount1
        finalAmount1 = option1Amount1;
        chosenOption = 1;
      } else if (option2Amount0 <= balance0 && finalAmount1 <= balance1) {
        // Option 2: Keep amount1, adjust amount0
        finalAmount0 = option2Amount0;
        chosenOption = 2;
      } else {
        // Neither option works - scale down both proportionally
        const maxRatio0 = balance0 / finalAmount0;
        const maxRatio1 = balance1 / finalAmount1;
        const scaleFactor = Math.min(maxRatio0, maxRatio1) * 0.95; // 95% to be safe

        finalAmount0 = finalAmount0 * scaleFactor;
        finalAmount1 = finalAmount0 * existingRatio; // Match ratio
        chosenOption = 3;
      }

      console.log(`  → Adjusted (Option ${chosenOption}):`, {
        finalAmount0,
        finalAmount1,
        newRatio: finalAmount1 / finalAmount0,
        matchesPoolRatio: Math.abs((finalAmount1 / finalAmount0) - existingRatio) < 0.0001,
      });
    }

    // Calculate LP tokens based on pool reserves
    let lpAmount: BN;

    // Treat as initial deposit ONLY if reserves are truly zero
    // If reserves exist (even dust), use ratio-based calculation
    const isTrulyEmpty = token0Reserve === 0 || token1Reserve === 0;

    if (isTrulyEmpty) {
      // True initial deposit - use geometric mean
      const lpScaled = Math.floor(Math.sqrt(finalAmount0 * finalAmount1) * Math.pow(10, 9));
      // Use toFixed(0) to prevent scientific notation for large numbers
      lpAmount = new BN(lpScaled.toFixed(0));
      console.log('📊 Initial deposit (empty pool) - using geometric mean for LP:', lpAmount.toString());
    } else {
      // Subsequent deposit (including dust pools with 0 LP supply)
      // If LP supply is 0 but reserves exist, calculate as if this creates the initial LP
      if (lpTotalSupply === 0) {
        // Pool has reserves but no LP tokens (dust paradox)
        // Use geometric mean to create initial LP supply
        const lpScaled = Math.floor(Math.sqrt(finalAmount0 * finalAmount1) * Math.pow(10, 9));
        // Use toFixed(0) to prevent scientific notation for large numbers
        lpAmount = new BN(lpScaled.toFixed(0));
        console.log('📊 Dust pool with 0 LP supply - creating initial LP tokens:', lpAmount.toString());
      } else {
        // Normal subsequent deposit - maintain ratio
        // LP = min(amount0 / reserve0, amount1 / reserve1) * totalSupply
        const ratio0 = finalAmount0 / token0Reserve;
        const ratio1 = finalAmount1 / token1Reserve;
        const minRatio = Math.min(ratio0, ratio1);
        const lpScaled = Math.floor(minRatio * lpTotalSupply * Math.pow(10, 9));
        // Use toFixed(0) to prevent scientific notation for large numbers
        lpAmount = new BN(lpScaled.toFixed(0));
        console.log('📊 Subsequent deposit - LP based on ratio:', {
          ratio0,
          ratio1,
          minRatio,
          lpAmount: lpAmount.toString(),
          hasDust,
        });
      }
    }

    // Use generous slippage for max amounts
    let slippageBuffer;

    if (isTrulyEmpty) {
      // Initial deposit (empty pool): 50% base
      slippageBuffer = _slippage + 50;
      console.log('📊 Initial deposit (empty pool) - using LARGE slippage buffer (50% base)');
    } else if (hasDust && lpTotalSupply === 0) {
      // Dust pool with 0 LP supply - program now handles this properly after upgrade
      // Using VERY LARGE buffer for this edge case due to contract's strict checks
      slippageBuffer = _slippage + 150;
      console.log('📊 Dust pool with 0 LP (fixed in program v2) - using LARGE slippage buffer (150% base)');
    } else if (hasDust) {
      // Dust pool with existing LP: 20% base
      slippageBuffer = _slippage + 20;
      console.log('📊 Dust pool deposit - using standard slippage buffer (20% base)');
    } else {
      // Normal subsequent deposit: 15% base
      slippageBuffer = _slippage + 15;
      console.log('📊 Normal deposit - using standard slippage buffer (15% base)');
    }

    if (needsWrapToken0 || needsWrapToken1) {
      slippageBuffer += 10; // Extra buffer for SOL wrapping overhead
      console.log('🌊 Adding extra slippage buffer for native SOL wrapping');
    }

    console.log(`📊 Total slippage buffer: ${slippageBuffer}% (hasDust: ${hasDust}, lpSupply: ${lpTotalSupply})`);

    // Use Math.ceil and toFixed(0) to avoid BN assertion errors and scientific notation
    const maxAmount0Scaled = Math.ceil(finalAmount0 * (1 + slippageBuffer / 100) * Math.pow(10, token0Decimals));
    const maxAmount1Scaled = Math.ceil(finalAmount1 * (1 + slippageBuffer / 100) * Math.pow(10, token1Decimals));
    // Use toFixed(0) to prevent scientific notation for large numbers
    const maxAmount0BN = new BN(maxAmount0Scaled.toFixed(0));
    const maxAmount1BN = new BN(maxAmount1Scaled.toFixed(0));

    console.log('📤 Deposit parameters:', {
      lpAmount: lpAmount.toString(),
      maxAmount0: maxAmount0BN.toString(),
      maxAmount1: maxAmount1BN.toString(),
      slippageBuffer: `${slippageBuffer}%`,
      needsWrapToken0,
      needsWrapToken1,
    });

    // Build the transaction - set fee payer FIRST to ensure it's included
    const transaction = new Transaction();
    transaction.feePayer = walletPublicKey;

    // Step 0: Create LP token account if it doesn't exist
    if (!lpAccountInfo) {
      console.log('📝 Adding LP token account creation instruction...');
      const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          walletPublicKey,
          userLpAccount,
          walletPublicKey,
          lpMint
        )
      );
    }

    // Step 1: Wrap SOL if needed (use finalAmount0/1 which are already sorted)
    if (needsWrapToken0) {
      console.log('🌊 Wrapping SOL for token0 (amount: ' + finalAmount0 + ')...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount0  // Use finalAmount0 (already swapped if needed)
      );
      transaction.add(...wrapInstructions);
    }

    if (needsWrapToken1) {
      console.log('🌊 Wrapping SOL for token1 (amount: ' + finalAmount1 + ')...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount1  // Use finalAmount1 (already swapped if needed)
      );
      transaction.add(...wrapInstructions);
    }

    // Step 2: Build the deposit instruction
    console.log('💰 Building deposit instruction...');
    const depositInstruction = await program.methods
      .deposit(lpAmount, maxAmount0BN, maxAmount1BN)
      .accounts({
        owner: walletPublicKey,
        authority,
        poolState,
        ownerLpToken: userLpAccount,
        token0Account: userToken0Account,
        token1Account: userToken1Account,
        token0Vault,
        token1Vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        vault0Mint: token0,
        vault1Mint: token1,
        lpMint,
      })
      .instruction();

    transaction.add(depositInstruction);

    // Get the freshest possible blockhash using 'processed' commitment
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);

    // Simulate first to get better error messages
    console.log('🔍 Simulating transaction...');
    try {
      // Create a copy of the transaction for simulation
      const simTx = Transaction.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
      simTx.recentBlockhash = blockhash;
      simTx.feePayer = walletPublicKey;

      const simulation = await connection.simulateTransaction(simTx);

      if (simulation.value.err) {
        console.error('❌ Simulation failed:', simulation.value.err);
        console.error('📊 Simulation logs:', simulation.value.logs);
        console.error('📊 Full simulation result:', JSON.stringify(simulation.value, null, 2));
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      console.log('✅ Simulation successful:', {
        unitsConsumed: simulation.value.unitsConsumed,
        logs: simulation.value.logs?.slice(0, 10), // First 10 logs
      });
    } catch (simError: any) {
      console.error('❌ Simulation error:', simError);
      console.error('Error type:', simError.constructor?.name);
      console.error('Error message:', simError.message);
      console.error('Error stack:', simError.stack);

      // If simulation fails, try to get more details
      if (simError.logs) {
        console.error('📊 Simulation logs:', simError.logs);
      }
      if (simError.value?.err) {
        console.error('📊 Simulation error value:', simError.value.err);
        console.error('📊 Simulation error logs:', simError.value.logs);
      }

      // Re-throw to prevent sending a bad transaction
      throw simError;
    }

    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);

    console.log('📤 Sending transaction immediately...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 5, // Increased retries for better reliability
    });

    console.log(`🔗 Transaction sent: ${signature}`);

    console.log('⏳ Confirming transaction...');
    const confirmation = await confirmTransactionWithBlockhash(connection, {
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'processed');

    if (confirmation.value && confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Liquidity added successfully!', {
      txSignature: signature,
      lpTokensReceived: (lpAmount.toNumber() / Math.pow(10, 9)).toFixed(4),
    });

    return signature;
  } catch (error: any) {
    console.error('❌ Error adding liquidity:', error);

    // Check for ExceededSlippage error
    if (error.message && error.message.includes('ExceededSlippage')) {
      throw new Error('Slippage tolerance exceeded. The pool ratio may have changed. Please try again with a slightly different amount or higher slippage tolerance.');
    }

    // Check if it's an "already processed" error
    if (error.message && error.message.includes('already been processed')) {
      console.log('⚠️ Transaction "already processed" - this usually means it succeeded!');
      console.log('🔍 Waiting 2 seconds then verifying transaction status...');

      // Wait for transaction to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to get transaction status - if we have a signature from the error, check it
      // Otherwise, assume success since "already processed" typically means the tx went through
      console.log('✅ Transaction likely succeeded despite "already processed" error');
      return 'success-already-processed'; // Return special signature to indicate success
    }

    throw error;
  }
};

// Remove liquidity - with automatic SOL unwrapping
export const removeLiquidity = async (
  connection: Connection,
  wallet: any,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  lpAmount: number,
  minAmount0: number,
  minAmount1: number,
  ammConfigOverride?: PublicKey
) => {
  try {
    const program = getProgram(connection, wallet);

    // Check if we need to unwrap SOL
    const needsUnwrapToken0 = isNativeSOL(token0Mint);
    const needsUnwrapToken1 = isNativeSOL(token1Mint);

    console.log('🌊 SOL handling:', { needsUnwrapToken0, needsUnwrapToken1 });

    // Sort tokens
    const { token0, token1 } = sortTokenMints(token0Mint, token1Mint);

    // Get PDAs (use pool's AMM config if provided)
    const poolState = getPoolState(token0, token1, ammConfigOverride);
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);

    // Get user token accounts
    const userToken0Account = await getAssociatedTokenAddress(token0, wallet.publicKey);
    const userToken1Account = await getAssociatedTokenAddress(token1, wallet.publicKey);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, wallet.publicKey);

    // Check if LP mint exists (detect broken pools)
    const lpMintInfo = await connection.getAccountInfo(lpMint);
    if (!lpMintInfo) {
      console.error('❌ LP Mint does not exist! This is a BROKEN/DUST POOL!', {
        lpMint: lpMint.toString(),
        poolState: poolState.toString(),
      });
      throw new Error(
        `🚫 BROKEN POOL DETECTED\n\n` +
        `This pool's LP Mint doesn't exist. Cannot remove liquidity.\n\n` +
        `This pool is permanently broken and cannot be used.\n` +
        `Contact the DEX admin for assistance.\n\n` +
        `LP Mint (Missing): ${lpMint.toString().slice(0, 12)}...`
      );
    }

    // Get pool data
    const poolData = await (program.account as any).poolState.fetch(poolState);
    const token0Decimals = (poolData as any).mint0Decimals;
    const token1Decimals = (poolData as any).mint1Decimals;
    const totalLpSupply = Number((poolData as any).lpSupply.toString()) / Math.pow(10, 9);

    // ANTI-DUST POOL PROTECTION
    // Always keep a minimum of 0.001 LP tokens (1,000,000 base units) in the pool
    // This prevents the pool from becoming unusable "dust pool"
    const MINIMUM_LP_LOCKED = 0.001; // Minimum LP tokens to keep in pool
    const actualLpAmount = lpAmount;
    let adjustedLpAmount = lpAmount;

    // Check if user is trying to remove all or almost all liquidity
    const wouldBeRemainingLp = totalLpSupply - lpAmount;

    if (wouldBeRemainingLp < MINIMUM_LP_LOCKED) {
      // User is trying to drain the pool - silently reduce withdrawal amount
      const maxWithdrawable = totalLpSupply - MINIMUM_LP_LOCKED;

      if (maxWithdrawable <= 0) {
        throw new Error('Cannot remove liquidity: Pool must maintain minimum liquidity');
      }

      adjustedLpAmount = maxWithdrawable;
      console.log('🛡️ ANTI-DUST PROTECTION ACTIVATED:');
      console.log(`   Requested: ${actualLpAmount.toFixed(9)} LP`);
      console.log(`   Adjusted to: ${adjustedLpAmount.toFixed(9)} LP`);
      console.log(`   Keeping locked: ${MINIMUM_LP_LOCKED.toFixed(9)} LP`);
      console.log(`   Remaining in pool: ${(totalLpSupply - adjustedLpAmount).toFixed(9)} LP`);

      // Adjust minimum amounts proportionally
      const adjustmentRatio = adjustedLpAmount / actualLpAmount;
      minAmount0 = minAmount0 * adjustmentRatio;
      minAmount1 = minAmount1 * adjustmentRatio;
    }

    // Use Math.floor and toFixed(0) to avoid BN assertion errors and scientific notation
    const lpAmountScaled = Math.floor(adjustedLpAmount * Math.pow(10, 9));
    const minAmount0Scaled = Math.floor(minAmount0 * Math.pow(10, token0Decimals));
    const minAmount1Scaled = Math.floor(minAmount1 * Math.pow(10, token1Decimals));
    // Use toFixed(0) to prevent scientific notation for large numbers
    const lpAmountBN = new BN(lpAmountScaled.toFixed(0));
    const minAmount0BN = new BN(minAmount0Scaled.toFixed(0));
    const minAmount1BN = new BN(minAmount1Scaled.toFixed(0));

    console.log('🔥 Removing liquidity:', {
      lpAmount,
      lpAmountBN: lpAmountBN.toString(),
      minAmount0,
      minAmount1,
      minAmount0BN: minAmount0BN.toString(),
      minAmount1BN: minAmount1BN.toString(),
    });

    // Build transaction - set fee payer FIRST to ensure it's included
    const transaction = new Transaction();
    transaction.feePayer = wallet.publicKey;

    // Step 0: Create token accounts if they don't exist
    const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');

    const token0AccountInfo = await connection.getAccountInfo(userToken0Account);
    if (!token0AccountInfo) {
      console.log('🔧 Creating token account for token0...');
      const createToken0AccountIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        userToken0Account,
        wallet.publicKey,
        token0
      );
      transaction.add(createToken0AccountIx);
    }

    const token1AccountInfo = await connection.getAccountInfo(userToken1Account);
    if (!token1AccountInfo) {
      console.log('🔧 Creating token account for token1...');
      const createToken1AccountIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        userToken1Account,
        wallet.publicKey,
        token1
      );
      transaction.add(createToken1AccountIx);
    }

    // Step 1: Build the withdraw instruction
    console.log('💰 Building withdraw instruction...');
    const withdrawInstruction = await program.methods
      .withdraw(lpAmountBN, minAmount0BN, minAmount1BN)
      .accounts({
        owner: wallet.publicKey,
        authority,
        poolState,
        ownerLpToken: userLpAccount,
        token0Account: userToken0Account,
        token1Account: userToken1Account,
        token0Vault,
        token1Vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        vault0Mint: token0,
        vault1Mint: token1,
        lpMint,
        memoProgram: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      })
      .instruction();

    transaction.add(withdrawInstruction);

    // Step 2: Add unwrap instructions if needed
    if (needsUnwrapToken0) {
      console.log('🌊 Adding unwrap SOL instruction for token0...');
      const unwrapInstruction = await createUnwrapSOLInstruction(wallet.publicKey);
      transaction.add(unwrapInstruction);
    }

    if (needsUnwrapToken1) {
      console.log('🌊 Adding unwrap SOL instruction for token1...');
      const unwrapInstruction = await createUnwrapSOLInstruction(wallet.publicKey);
      transaction.add(unwrapInstruction);
    }

    // Get FRESH blockhash to avoid "already processed" error
    console.log('🔄 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);

    // Sign transaction immediately
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);

    // Send transaction with proper options
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 5, // Retry if blockhash expires
    });

    console.log(`🔗 Transaction sent: ${signature}`);

    // Confirm transaction
    console.log('⏳ Confirming transaction...');
    const confirmation = await confirmTransactionWithBlockhash(connection, {
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'processed');

    if (confirmation.value && confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Liquidity removed successfully!');
    return signature;
  } catch (error: any) {
    console.error('❌ Error removing liquidity:', error);

    // Check if it's an "already processed" error (actually means success!)
    if (error.message && (error.message.includes('already been processed') || error.message.includes('already processed'))) {
      console.log('✅ Transaction succeeded! (Got "already processed" confirmation)');
      console.log('💡 The "already processed" message confirms the transaction completed.');
      // Return a success indicator - caller should check transaction on-chain
      return 'SUCCESS_ALREADY_PROCESSED';
    }

    throw error;
  }
};

// Create new pool
export const createPool = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  initAmount0: number,
  initAmount1: number,
  ammConfigAddress?: PublicKey // Optional: defaults to standard 1% fee config
) => {
  try {
    const program = getProgram(connection, wallet);

    // Use provided AMM config or default
    let selectedAmmConfig = ammConfigAddress || AMM_CONFIG;
    console.log('🎯 Creating pool with AMM config:', selectedAmmConfig.toBase58());

    // CRITICAL: Check if AMM config exists on-chain
    console.log('🔍 Checking if AMM config exists on-chain...');
    const ammConfigInfo = await connection.getAccountInfo(selectedAmmConfig);
    if (!ammConfigInfo) {
      // Try fallback to index 0 (commonly pre-initialized at 1%)
      const fallbackAmmConfig = FEE_TIERS[0]?.address;
      if (fallbackAmmConfig) {
        const fbInfo = await connection.getAccountInfo(fallbackAmmConfig);
        if (fbInfo) {
          console.warn('⚠️ Selected AMM config missing. Falling back to default tier (likely 1%).', {
            requested: ammConfigAddress?.toBase58(),
            fallback: fallbackAmmConfig.toBase58(),
          });
          selectedAmmConfig = fallbackAmmConfig;
        } else {
          throw new Error(
            `❌ AMM Config not initialized!\n\n` +
            `Missing both selected fee tier and default tier.\n` +
            `Requested: ${ammConfigAddress?.toBase58() || 'none'}\n` +
            `Default: ${fallbackAmmConfig.toBase58()}\n\n` +
            `Create the AMM config account on-chain (e.g., index 1 for 0.30%).`
          );
        }
      } else {
        throw new Error('❌ No AMM fee tiers configured in frontend.');
      }
    }
    console.log('✅ AMM config exists on-chain');

    // Validate user has sufficient balances BEFORE attempting to create pool
    console.log('💰 Checking token balances...');
    const balance0 = await getTokenBalance(connection, token0Mint, walletPublicKey);
    const balance1 = await getTokenBalance(connection, token1Mint, walletPublicKey);

    const token0Symbol = getTokenSymbol(token0Mint);
    const token1Symbol = getTokenSymbol(token1Mint);

    if (balance0 < initAmount0) {
      throw new Error(`Insufficient ${token0Symbol} balance. You have ${balance0.toFixed(6)}, but need ${initAmount0} to create the pool.`);
    }
    if (balance1 < initAmount1) {
      throw new Error(`Insufficient ${token1Symbol} balance. You have ${balance1.toFixed(6)}, but need ${initAmount1} to create the pool.`);
    }

    console.log('✅ Balance check passed:', {
      [token0Symbol]: `${balance0} (need ${initAmount0})`,
      [token1Symbol]: `${balance1} (need ${initAmount1})`
    });

    // Get decimals BEFORE sorting
    const token0MintInfo = await connection.getParsedAccountInfo(token0Mint);
    const token1MintInfo = await connection.getParsedAccountInfo(token1Mint);
    const token0MintDecimals = (token0MintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
    const token1MintDecimals = (token1MintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

    console.log('📋 Before sorting:', {
      token0Mint: token0Mint.toString(),
      token1Mint: token1Mint.toString(),
      amount0: initAmount0,
      amount1: initAmount1,
      decimals0: token0MintDecimals,
      decimals1: token1MintDecimals,
    });

    // Sort tokens and check if they were swapped
    const { token0, token1 } = sortTokenMints(token0Mint, token1Mint);
    const tokensWereSwapped = !token0Mint.equals(token0);

    // Verify sorting with manual check
    const bufferComparison = Buffer.compare(token0.toBuffer(), token1.toBuffer());
    console.log('🔍 Token sort verification:', {
      token0: token0.toString(),
      token1: token1.toString(),
      bufferComparison,
      isSortedCorrectly: bufferComparison < 0,
      tokensWereSwapped,
    });

    if (bufferComparison >= 0) {
      throw new Error('CRITICAL: Tokens are not sorted correctly! token0 must be < token1');
    }

    // If tokens were swapped, swap the amounts too!
    let finalAmount0 = initAmount0;
    let finalAmount1 = initAmount1;
    let finalDecimals0 = token0MintDecimals;
    let finalDecimals1 = token1MintDecimals;

    if (tokensWereSwapped) {
      finalAmount0 = initAmount1;
      finalAmount1 = initAmount0;
      finalDecimals0 = token1MintDecimals;
      finalDecimals1 = token0MintDecimals;
      console.log('⚠️ Tokens were swapped! Swapping amounts too.');
    }

    // Use PDA for pool state (as per IDL: seeds = [POOL_SEED, amm_config, token_0_mint, token_1_mint])
    const poolState = getPoolState(token0, token1, selectedAmmConfig);

    console.log('🔑 Using PDA for Pool State:', poolState.toString());
    console.log('🔑 Using AMM Config:', selectedAmmConfig.toString());

    // Check if pool already exists
    try {
      const poolStateInfo = await connection.getAccountInfo(poolState);
      if (poolStateInfo) {
        const token0Symbol = getTokenSymbol(token0);
        const token1Symbol = getTokenSymbol(token1);
        throw new Error(`Pool ${token0Symbol}/${token1Symbol} already exists! Please check the Pools page to add liquidity to the existing pool instead.`);
      }
    } catch (checkError: any) {
      // If it's our custom error, re-throw it
      if (checkError.message && checkError.message.includes('already exists')) {
        throw checkError;
      }
      // Otherwise, continue (account doesn't exist, which is what we want)
      console.log('✅ Pool state does not exist - ready to create new pool');
    }

    // Get PDAs derived from pool state
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);
    const observationState = getObservationState(poolState);

    // Derive LP metadata account (PDA from Metaplex Token Metadata program)
    // Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, lp_mint]
    // REQUIRED: Metadata account must be provided for automatic metadata creation
    const [lpMetadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        lpMint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log('📝 LP Metadata Account:', lpMetadataAccount.toString());

    // Fetch the fee receiver from AMM config (dynamically, not hardcoded!)
    console.log('🔍 Fetching fee receiver from AMM config...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ammConfigData = await (program.account as any).ammConfig.fetch(selectedAmmConfig);
    // Try new unified fee_receiver field first, fallback to old fields
    const feeReceiverPubkey = ammConfigData.feeReceiver || ammConfigData.fundOwner || ammConfigData.createPoolFeeReceiver;
    if (!feeReceiverPubkey) {
      throw new Error('Could not find fee receiver in AMM config');
    }
    const createPoolFee = feeReceiverPubkey;
    console.log('✅ Fee receiver from config:', createPoolFee.toString());

    // Determine the correct token programs FIRST (before getting ATAs)
    const token0Info = await connection.getAccountInfo(token0);
    const token1Info = await connection.getAccountInfo(token1);
    const token0Program = token0Info?.owner || TOKEN_PROGRAM_ID;
    const token1Program = token1Info?.owner || TOKEN_PROGRAM_ID;

    console.log('🔍 Token programs detected:', {
      token0Program: token0Program.toString(),
      token1Program: token1Program.toString(),
    });

    // Get user token accounts with correct token programs
    const userToken0Account = await getAssociatedTokenAddress(token0, walletPublicKey, false, token0Program);
    const userToken1Account = await getAssociatedTokenAddress(token1, walletPublicKey, false, token1Program);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, walletPublicKey);

    // Convert amounts to BN with correct decimals
    // Use string-based construction to avoid floating point precision errors
    const amount0Scaled = Math.floor(finalAmount0 * Math.pow(10, finalDecimals0));
    const amount1Scaled = Math.floor(finalAmount1 * Math.pow(10, finalDecimals1));

    console.log('💰 Scaled amounts:', {
      finalAmount0,
      finalDecimals0,
      amount0Scaled,
      finalAmount1,
      finalDecimals1,
      amount1Scaled,
    });

    // Convert to BN using toFixed(0) to prevent scientific notation for large numbers
    const initAmount0BN = new BN(amount0Scaled.toFixed(0));
    const initAmount1BN = new BN(amount1Scaled.toFixed(0));
    const openTime = new BN(Math.floor(Date.now() / 1000)); // Open immediately

    // LP token metadata - pass explicit default values to avoid null serialization issues
    // Using Kedolik LP standard metadata defaults
    const lpTokenName = "Kedolik LP";
    const lpTokenSymbol = "KLP";
    const lpTokenUri = "https://raw.githubusercontent.com/KedolikSwap/metadata/refs/heads/main/klp.json";
    
    console.log('📝 LP Token Metadata:', {
      name: lpTokenName,
      symbol: lpTokenSymbol,
      uri: lpTokenUri,
    });

    // Check if we need to handle native SOL
    const needsWrapToken0 = isNativeSOL(token0);
    const needsWrapToken1 = isNativeSOL(token1);

    console.log('🌊 SOL handling for pool creation:', { needsWrapToken0, needsWrapToken1 });

    // Check if user token accounts exist (IMPORTANT for pool creation)
    console.log('🔍 Checking if token accounts exist...');
    const token0AccountInfo = await connection.getAccountInfo(userToken0Account);
    const token1AccountInfo = await connection.getAccountInfo(userToken1Account);

    const needsCreateToken0Account = !token0AccountInfo && !needsWrapToken0; // SOL wrapping creates account
    const needsCreateToken1Account = !token1AccountInfo && !needsWrapToken1; // SOL wrapping creates account

    console.log('🔑 Account status:', {
      token0Account: userToken0Account.toString(),
      token0Exists: !!token0AccountInfo,
      needsCreateToken0Account,
      token1Account: userToken1Account.toString(),
      token1Exists: !!token1AccountInfo,
      needsCreateToken1Account,
    });

    console.log('🔧 Creating pool with params:', {
      originalToken0: token0Mint.toString(),
      originalToken1: token1Mint.toString(),
      originalAmount0: initAmount0,
      originalAmount1: initAmount1,
      '---AFTER SORTING---': '⬇️',
      sortedToken0: token0.toString(),
      sortedToken1: token1.toString(),
      sortedAmount0: finalAmount0,
      sortedAmount1: finalAmount1,
      amount0BN: initAmount0BN.toString(),
      amount1BN: initAmount1BN.toString(),
      poolStatePDA: poolState.toString(),
      creator: walletPublicKey.toString(),
      tokensWereSwapped,
    });

    // Build transaction - set fee payer FIRST to ensure it's included
    const transaction = new Transaction();
    transaction.feePayer = walletPublicKey;

    // Step 1: Create token accounts if they don't exist (CRITICAL!)
    if (needsCreateToken0Account) {
      console.log('🔧 Creating token0 account with program:', token0Program.toString());
      const createToken0AccountIx = createAssociatedTokenAccountInstruction(
        walletPublicKey, // payer
        userToken0Account, // ata
        walletPublicKey, // owner
        token0, // mint
        token0Program // token program
      );
      transaction.add(createToken0AccountIx);
    }

    if (needsCreateToken1Account) {
      console.log('🔧 Creating token1 account with program:', token1Program.toString());
      const createToken1AccountIx = createAssociatedTokenAccountInstruction(
        walletPublicKey, // payer
        userToken1Account, // ata
        walletPublicKey, // owner
        token1, // mint
        token1Program // token program
      );
      transaction.add(createToken1AccountIx);
    }

    // Step 2: Wrap SOL if needed (AFTER creating accounts, BEFORE initialize instruction)
    // ONLY wrap if actually needed!
    if (needsWrapToken0) {
      console.log('🌊 Wrapping SOL for token0...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount0
      );
      transaction.add(...wrapInstructions);
      console.log(`✅ Added ${wrapInstructions.length} wrap instructions for token0`);
    }

    if (needsWrapToken1) {
      console.log('🌊 Wrapping SOL for token1...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount1
      );
      transaction.add(...wrapInstructions);
      console.log(`✅ Added ${wrapInstructions.length} wrap instructions for token1`);
    }

    console.log(`📝 Total instructions before initialize: ${transaction.instructions.length}`);

    // Step 3: Build the initialize pool instruction (token programs already detected above)
    console.log('🏗️ Building initialize pool instruction...');
    console.log('📋 Account details:', {
      creator: walletPublicKey.toString(),
      ammConfig: selectedAmmConfig.toString(),
      authority: authority.toString(),
      poolState: poolState.toString(),
      token0Mint: token0.toString(),
      token1Mint: token1.toString(),
      lpMint: lpMint.toString(),
      lpMetadataAccount: lpMetadataAccount.toString(),
      creatorToken0: userToken0Account.toString(),
      creatorToken1: userToken1Account.toString(),
      creatorLpToken: userLpAccount.toString(),
      token0Vault: token0Vault.toString(),
      token1Vault: token1Vault.toString(),
      createPoolFee: createPoolFee.toString(),
      observationState: observationState.toString(),
      token0Program: token0Program.toString(),
      token1Program: token1Program.toString(),
    });

    let initializeInstruction;
    try {
      // Build the instruction with all accounts including metadata accounts
      // REQUIRED: lpMetadataAccount and tokenMetadataProgram must be in .accounts()
      // Pool creation will fail if these are missing
      
      // DEBUG: Verify IDL has metadata accounts
      const idlInstruction = (IDL as any).instructions?.find((ix: any) => ix.name === 'initialize');
      if (idlInstruction) {
        // Note: IDL uses 'metadata_account' (snake_case), Anchor converts to 'metadataAccount' (camelCase) in .accounts()
        const hasMetadataAccountInIdl = idlInstruction.accounts?.some((acc: any) => acc.name === 'metadata_account');
        const hasTokenMetadataProgramInIdl = idlInstruction.accounts?.some((acc: any) => acc.name === 'token_metadata_program');
        console.log('🔍 DEBUG: IDL account verification:', {
          hasMetadataAccountInIdl,
          hasTokenMetadataProgramInIdl,
          totalAccountsInIdl: idlInstruction.accounts?.length || 0,
          accountNames: idlInstruction.accounts?.map((acc: any) => acc.name),
        });
        
        if (!hasMetadataAccountInIdl || !hasTokenMetadataProgramInIdl) {
          console.error('❌ CRITICAL: IDL is missing metadata accounts!');
          console.error('IDL accounts:', idlInstruction.accounts?.map((acc: any) => acc.name));
          throw new Error('IDL does not include required metadata accounts. Please update the IDL file.');
        }
      }
      
      // Build initialize instruction with metadata parameters
      // Check if IDL has the new metadata parameters
      const idlArgs = idlInstruction?.args || [];
      const hasMetadataParams = idlArgs.some((arg: any) => 
        arg.name === 'lp_token_name' || arg.name === 'lp_token_symbol' || arg.name === 'lp_token_uri'
      );
      
      let initializeMethod;
      if (hasMetadataParams) {
        console.log('✅ IDL includes metadata parameters - passing them to initialize');
        initializeMethod = program.methods.initialize(
          initAmount0BN, 
          initAmount1BN, 
          openTime,
          lpTokenName,    // lp_token_name: Option<String>
          lpTokenSymbol,  // lp_token_symbol: Option<String>
          lpTokenUri      // lp_token_uri: Option<String>
        );
      } else {
        console.warn('⚠️ IDL does not include metadata parameters yet - calling initialize without them');
        console.warn('⚠️ Metadata will not be created automatically. Update the IDL after program rebuild.');
        initializeMethod = program.methods.initialize(
          initAmount0BN, 
          initAmount1BN, 
          openTime
        );
      }
      
      try {
        initializeInstruction = await initializeMethod
          .accounts({
            creator: walletPublicKey,
            ammConfig: selectedAmmConfig,
            authority,
            poolState: poolState,
            token0Mint: token0,
            token1Mint: token1,
            lpMint,
            creatorToken0: userToken0Account,
            creatorToken1: userToken1Account,
            creatorLpToken: userLpAccount,
            token0Vault,
            token1Vault,
            createPoolFee,
            observationState,
            tokenProgram: TOKEN_PROGRAM_ID,
            token0Program,
            token1Program,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
            // REQUIRED: Metadata accounts for automatic LP token metadata creation
            // Note: IDL uses 'metadata_account' (snake_case), Anchor converts to 'metadataAccount' (camelCase)
            metadataAccount: lpMetadataAccount,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          })
          .instruction();
        console.log('✅ Initialize instruction built successfully');
        
        // Check instruction size
        const instructionSize = initializeInstruction.data.length;
        console.log('📏 Instruction data size:', instructionSize, 'bytes');
        if (instructionSize > 1232) {
          console.warn('⚠️ WARNING: Instruction data is very large:', instructionSize, 'bytes');
        }
      } catch (instructionError: any) {
        console.error('❌ Error building initialize instruction:', instructionError);
        console.error('Error details:', {
          message: instructionError?.message,
          name: instructionError?.name,
          stack: instructionError?.stack,
        });
        throw new Error(`Failed to build initialize instruction: ${instructionError?.message || 'Unknown error'}`);
      }
      
      // DEBUG: Log the actual accounts being passed
      console.log('🔍 DEBUG: Metadata accounts being passed:', {
        lpMetadataAccount: lpMetadataAccount.toString(),
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID.toString(),
        lpMint: lpMint.toString(),
      });
      
      // DEBUG: Inspect the instruction keys to verify accounts are included
      console.log('🔍 DEBUG: Instruction account keys:', {
        totalAccounts: initializeInstruction.keys.length,
        accountKeys: initializeInstruction.keys.map((key, idx) => ({
          index: idx,
          pubkey: key.pubkey.toString(),
          isWritable: key.isWritable,
          isSigner: key.isSigner,
        })),
      });
      
      // Check if metadata accounts are in the instruction
      const hasMetadataAccount = initializeInstruction.keys.some(
        key => key.pubkey.equals(lpMetadataAccount)
      );
      const hasTokenMetadataProgram = initializeInstruction.keys.some(
        key => key.pubkey.equals(TOKEN_METADATA_PROGRAM_ID)
      );
      
      console.log('🔍 DEBUG: Metadata accounts verification:', {
        hasMetadataAccount,
        hasTokenMetadataProgram,
        metadataAccountIndex: initializeInstruction.keys.findIndex(
          key => key.pubkey.equals(lpMetadataAccount)
        ),
        tokenMetadataProgramIndex: initializeInstruction.keys.findIndex(
          key => key.pubkey.equals(TOKEN_METADATA_PROGRAM_ID)
        ),
      });
      
      if (!hasMetadataAccount || !hasTokenMetadataProgram) {
        console.error('❌ CRITICAL: Metadata accounts are MISSING from instruction!');
        console.error('This means Anchor is not recognizing the accounts in the IDL.');
        throw new Error('Metadata accounts are missing from instruction - check IDL account names');
      }
    } catch (instructionError: any) {
      console.error('❌ Error building initialize instruction:', instructionError);
      console.error('Error details:', {
        message: instructionError.message,
        stack: instructionError.stack,
        code: instructionError.code,
        name: instructionError.name,
      });
      throw new Error(`Failed to build initialize instruction: ${instructionError.message}`);
    }

    transaction.add(initializeInstruction);

    // Check if using Jito endpoint and add tip instruction if needed
    // CRITICAL: Tip instruction must be LAST in the transaction
    // According to Jito docs: Tip instruction must be in the last transaction
    // For single transactions, it must be the last instruction
    // Always add Jito tip instruction defensively.
    // Many RPCs route through Jito even if URL doesn't show it.
    try {
      let rpcUrl = '';
      try {
        rpcUrl = ADDRESSES.getRpcEndpoint();
      } catch {
        try {
          rpcUrl =
            (connection as any)._rpcEndpoint ||
            (connection as any).rpcEndpoint ||
            (connection as any)._rpc?.endpoint ||
            '';
        } catch {
          if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RPC_ENDPOINT) {
            rpcUrl = import.meta.env.VITE_RPC_ENDPOINT;
          }
        }
      }

      console.log('🔍 Checking RPC endpoint type...', {
        rpcUrl: rpcUrl ? `${rpcUrl.substring(0, 50)}...` : 'not detected',
      });
    } catch (error) {
      console.warn('⚠️ Error checking RPC endpoint');
    }

    // Get latest blockhash BEFORE adding tip (tip must be added after blockhash)
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    // Conditionally add Jito tip instruction based on global flag
    if (ENABLE_JITO_TIP) {
      // Add Jito tip instruction as LAST instruction - required for Jito-enabled RPCs
      // CRITICAL: Must be added AFTER blockhash is set
      console.log('💰 Adding Jito tip instruction (ENABLE_JITO_TIP = true)...');
      addJitoTipInstruction(transaction, walletPublicKey, 10_000); // 0.00001 SOL
    } else {
      console.log('ℹ️ Skipping Jito tip instruction (ENABLE_JITO_TIP = false)');
    }

    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);

    // Check transaction serialization before signing
    console.log('🔍 Verifying transaction serialization...');
    try {
      const serialized = transaction.serialize({ 
        requireAllSignatures: false, 
        verifySignatures: false 
      });
      console.log('✅ Transaction serializes successfully, size:', serialized.length, 'bytes');
      
      // Try to deserialize and check structure
      const deserialized = Transaction.from(serialized);
      console.log('✅ Transaction deserializes successfully');
      console.log('   Instructions:', deserialized.instructions.length);
      console.log('   Fee payer:', deserialized.feePayer?.toString());
    } catch (serializeError: any) {
      console.error('❌ Transaction serialization failed:', serializeError);
      throw new Error(`Transaction serialization failed: ${serializeError?.message || 'Unknown error'}`);
    }

    // Simulate transaction before signing to catch program errors early
    console.log('🔍 Simulating transaction before signing...');
    try {
      // Create a copy for simulation
      const simTx = Transaction.from(transaction.serialize({ 
        requireAllSignatures: false, 
        verifySignatures: false 
      }));
      simTx.recentBlockhash = blockhash;
      simTx.feePayer = walletPublicKey;
      
      const simulation = await connection.simulateTransaction(simTx);
      
      if (simulation.value.err) {
        console.error('❌ Simulation failed:', simulation.value.err);
        console.error('📊 Simulation logs:', simulation.value.logs);
        
        // Try to decode custom error code
        const error = simulation.value.err;
        if (error && typeof error === 'object' && 'InstructionError' in error) {
          const instructionError = (error as any).InstructionError;
          if (Array.isArray(instructionError) && instructionError.length >= 2) {
            const [instructionIndex, errorDetails] = instructionError;
            if (errorDetails && typeof errorDetails === 'object' && 'Custom' in errorDetails) {
              const customErrorCode = errorDetails.Custom;
              console.error('🔍 Custom Error Code:', customErrorCode);
              console.error('📋 Instruction Index:', instructionIndex);
              
              // Common error codes (you may need to check your program's error codes)
              const errorCodeMap: { [key: number]: string } = {
                0: 'InsufficientFunds',
                1: 'InvalidAccount',
                2: 'InvalidMint',
                3: 'InvalidOwner',
                4: 'InvalidAmount',
                5: 'InvalidPool',
                6: 'InvalidConfig',
                7: 'InvalidAuthority',
                8: 'InvalidTokenAccount',
                9: 'InvalidVault',
                10: 'InvalidLpMint',
                11: 'InvalidObservation',
                12: 'InvalidFeeReceiver',
                13: 'InvalidTime',
                14: 'InvalidAmounts',
                15: 'InvalidSlippage',
                16: 'PoolAlreadyExists',
                17: 'PoolNotFound',
                18: 'InsufficientLiquidity',
                19: 'InvalidSwap',
                20: 'InvalidRoute',
                50: 'InvalidMetadataAccount',
                51: 'InvalidMetadataProgram',
                52: 'MetadataCreationFailed',
                53: 'InvalidMetadataParams',
                54: 'MetadataAccountAlreadyExists', // Likely this one
                55: 'InvalidMetadataUpdateAuthority',
              };
              
              const errorName = errorCodeMap[customErrorCode] || `UnknownError(${customErrorCode})`;
              console.error('🔍 Decoded Error:', errorName);
              
              // If it's error 54 (likely metadata account already exists), provide helpful message
              if (customErrorCode === 54) {
                console.error('⚠️ Error 54: Metadata account may already exist for this LP mint.');
                console.error('💡 This could mean:');
                console.error('   1. The pool was partially created before');
                console.error('   2. Metadata account already exists on-chain');
                console.error('   3. Need to check if pool state already exists');
              }
            }
          }
        }
        
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      console.log('✅ Simulation successful:', {
        unitsConsumed: simulation.value.unitsConsumed,
        logs: simulation.value.logs?.slice(0, 5),
      });
    } catch (simError: any) {
      console.error('❌ Simulation error:', simError);
      // Don't throw - continue to try signing anyway, but log the error
      console.warn('⚠️ Continuing despite simulation error...');
    }

    // Sign with user's wallet
    console.log('✍️ Signing transaction...');
    console.log('📊 Transaction details:', {
      numInstructions: transaction.instructions.length,
      feePayer: transaction.feePayer?.toString(),
      recentBlockhash: transaction.recentBlockhash?.slice(0, 8) + '...',
    });
    
    // Additional debugging: Check instruction data size
    if (transaction.instructions.length > 0) {
      const firstInstruction = transaction.instructions[0];
      console.log('📏 First instruction details:', {
        programId: firstInstruction.programId.toString(),
        keys: firstInstruction.keys.length,
        dataLength: firstInstruction.data.length,
        dataSize: `${firstInstruction.data.length} bytes`,
      });
      
      // Check if instruction data is too large (max is 1232 bytes for account data, but instruction data can be larger)
      if (firstInstruction.data.length > 1000) {
        console.warn('⚠️ WARNING: Instruction data is very large:', firstInstruction.data.length, 'bytes');
      }
    }
    
    // Try to serialize the transaction one more time before signing to ensure it's valid
    try {
      const preSignSerialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      console.log('✅ Transaction serializes correctly before signing, size:', preSignSerialized.length, 'bytes');
    } catch (preSignError: any) {
      console.error('❌ Transaction serialization failed before signing:', preSignError);
      throw new Error(`Transaction is invalid: ${preSignError?.message || 'Serialization failed'}`);
    }
    
    let signedTx;
    try {
      // Some wallet adapters need the transaction to be a fresh copy
      // Create a new transaction instance to avoid any potential issues
      const transactionForSigning = Transaction.from(transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }));
      transactionForSigning.recentBlockhash = transaction.recentBlockhash!;
      transactionForSigning.feePayer = transaction.feePayer!;
      
      console.log('🔐 Attempting to sign transaction with wallet...');
      signedTx = await wallet.signTransaction(transactionForSigning);
      console.log('✅ Transaction signed successfully');
    } catch (signError: any) {
      console.error('❌ Wallet signing error details:', {
        error: signError,
        message: signError?.message,
        name: signError?.name,
        stack: signError?.stack,
        // Check if it's a specific wallet error
        code: signError?.code,
        cause: signError?.cause,
        // Try to get inner error
        innerError: (signError as any)?.error,
        originalError: (signError as any)?.originalError,
      });
      
      // Try to get more details from the error
      if (signError?.message) {
        const errorMsg = signError.message.toLowerCase();
        if (errorMsg.includes('user rejected') || errorMsg.includes('user declined')) {
          throw new Error('Transaction was rejected by user');
        } else if (errorMsg.includes('insufficient')) {
          throw new Error('Insufficient balance for transaction fees');
        } else if (errorMsg.includes('unexpected error')) {
          // Try to get more details from the wallet adapter
          console.error('⚠️ Generic "Unexpected error" from wallet adapter');
          console.error('💡 This might be due to:');
          console.error('   1. Transaction size too large');
          console.error('   2. Wallet adapter issue');
          console.error('   3. Network connectivity issue');
          console.error('   4. Wallet not properly connected');
          
          // Check wallet connection
          if (wallet && typeof wallet.publicKey === 'function') {
            try {
              const pubkey = wallet.publicKey;
              console.log('🔍 Wallet public key:', pubkey?.toString());
            } catch (e) {
              console.error('❌ Cannot get wallet public key:', e);
            }
          }
        }
      }
      
      throw signError;
    }

    // Send transaction with proper error handling
    let signature: string;

    try {
      // Debug: Log transaction details before sending
      console.log('📋 Transaction details:', {
        instructions: transaction.instructions.length,
        feePayer: transaction.feePayer?.toString(),
        recentBlockhash: transaction.recentBlockhash ? 'set' : 'missing',
      });

      // Verify tip instruction is present and last
      const lastInstruction = transaction.instructions[transaction.instructions.length - 1];
      const tipAccountInLast = lastInstruction?.keys?.find(key => 
        JITO_TIP_ACCOUNTS.includes(key.pubkey.toString())
      );
      const hasTipInstruction = tipAccountInLast && tipAccountInLast.isWritable;
      
      console.log('🔍 Tip instruction verification:', {
        totalInstructions: transaction.instructions.length,
        lastInstructionProgram: lastInstruction?.programId?.toString(),
        hasTipInstruction,
        tipAccount: tipAccountInLast?.pubkey?.toString(),
        tipAccountWritable: tipAccountInLast?.isWritable,
        allInstructionPrograms: transaction.instructions.map(ix => ix.programId.toString())
      });
      
      if (!hasTipInstruction) {
        console.error('❌ WARNING: Tip instruction not found or tip account not writable!');
        console.error('This may cause the transaction to fail with "tip account" error.');
      }

      // Simulate first to get better error messages
      console.log('🔍 Simulating transaction...');
      try {
        // Create a copy of the transaction for simulation
        const simTx = Transaction.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
        simTx.recentBlockhash = blockhash;
        simTx.feePayer = walletPublicKey;

        const simulation = await connection.simulateTransaction(simTx);

        if (simulation.value.err) {
          console.error('❌ Simulation failed:', simulation.value.err);
          console.error('📊 Simulation logs:', simulation.value.logs);
          console.error('📊 Full simulation result:', JSON.stringify(simulation.value, null, 2));
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }

        console.log('✅ Simulation successful:', {
          unitsConsumed: simulation.value.unitsConsumed,
          logs: simulation.value.logs?.slice(0, 10), // First 10 logs
        });
        
        // Check if metadata creation log appears in simulation
        const allLogs = simulation.value.logs || [];
        const hasMetadataLog = allLogs.some((log: string) => 
          typeof log === 'string' && (
            log.includes('STARTING MANDATORY LP TOKEN METADATA') ||
            log.includes('METADATA ACCOUNT CREATED') ||
            log.includes('Creating metadata')
          )
        );
        
        if (hasMetadataLog) {
          console.log('✅ Metadata creation log found in simulation!');
        } else {
          console.warn('⚠️ WARNING: Metadata creation log NOT found in simulation logs.');
          console.warn('This suggests the program may not be processing metadata accounts.');
          console.warn('Full simulation logs:', allLogs);
        }
      } catch (simError: any) {
        console.error('❌ Simulation error:', simError);
        console.error('Error type:', simError.constructor?.name);
        console.error('Error message:', simError.message);
        console.error('Error stack:', simError.stack);

        // If simulation fails, try to get more details
        if (simError.logs) {
          console.error('📊 Simulation logs:', simError.logs);
        }
        if (simError.value?.err) {
          console.error('📊 Simulation error value:', simError.value.err);
          console.error('📊 Simulation error logs:', simError.value.logs);
        }

        // Don't throw here - continue to try sending anyway
        console.warn('⚠️ Simulation failed, but continuing to send transaction...');
      }

      console.log('📤 Sending transaction...');
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'processed',
        maxRetries: 5,
      });

      console.log(`🔗 Transaction sent: ${signature}`);
    } catch (sendError: any) {
      console.error('❌ Error sending transaction:', sendError);

      // Try to get logs from the error if available
      if (sendError.logs) {
        console.error('📊 Transaction logs:', sendError.logs);
      }

      // Check if it's "already processed" error - transaction might have succeeded!
      if (sendError.message && sendError.message.includes('already been processed')) {
        console.log('⚠️ Transaction might have already succeeded!');
        console.log('⏳ Waiting 3 seconds before checking pool state...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if pool was actually created
        try {
          const poolAccountInfo = await connection.getAccountInfo(poolState);
          if (poolAccountInfo) {
            console.log('✅ Pool was created successfully despite error!');
            return {
              tx: 'success (already processed)',
              poolState: poolState
            };
          }
        } catch (checkError) {
          console.error('❌ Pool does not exist - transaction truly failed');
        }
      }

      throw sendError; // Re-throw if not "already processed"
    }

    // Confirm transaction with robust error handling
    console.log('⏳ Confirming transaction...');

    try {
      const confirmation = await confirmTransactionWithBlockhash(connection, {
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed'); // Use 'confirmed' for better reliability

      if (confirmation.value && confirmation.value.err) {
        console.error('❌ Transaction confirmation error:', confirmation.value.err);

        // Even with error, check if pool was created
        console.log('🔍 Checking if pool was actually created...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const poolAccountInfo = await connection.getAccountInfo(poolState);
        if (poolAccountInfo) {
          console.log('✅ Pool exists! Transaction succeeded despite confirmation error.');
          return {
            tx: signature,
            poolState: poolState
          };
        }

        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ Pool created successfully:', signature);
      console.log('📍 Pool State PDA:', poolState.toString());
      const { getExplorerUrl } = await import('../config/addresses');
      console.log('🔗 View on Explorer:', getExplorerUrl(signature));

      // Verify metadata was created
      console.log('🔍 Verifying LP token metadata was created...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for transaction to settle
      
      try {
        const metadataAccountInfo = await connection.getAccountInfo(lpMetadataAccount);
        if (metadataAccountInfo && metadataAccountInfo.data.length > 0) {
          console.log('✅ LP Token Metadata Account EXISTS!', {
            address: lpMetadataAccount.toString(),
            dataLength: metadataAccountInfo.data.length,
            owner: metadataAccountInfo.owner.toString(),
          });
          
          // Try to parse metadata
          try {
            const data = Buffer.from(metadataAccountInfo.data);
            const key = data[0];
            if (key === 4) { // MetadataV1 key
              const nameStart = 1 + 32 + 32 + 4; // key + update_authority + mint + name_length
              const nameLength = data.readUInt32LE(1 + 32 + 32);
              const name = data.slice(nameStart, nameStart + nameLength).toString('utf-8').replace(/\0/g, '');
              
              const symbolStart = nameStart + nameLength + 4;
              const symbolLength = data.readUInt32LE(nameStart + nameLength);
              const symbol = data.slice(symbolStart, symbolStart + symbolLength).toString('utf-8').replace(/\0/g, '');
              
              console.log('✅ Metadata parsed successfully:', { name, symbol });
            }
          } catch (parseError) {
            console.warn('⚠️ Could not parse metadata, but account exists:', parseError);
          }
        } else {
          console.error('❌ LP Token Metadata Account DOES NOT EXIST!', {
            address: lpMetadataAccount.toString(),
            expectedAddress: lpMetadataAccount.toString(),
            lpMint: lpMint.toString(),
          });
          console.error('This means the program did not create metadata during pool initialization.');
        }
      } catch (metadataError) {
        console.error('❌ Error checking metadata account:', metadataError);
      }

      return { tx: signature, poolState: poolState };

    } catch (confirmError: any) {
      console.error('❌ Confirmation error:', confirmError);

      // Final check: did the pool get created anyway?
      console.log('🔍 Final check: verifying pool state...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const poolAccountInfo = await connection.getAccountInfo(poolState);
      if (poolAccountInfo) {
        console.log('✅ Pool exists! Transaction succeeded despite confirmation timeout.');
        return {
          tx: signature,
          poolState: poolState
        };
      }

      throw confirmError; // Re-throw if pool truly doesn't exist
    }
  } catch (error: any) {
    console.error('❌ Error creating pool:', error);

    // Check if pool already exists
    if (error.message && (error.message.includes('already in use') || error.message.includes('custom program error: 0x0'))) {
      const token0Symbol = getTokenSymbol(token0Mint);
      const token1Symbol = getTokenSymbol(token1Mint);
      throw new Error(`Pool ${token0Symbol}/${token1Symbol} already exists! Please check the Pools page to add liquidity to the existing pool instead.`);
    }

    // Check if it's an "already processed" error (often a false negative)
    if (error.message && error.message.includes('already been processed')) {
      console.log('⚠️ Transaction might have already succeeded - check the pools page!');
      throw new Error('Transaction might have already been processed. Please check the Pools page to verify if the pool was created.');
    }

    // Enhanced error message for account initialization errors
    if (error.message && error.message.includes('AccountNotInitialized')) {
      // Check if it's AMM config issue
      if (error.message.includes('amm_config')) {
        throw new Error(
          `❌ AMM Config Not Initialized!\n\n` +
          `The selected fee tier has not been created on-chain yet.\n\n` +
          `🔧 Solution:\n` +
          `Contact the admin to run: scripts/init-amm-configs.ts\n` +
          `Or try a different fee tier that has been initialized.`
        );
      }

      throw new Error('Token account not initialized. Please ensure you have token balances for both tokens.');
    }

    throw error;
  }
};

