import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
} from '@solana/web3.js';
import { 
  Program, 
  AnchorProvider, 
  Idl, 
  BN,
  web3 
} from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import IDLJson from '../../kedolik_cp_swap.json';

// Cast the JSON to Idl type - use 'as unknown as Idl' for proper type assertion
const IDL = IDLJson as unknown as Idl;

// Program and Config
export const PROGRAM_ID = new PublicKey('F3mHkHDh3A61A3mp9dd35DzhypacRRKeEKYDNh4dQqRc');
export const AMM_CONFIG = new PublicKey('3EUgq3MYni6ui7EWnQaDfRXdJTqYPN4GsFFYd1Nb7ab6');
export const AUTHORITY_SEED = Buffer.from('vault_and_lp_mint_auth_seed');

// Token Mints on Devnet
export const TOKENS = {
  KEDOLOG: new PublicKey('DhKDRUdDLeSGM8tQjsCF8vewTffPFZwi3voZunY7RNsW'),
  USDC: new PublicKey('2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32'),
  SOL: new PublicKey('6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv'),
  ETH: new PublicKey('CTHA8taNT2LgyQyj2xVD38nmnxTsCbAJ22Vsee4RvHF3'),
  BTC: new PublicKey('ErGy4n8vBRw2mscMgbZg5rf3SdyDdk11LsaXKG8JJsoa'),
};

// Helper to get program (wallet should be from useAnchorWallet hook)
export const getProgram = (connection: Connection, wallet: any) => {
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  return new Program(IDL, provider);
};

// Get Authority PDA
export const getAuthority = () => {
  const [authority] = PublicKey.findProgramAddressSync(
    [AUTHORITY_SEED],
    PROGRAM_ID
  );
  return authority;
};

// Get Pool State PDA
export const getPoolState = (token0Mint: PublicKey, token1Mint: PublicKey) => {
  const [poolState] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      AMM_CONFIG.toBuffer(),
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
}

// Fetch all pools
export const fetchPools = async (
  connection: Connection,
  wallet: any
): Promise<PoolInfo[]> => {
  try {
    const program = getProgram(connection, wallet);
    
    // Fetch all pool accounts
    const pools = await program.account.poolState.all();
    
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
        token0Symbol: getTokenSymbol(data.token0Mint),
        token1Symbol: getTokenSymbol(data.token1Mint),
        token0Decimals,
        token1Decimals,
      });
    }
    
    return poolInfos;
  } catch (error) {
    console.error('Error fetching pools:', error);
    return [];
  }
};

// Get token symbol from mint
export const getTokenSymbol = (mint: PublicKey): string => {
  const mintStr = mint.toString();
  if (mintStr === TOKENS.KEDOLOG.toString()) return 'KEDOLOG';
  if (mintStr === TOKENS.USDC.toString()) return 'USDC';
  if (mintStr === TOKENS.SOL.toString()) return 'SOL';
  if (mintStr === TOKENS.ETH.toString()) return 'ETH';
  if (mintStr === TOKENS.BTC.toString()) return 'BTC';
  return 'UNKNOWN';
};

// Calculate swap output
export const calculateSwapOutput = (
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  tradeFeeRate: number = 100 // 0.01% = 100 in basis points (10000 = 1%)
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

// Swap tokens (base input)
export const swapBaseInput = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: number,
  minimumAmountOut: number,
  slippage: number = 0.5
) => {
  try {
    const program = getProgram(connection, wallet);
    
    // Sort tokens
    const { token0, token1 } = sortTokenMints(inputMint, outputMint);
    const isInputToken0 = inputMint.equals(token0);
    
    // Get PDAs
    const poolState = getPoolState(token0, token1);
    const authority = getAuthority();
    const observationState = getObservationState(poolState);
    const inputVault = getTokenVault(poolState, inputMint);
    const outputVault = getTokenVault(poolState, outputMint);
    
    // Get user token accounts
    const userInputAccount = await getAssociatedTokenAddress(
      inputMint,
      walletPublicKey
    );
    const userOutputAccount = await getAssociatedTokenAddress(
      outputMint,
      walletPublicKey
    );
    
    // Get token programs
    const inputTokenProgram = TOKEN_PROGRAM_ID;
    const outputTokenProgram = TOKEN_PROGRAM_ID;
    
    // Convert amounts to base units
    const poolData = await program.account.poolState.fetch(poolState);
    const inputDecimals = (poolData as any).mint0Decimals;
    const outputDecimals = (poolData as any).mint1Decimals;
    
    const amountInBN = new BN(amountIn * Math.pow(10, isInputToken0 ? inputDecimals : outputDecimals));
    const minAmountOutBN = new BN(minimumAmountOut * Math.pow(10, isInputToken0 ? outputDecimals : inputDecimals));
    
    // Execute swap
    const tx = await program.methods
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
      .rpc();
    
    return tx;
  } catch (error) {
    console.error('Error swapping:', error);
    throw error;
  }
};

// Add liquidity
export const addLiquidity = async (
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  amount0: number,
  amount1: number,
  slippage: number = 0.5
) => {
  try {
    const program = getProgram(connection, wallet);
    
    // Sort tokens
    const { token0, token1 } = sortTokenMints(token0Mint, token1Mint);
    
    // Get PDAs
    const poolState = getPoolState(token0, token1);
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);
    
    // Get user token accounts
    const userToken0Account = await getAssociatedTokenAddress(token0, walletPublicKey);
    const userToken1Account = await getAssociatedTokenAddress(token1, walletPublicKey);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, walletPublicKey);
    
    // Get pool data
    const poolData = await program.account.poolState.fetch(poolState);
    const token0Decimals = (poolData as any).mint0Decimals;
    const token1Decimals = (poolData as any).mint1Decimals;
    
    // Calculate LP tokens (simplified)
    const lpAmount = new BN(Math.sqrt(amount0 * amount1) * Math.pow(10, 9)); // Assuming 9 decimals for LP
    
    const amount0BN = new BN(amount0 * Math.pow(10, token0Decimals));
    const amount1BN = new BN(amount1 * Math.pow(10, token1Decimals));
    const maxAmount0BN = new BN(amount0 * (1 + slippage / 100) * Math.pow(10, token0Decimals));
    const maxAmount1BN = new BN(amount1 * (1 + slippage / 100) * Math.pow(10, token1Decimals));
    
    // Execute deposit
    const tx = await program.methods
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
      .rpc();
    
    return tx;
  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw error;
  }
};

// Remove liquidity
export const removeLiquidity = async (
  connection: Connection,
  wallet: any,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  lpAmount: number,
  minAmount0: number,
  minAmount1: number
) => {
  try {
    const program = getProgram(connection, wallet);
    
    // Sort tokens
    const { token0, token1 } = sortTokenMints(token0Mint, token1Mint);
    
    // Get PDAs
    const poolState = getPoolState(token0, token1);
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);
    
    // Get user token accounts
    const userToken0Account = await getAssociatedTokenAddress(token0, wallet.publicKey);
    const userToken1Account = await getAssociatedTokenAddress(token1, wallet.publicKey);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, wallet.publicKey);
    
    // Get pool data
    const poolData = await program.account.poolState.fetch(poolState);
    const token0Decimals = (poolData as any).mint0Decimals;
    const token1Decimals = (poolData as any).mint1Decimals;
    
    const lpAmountBN = new BN(lpAmount * Math.pow(10, 9));
    const minAmount0BN = new BN(minAmount0 * Math.pow(10, token0Decimals));
    const minAmount1BN = new BN(minAmount1 * Math.pow(10, token1Decimals));
    
    // Execute withdraw
    const tx = await program.methods
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
      .rpc();
    
    return tx;
  } catch (error) {
    console.error('Error removing liquidity:', error);
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
  initAmount1: number
) => {
  try {
    const program = getProgram(connection, wallet);
    
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
    const poolState = getPoolState(token0, token1);
    
    console.log('🔑 Using PDA for Pool State:', poolState.toString());
    
    // Get PDAs derived from pool state
    const authority = getAuthority();
    const lpMint = getLpMint(poolState);
    const token0Vault = getTokenVault(poolState, token0);
    const token1Vault = getTokenVault(poolState, token1);
    const observationState = getObservationState(poolState);
    const createPoolFee = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');
    
    // Get user token accounts
    const userToken0Account = await getAssociatedTokenAddress(token0, walletPublicKey);
    const userToken1Account = await getAssociatedTokenAddress(token1, walletPublicKey);
    const userLpAccount = await getAssociatedTokenAddress(lpMint, walletPublicKey);
    
    // Convert amounts to BN with correct decimals
    const initAmount0BN = new BN(finalAmount0 * Math.pow(10, finalDecimals0));
    const initAmount1BN = new BN(finalAmount1 * Math.pow(10, finalDecimals1));
    const openTime = new BN(Math.floor(Date.now() / 1000)); // Open immediately
    
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
    
    // Build transaction using Anchor with PDA (no signers needed for PDA)
    const tx = await program.methods
      .initialize(initAmount0BN, initAmount1BN, openTime)
      .accounts({
        creator: walletPublicKey,
        ammConfig: AMM_CONFIG,
        authority,
        poolState: poolState, // Using PDA now
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
        token0Program: TOKEN_PROGRAM_ID,
        token1Program: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction(); // No signers array needed for PDA
    
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = walletPublicKey;
    
    // Now sign with user's wallet (poolStateKeypair already signed by Anchor)
    const signedTx = await wallet.signTransaction(tx);
    
    // Send and confirm
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    console.log('✅ Pool created successfully:', signature);
    console.log('📍 Pool State PDA:', poolState.toString());
    console.log('🔗 View on Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    return { tx: signature, poolState: poolState };
  } catch (error) {
    console.error('Error creating pool:', error);
    throw error;
  }
};

