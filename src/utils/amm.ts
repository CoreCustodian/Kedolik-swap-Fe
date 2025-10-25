import { 
  Connection, 
  PublicKey, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
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
  NATIVE_MINT,
} from '@solana/spl-token';
import IDLJson from '../../kedolik_cp_swap.json';
import { getTokenByMint } from '../config/tokens';

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

// Wrapped SOL (WSOL) mint address - same as NATIVE_MINT  
export const WSOL_MINT = NATIVE_MINT;

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
  // Fee data
  protocolFeesToken0: number;
  protocolFeesToken1: number;
  fundFeesToken0: number;
  fundFeesToken1: number;
  creatorFeesToken0: number;
  creatorFeesToken1: number;
  // Trading fee rate (from AMM config)
  tradeFeeRate: number; // in basis points (100 = 1%)
}

// Fetch all pools
export const fetchPools = async (
  connection: Connection,
  wallet: any
): Promise<PoolInfo[]> => {
  try {
    const program = getProgram(connection, wallet);
    
    // Fetch AMM config to get trade fee rate
    let tradeFeeRate = 100; // Default 1% (100 basis points)
    try {
      const ammConfigData = await (program.account as any).ammConfig.fetch(AMM_CONFIG);
      tradeFeeRate = ammConfigData.tradeFeeRate || 100;
      console.log('📊 AMM Config - Trade Fee Rate:', tradeFeeRate, 'basis points (', tradeFeeRate / 100, '%)');
    } catch (error) {
      console.warn('Could not fetch AMM config, using default fee rate');
    }
    
    // Fetch all pool accounts
    const pools = await (program.account as any).poolState.all();
    
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
      const protocolFeesToken0 = Number(data.protocolFeesToken0?.toString() || '0') / Math.pow(10, token0Decimals);
      const protocolFeesToken1 = Number(data.protocolFeesToken1?.toString() || '0') / Math.pow(10, token1Decimals);
      const fundFeesToken0 = Number(data.fundFeesToken0?.toString() || '0') / Math.pow(10, token0Decimals);
      const fundFeesToken1 = Number(data.fundFeesToken1?.toString() || '0') / Math.pow(10, token1Decimals);
      const creatorFeesToken0 = Number(data.creatorFeesToken0?.toString() || '0') / Math.pow(10, token0Decimals);
      const creatorFeesToken1 = Number(data.creatorFeesToken1?.toString() || '0') / Math.pow(10, token1Decimals);
      
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
        protocolFeesToken0,
        protocolFeesToken1,
        fundFeesToken0,
        fundFeesToken1,
        creatorFeesToken0,
        creatorFeesToken1,
        tradeFeeRate,
      });
    }
    
    return poolInfos;
  } catch (error) {
    console.error('Error fetching pools:', error);
    return [];
  }
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
  
  // Fallback to hardcoded values for backwards compatibility
  const mintStr = mint.toString();
  if (mintStr === TOKENS.KEDOLOG.toString()) return 'KEDOLOG';
  if (mintStr === TOKENS.USDC.toString()) return 'USDC';
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
    const userOutputAccount = await getAssociatedTokenAddress(
      outputMint,
      walletPublicKey
    );
    
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
    
    const amountInBN = new BN(amountIn * Math.pow(10, inputDecimals));
    const minAmountOutBN = new BN(minimumAmountOut * Math.pow(10, outputDecimals));
    
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
    
    // Step 3: If output is SOL, unwrap it after
    if (needsUnwrapOutput) {
      console.log('🌊 Adding unwrap SOL instruction...');
      const unwrapInstruction = await createUnwrapSOLInstruction(walletPublicKey);
      transaction.add(unwrapInstruction);
    }
    
    // Execute transaction
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    });
    
    console.log(`🔗 Transaction sent: ${signature}`);
    
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Swap successful!');
    return signature;
  } catch (error) {
    console.error('Error swapping:', error);
    throw error;
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
  _slippage: number = 0.5
) => {
  try {
    const program = getProgram(connection, wallet);
    
    console.log('💵 Adding liquidity - inputs:', {
      token0Mint: token0Mint.toString(),
      token1Mint: token1Mint.toString(),
      amount0,
      amount1,
    });
    
    // Check if we need to wrap SOL
    const needsWrapToken0 = isNativeSOL(token0Mint);
    const needsWrapToken1 = isNativeSOL(token1Mint);
    
    console.log('🌊 SOL handling:', { needsWrapToken0, needsWrapToken1 });
    
    // Sort tokens
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
    const lpTotalSupply = parseFloat((lpMintInfo.value?.data as any)?.parsed?.info?.supply || '0') / Math.pow(10, 9);
    
    console.log('🪙 LP Token info:', {
      lpTotalSupply,
      lpMint: lpMint.toString(),
    });
    
    // Calculate LP tokens based on pool reserves
    let lpAmount: BN;
    
    if (lpTotalSupply === 0 || token0Reserve === 0 || token1Reserve === 0) {
      // Initial deposit - use geometric mean
      lpAmount = new BN(Math.sqrt(finalAmount0 * finalAmount1) * Math.pow(10, 9));
      console.log('📊 Initial deposit - using geometric mean for LP:', lpAmount.toString());
    } else {
      // Subsequent deposit - maintain ratio
      // LP = min(amount0 / reserve0, amount1 / reserve1) * totalSupply
      const ratio0 = finalAmount0 / token0Reserve;
      const ratio1 = finalAmount1 / token1Reserve;
      const minRatio = Math.min(ratio0, ratio1);
      lpAmount = new BN(minRatio * lpTotalSupply * Math.pow(10, 9));
      console.log('📊 Subsequent deposit - LP based on ratio:', {
        ratio0,
        ratio1,
        minRatio,
        lpAmount: lpAmount.toString(),
      });
    }
    
    // Use generous slippage for max amounts (add 5% buffer on top of user's slippage)
    const slippageBuffer = _slippage + 5;
    const maxAmount0BN = new BN(finalAmount0 * (1 + slippageBuffer / 100) * Math.pow(10, token0Decimals));
    const maxAmount1BN = new BN(finalAmount1 * (1 + slippageBuffer / 100) * Math.pow(10, token1Decimals));
    
    console.log('📤 Deposit parameters:', {
      lpAmount: lpAmount.toString(),
      maxAmount0: maxAmount0BN.toString(),
      maxAmount1: maxAmount1BN.toString(),
      slippageBuffer: `${slippageBuffer}%`,
    });
    
    // Build the transaction
    const transaction = new Transaction();
    
    // Step 1: Wrap SOL if needed
    if (needsWrapToken0) {
      console.log('🌊 Wrapping SOL for token0...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        tokensWereSwapped ? amount1 : amount0
      );
      transaction.add(...wrapInstructions);
    }
    
    if (needsWrapToken1) {
      console.log('🌊 Wrapping SOL for token1...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        tokensWereSwapped ? amount0 : amount1
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
    
    // Execute transaction
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);
    
    // Small delay to ensure blockhash propagation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    });
    
    console.log(`🔗 Transaction sent: ${signature}`);
    
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Liquidity added successfully!', {
      txSignature: signature,
      lpTokensReceived: (lpAmount.toNumber() / Math.pow(10, 9)).toFixed(4),
    });
    
    return signature;
  } catch (error: any) {
    console.error('❌ Error adding liquidity:', error);
    
    // Check if it's an "already processed" error (often a false negative)
    if (error.message && error.message.includes('already been processed')) {
      console.log('⚠️ Transaction might have already succeeded - check your LP tokens!');
      throw new Error('Transaction might have already been processed. Please check your wallet and LP token balance. If liquidity was added, you can ignore this error.');
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
  minAmount1: number
) => {
  try {
    const program = getProgram(connection, wallet);
    
    // Check if we need to unwrap SOL
    const needsUnwrapToken0 = isNativeSOL(token0Mint);
    const needsUnwrapToken1 = isNativeSOL(token1Mint);
    
    console.log('🌊 SOL handling:', { needsUnwrapToken0, needsUnwrapToken1 });
    
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
    const poolData = await (program.account as any).poolState.fetch(poolState);
    const token0Decimals = (poolData as any).mint0Decimals;
    const token1Decimals = (poolData as any).mint1Decimals;
    
    const lpAmountBN = new BN(lpAmount * Math.pow(10, 9));
    const minAmount0BN = new BN(minAmount0 * Math.pow(10, token0Decimals));
    const minAmount1BN = new BN(minAmount1 * Math.pow(10, token1Decimals));
    
    console.log('🔥 Removing liquidity:', {
      lpAmount,
      lpAmountBN: lpAmountBN.toString(),
      minAmount0,
      minAmount1,
      minAmount0BN: minAmount0BN.toString(),
      minAmount1BN: minAmount1BN.toString(),
    });
    
    // Build transaction
    const transaction = new Transaction();
    
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
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);
    
    // Small delay to ensure blockhash propagation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Sign transaction
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send transaction with proper options
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    });
    
    console.log(`🔗 Transaction sent: ${signature}`);
    
    // Confirm transaction
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Liquidity removed successfully!');
    return signature;
  } catch (error: any) {
    console.error('❌ Error removing liquidity:', error);
    
    // Check if it's an "already processed" error (often a false negative)
    if (error.message && error.message.includes('already been processed')) {
      console.log('⚠️ Transaction might have already succeeded - check your wallet!');
      throw new Error('Transaction might have already been processed. Please check your wallet balance. If liquidity was removed, you can ignore this error.');
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
    
    // Check if we need to handle native SOL
    const needsWrapToken0 = isNativeSOL(token0);
    const needsWrapToken1 = isNativeSOL(token1);
    
    console.log('🌊 SOL handling for pool creation:', { needsWrapToken0, needsWrapToken1 });
    
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
    
    // Build transaction
    const transaction = new Transaction();
    
    // Step 1: Wrap SOL if needed (BEFORE initialize instruction)
    if (needsWrapToken0) {
      console.log('🌊 Wrapping SOL for token0...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount0
      );
      transaction.add(...wrapInstructions);
    }
    
    if (needsWrapToken1) {
      console.log('🌊 Wrapping SOL for token1...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        finalAmount1
      );
      transaction.add(...wrapInstructions);
    }
    
    // Step 2: Build the initialize pool instruction
    console.log('🏗️ Building initialize pool instruction...');
    const initializeInstruction = await program.methods
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
      .instruction();
    
    transaction.add(initializeInstruction);
    
    // Get latest blockhash
    console.log('📡 Getting fresh blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);
    
    // Small delay to ensure blockhash propagation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Sign with user's wallet
    console.log('✍️ Signing transaction...');
    const signedTx = await wallet.signTransaction(transaction);
    
    // Send transaction
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    });
    
    console.log(`🔗 Transaction sent: ${signature}`);
    
    // Confirm transaction
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Pool created successfully:', signature);
    console.log('📍 Pool State PDA:', poolState.toString());
    console.log('🔗 View on Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    return { tx: signature, poolState: poolState };
  } catch (error: any) {
    console.error('❌ Error creating pool:', error);
    
    // Check if it's an "already processed" error (often a false negative)
    if (error.message && error.message.includes('already been processed')) {
      console.log('⚠️ Transaction might have already succeeded - check the pools page!');
      throw new Error('Transaction might have already been processed. Please check the Pools page to verify if the pool was created.');
    }
    
    // Enhanced error message for account initialization errors
    if (error.message && error.message.includes('AccountNotInitialized')) {
      throw new Error('Token account not initialized. Please ensure you have token balances for both tokens.');
    }
    
    throw error;
  }
};

