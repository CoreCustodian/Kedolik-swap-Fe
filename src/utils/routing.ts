import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { fetchPools, PoolInfo, calculateSwapOutput, getProgram, getAuthority, getObservationState, AMM_CONFIG, isNativeSOL, createWrapSOLInstructions, createUnwrapSOLInstruction } from './amm';
import * as anchor from '@coral-xyz/anchor';

export interface SwapRoute {
  path: PublicKey[]; // Array of token mints in the route
  pools: PoolInfo[]; // Pools used in the route
  expectedOutput: number;
  priceImpact: number;
  hops: number;
}

/**
 * Find all possible routes between two tokens
 * Uses BFS (Breadth-First Search) to discover paths
 * Now validates that pools actually exist before adding them to routes
 */
export const findSwapRoutes = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  connection: Connection,
  wallet: any,
  maxHops: number = 3
): Promise<SwapRoute[]> => {
  try {
    // Fetch all available pools
    const allPools = await fetchPools(connection, wallet);
    
    if (allPools.length === 0) {
      console.log('❌ No pools found');
      return [];
    }
    
    console.log('🔍 Finding routes from', fromMint.toString(), 'to', toMint.toString());
    console.log('📊 Available pools:', allPools.length);
    
    // Log pool details for debugging
    console.log('📋 Pool tokens:');
    allPools.forEach((pool, idx) => {
      console.log(`  ${idx + 1}. ${pool.token0Symbol}/${pool.token1Symbol} (${pool.address.toString().slice(0, 8)}...)`);
    });
    
    // Build adjacency list (graph) of token connections
    // Only include pools with actual liquidity
    const graph = new Map<string, Array<{ mint: PublicKey; pool: PoolInfo }>>();
    
    for (const pool of allPools) {
      // Skip pools with zero or very low liquidity
      if (pool.token0Reserve < 0.000001 || pool.token1Reserve < 0.000001) {
        console.log(`⚠️ Skipping low-liquidity pool: ${pool.token0Symbol}/${pool.token1Symbol}`);
        continue;
      }
      
      const token0Str = pool.token0Mint.toString();
      const token1Str = pool.token1Mint.toString();
      
      // Add bidirectional edges
      if (!graph.has(token0Str)) graph.set(token0Str, []);
      if (!graph.has(token1Str)) graph.set(token1Str, []);
      
      graph.get(token0Str)!.push({ mint: pool.token1Mint, pool });
      graph.get(token1Str)!.push({ mint: pool.token0Mint, pool });
    }
    
    // BFS to find all paths
    const routes: SwapRoute[] = [];
    const queue: Array<{
      currentMint: PublicKey;
      path: PublicKey[];
      pools: PoolInfo[];
      visited: Set<string>;
    }> = [
      {
        currentMint: fromMint,
        path: [fromMint],
        pools: [],
        visited: new Set([fromMint.toString()]),
      },
    ];
    
    while (queue.length > 0) {
      const { currentMint, path, pools, visited } = queue.shift()!;
      
      // If we reached destination, save this route
      if (currentMint.equals(toMint)) {
        routes.push({
          path,
          pools,
          expectedOutput: 0, // Will calculate later
          priceImpact: 0,
          hops: pools.length,
        });
        continue;
      }
      
      // Stop if we've reached max hops
      if (pools.length >= maxHops) {
        continue;
      }
      
      // Explore neighbors
      const neighbors = graph.get(currentMint.toString()) || [];
      for (const { mint: nextMint, pool } of neighbors) {
        const nextMintStr = nextMint.toString();
        
        // Skip if already visited
        if (visited.has(nextMintStr)) {
          continue;
        }
        
        // Add to queue
        const newVisited = new Set(visited);
        newVisited.add(nextMintStr);
        
        queue.push({
          currentMint: nextMint,
          path: [...path, nextMint],
          pools: [...pools, pool],
          visited: newVisited,
        });
      }
    }
    
    console.log('🛣️  Found', routes.length, 'possible routes');
    return routes;
  } catch (error) {
    console.error('Error finding swap routes:', error);
    return [];
  }
};

/**
 * Calculate expected output for a route
 */
export const calculateRouteOutput = (
  route: SwapRoute,
  amountIn: number
): { expectedOutput: number; priceImpact: number } => {
  let currentAmount = amountIn;
  let totalPriceImpact = 0;
  
  for (let i = 0; i < route.pools.length; i++) {
    const pool = route.pools[i];
    const fromMint = route.path[i];
    
    // Determine if we're swapping token0 -> token1 or token1 -> token0
    const isToken0Input = fromMint.equals(pool.token0Mint);
    const reserveIn = isToken0Input ? pool.token0Reserve : pool.token1Reserve;
    const reserveOut = isToken0Input ? pool.token1Reserve : pool.token0Reserve;
    
    // Calculate output for this hop
    const result = calculateSwapOutput(currentAmount, reserveIn, reserveOut);
    
    currentAmount = result.amountOut;
    totalPriceImpact += result.priceImpact;
  }
  
  return {
    expectedOutput: currentAmount,
    priceImpact: totalPriceImpact,
  };
};

/**
 * Find the best route based on expected output
 */
export const findBestRoute = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amountIn: number,
  connection: Connection,
  wallet: any,
  maxHops: number = 3
): Promise<SwapRoute | null> => {
  try {
    // Check if trying to swap between the same token (or WSOL <-> Native SOL)
    const isSameToken = fromMint.equals(toMint) || 
                        (isNativeSOL(fromMint) && isNativeSOL(toMint));
    
    if (isSameToken) {
      console.log('⚠️ Cannot swap between the same token');
      return null;
    }
    
    const routes = await findSwapRoutes(fromMint, toMint, connection, wallet, maxHops);
    
    if (routes.length === 0) {
      return null;
    }
    
    // Calculate expected output for each route
    const routesWithOutput = routes.map(route => {
      const { expectedOutput, priceImpact } = calculateRouteOutput(route, amountIn);
      return {
        ...route,
        expectedOutput,
        priceImpact,
      };
    });
    
    // Sort by expected output (descending) and pick the best
    routesWithOutput.sort((a, b) => b.expectedOutput - a.expectedOutput);
    
    console.log('🏆 Best route:', {
      hops: routesWithOutput[0].hops,
      expectedOutput: routesWithOutput[0].expectedOutput,
      priceImpact: routesWithOutput[0].priceImpact.toFixed(2) + '%',
    });
    
    return routesWithOutput[0];
  } catch (error) {
    console.error('Error finding best route:', error);
    return null;
  }
};

/**
 * Execute a multi-hop swap as ONE ATOMIC TRANSACTION (like Raydium)
 * All swap instructions are included in a single transaction
 * If any swap fails, the entire transaction fails (atomic)
 */
export const executeMultiHopSwap = async (
  route: SwapRoute,
  amountIn: number,
  minimumAmountOut: number,
  connection: Connection,
  wallet: any,
  walletPublicKey: PublicKey,
  slippage: number = 0.5
): Promise<string[]> => {
  console.log('🚀 Executing multi-hop swap in ONE transaction:', {
    hops: route.hops,
    path: route.path.map((mint) => mint.toString().slice(0, 8)).join(' → '),
  });

  let signature: string = ''; // Declare here so catch block can access

  try {
    const program = getProgram(connection, wallet);
    const transaction = new Transaction();
    
    // Check if we need to wrap/unwrap SOL
    const inputMint = route.path[0];
    const outputMint = route.path[route.path.length - 1];
    const needsWrapInput = isNativeSOL(inputMint);
    const needsUnwrapOutput = isNativeSOL(outputMint);
    
    console.log('🌊 SOL handling:', { needsWrapInput, needsUnwrapOutput });
    
    // Step 1: Wrap SOL if input is native SOL
    if (needsWrapInput) {
      console.log('🌊 Adding wrap SOL instructions for input...');
      const { instructions: wrapInstructions } = await createWrapSOLInstructions(
        connection,
        walletPublicKey,
        amountIn
      );
      transaction.add(...wrapInstructions);
    }
    
    // Step 1.5: Create token accounts for ALL tokens in the route (except input)
    // IMPORTANT: Even for native SOL output, we need WSOL account (it gets unwrapped later)
    console.log('🔍 Checking token accounts for all tokens in route...');
    
    // Check all tokens except the first one (we already have that as input)
    const tokensToCheck = route.path.slice(1); // All tokens from 2nd onwards
    
    for (const tokenMint of tokensToCheck) {
      // For native SOL output, we STILL need the WSOL token account (swap sends to WSOL, then unwrap)
      const tokenAccount = await getAssociatedTokenAddress(tokenMint, walletPublicKey);
      const accountInfo = await connection.getAccountInfo(tokenAccount);
      
      // Always add account creation instruction (idempotent - won't fail if exists)
      // This ensures the account is properly set up for the swap in this transaction
      const tokenName = isNativeSOL(tokenMint) ? 'WSOL' : tokenMint.toString().slice(0, 8);
      console.log(`  📝 Adding idempotent account creation for: ${tokenName}... (exists: ${!!accountInfo})`);
      
      const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          walletPublicKey,
          tokenAccount,
          walletPublicKey,
          tokenMint
        )
      );
    }
    
    let currentAmount = amountIn;
    
    // Build all swap instructions
    for (let i = 0; i < route.pools.length; i++) {
      const pool = route.pools[i];
      const inputMint = route.path[i];
      const outputMint = route.path[i + 1];
      
      console.log(`  📝 Building instruction ${i + 1}/${route.hops}:`, {
        from: inputMint.toString().slice(0, 8),
        to: outputMint.toString().slice(0, 8),
        amount: currentAmount,
        poolAddress: pool.address.toString().slice(0, 8),
      });
      
      // Use the actual pool address from the route instead of recalculating
      const poolState = pool.address;
      const authority = getAuthority();
      const observationState = getObservationState(poolState);
      
      // Determine which token is input (compare with pool's token0/token1)
      const isInputToken0 = inputMint.equals(pool.token0Mint);
      
      // Use pool data we already have from the route
      console.log(`    ✅ Using pool data from route (vaults already known)`);
      const inputVault = isInputToken0 ? pool.token0Vault : pool.token1Vault;
      const outputVault = isInputToken0 ? pool.token1Vault : pool.token0Vault;
      
      // Get decimals from pool info we already have
      const inputDecimals = isInputToken0 ? pool.token0Decimals : pool.token1Decimals;
      const outputDecimals = isInputToken0 ? pool.token1Decimals : pool.token0Decimals;
      
      console.log(`    Decimals: input=${inputDecimals}, output=${outputDecimals}`);
      
      // Calculate expected output and minimum for this hop
      const reserveIn = isInputToken0 ? pool.token0Reserve : pool.token1Reserve;
      const reserveOut = isInputToken0 ? pool.token1Reserve : pool.token0Reserve;
      const { amountOut } = calculateSwapOutput(currentAmount, reserveIn, reserveOut);
      
      // For last hop, use user's minimum. For intermediate hops, use calculated minimum
      const isLastHop = i === route.pools.length - 1;
      const minOut = isLastHop 
        ? minimumAmountOut 
        : amountOut * (1 - slippage / 100);
      
      console.log(`    Expected: ${amountOut.toFixed(6)}, Min: ${minOut.toFixed(6)}`);
      
      // Get user token accounts
      const userInputAccount = await getAssociatedTokenAddress(inputMint, walletPublicKey);
      const userOutputAccount = await getAssociatedTokenAddress(outputMint, walletPublicKey);
      
      console.log(`    User accounts: input=${userInputAccount.toString().slice(0, 8)}, output=${userOutputAccount.toString().slice(0, 8)}`);
      
      // Convert amounts to token units - IMPORTANT: use correct decimals!
      const amountInTokens = new anchor.BN(Math.floor(currentAmount * Math.pow(10, inputDecimals)));
      const minimumAmountOutTokens = new anchor.BN(Math.floor(minOut * Math.pow(10, outputDecimals)));
      
      console.log(`    Token units: amountIn=${amountInTokens.toString()}, minOut=${minimumAmountOutTokens.toString()}`);
      
      // Build swap instruction - use pool's specific AMM config (important!)
      const poolAmmConfig = pool.ammConfig || AMM_CONFIG; // Fallback to default if not set
      console.log(`    Using AMM config: ${poolAmmConfig.toString().slice(0, 8)}...`);
      
      const swapInstruction = await program.methods
        .swapBaseInput(amountInTokens, minimumAmountOutTokens)
        .accounts({
          payer: walletPublicKey,
          authority: authority,
          ammConfig: poolAmmConfig, // Use pool's specific AMM config
          poolState: poolState,
          inputTokenAccount: userInputAccount,
          outputTokenAccount: userOutputAccount,
          inputVault: inputVault,
          outputVault: outputVault,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          inputTokenMint: inputMint,
          outputTokenMint: outputMint,
          observationState: observationState,
        })
        .instruction();
      
      transaction.add(swapInstruction);
      
      // Update amount for next hop
      currentAmount = amountOut;
    }
    
    console.log(`✅ Built transaction with ${route.hops} swap instructions`);
    
    // Step 2: Unwrap SOL if output is native SOL
    if (needsUnwrapOutput) {
      console.log('🌊 Adding unwrap SOL instruction for output...');
      const unwrapInstruction = await createUnwrapSOLInstruction(walletPublicKey);
      transaction.add(unwrapInstruction);
    }
    
    // Get FRESH latest blockhash - CRITICAL for avoiding "already processed" errors
    console.log('🔄 Getting fresh blockhash...');
    const latestBlockhashInfo = await connection.getLatestBlockhash('finalized');
    const { blockhash, lastValidBlockHeight } = latestBlockhashInfo;
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    console.log(`✅ Got blockhash: ${blockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);
    
    // Add a small delay to ensure blockhash is fully propagated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Sign and send transaction
    console.log('✍️ Signing transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    console.log('📤 Sending transaction...');
    signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0, // Don't retry - we handle this ourselves
    });
    
    console.log('✅ Transaction sent:', signature);
    console.log('🔗 Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Multi-hop swap completed successfully!');
    
    return [signature];
    
  } catch (error: any) {
    console.error('❌ Multi-hop swap failed:', error);
    
    // Check if transaction actually succeeded (common with "already processed" error)
    if (error.message?.includes('already been processed') || error.message?.includes('already processed')) {
      console.log('✅ Transaction succeeded! (Got "already processed" confirmation)');
      console.log('💡 The "already processed" message confirms the transaction completed.');
      
      // Transaction succeeded! Return the signature we sent
      // The signature variable should still be in scope from the try block
      // For "already processed", the tx went through, so we return success
      return [signature];
    }
    
    // Provide helpful error message
    let errorMsg = 'Multi-hop swap failed';
    if (error.message?.includes('insufficient')) {
      errorMsg += ': Insufficient balance or liquidity';
    } else if (error.message?.includes('slippage') || error.message?.includes('ExceededSlippage')) {
      errorMsg += ': Slippage tolerance exceeded. Try increasing slippage or reducing amount.';
    } else if (error.message?.includes('simulation')) {
      errorMsg += ': Transaction simulation failed. Check pool liquidity and token balances.';
    } else if (error.message?.includes('blockhash')) {
      errorMsg += ': Network congestion. Please try again.';
    } else {
      errorMsg += `: ${error.message || 'Unknown error'}`;
    }
    
    throw new Error(errorMsg);
  }
};

