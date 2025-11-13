// Jupiter API for token prices - NO SERVER NEEDED!
// Free to use, no API key required for basic usage

interface JupiterPriceResponse {
  data: {
    [key: string]: {
      id: string;
      mintSymbol: string;
      vsToken: string;
      vsTokenSymbol: string;
      price: number;
    };
  };
  timeTaken: number;
}

// Cache prices to avoid excessive API calls
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

export const getTokenPrices = async (mintAddresses: string[]): Promise<Map<string, number>> => {
  try {
    // Check cache first
    const now = Date.now();
    const cachedPrices = new Map<string, number>();
    const missingMints: string[] = [];

    mintAddresses.forEach((mint) => {
      const cached = priceCache.get(mint);
      if (cached && now - cached.timestamp < CACHE_DURATION) {
        cachedPrices.set(mint, cached.price);
      } else {
        missingMints.push(mint);
      }
    });

    // If all prices are cached, return them
    if (missingMints.length === 0) {
      return cachedPrices;
    }

    // Fetch missing prices from Jupiter (only works on mainnet)
    // For devnet, return 0 prices
    if (import.meta.env.VITE_NETWORK === 'devnet') {
      console.log('Devnet mode: Skipping price fetching');
      return cachedPrices;
    }

    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${missingMints.join(',')}`
    );

    if (!response.ok) {
      console.warn('Failed to fetch prices from Jupiter');
      return cachedPrices;
    }

    const data: JupiterPriceResponse = await response.json();

    // Update cache and combine with cached prices
    Object.entries(data.data).forEach(([mint, priceData]) => {
      const price = priceData.price;
      priceCache.set(mint, { price, timestamp: now });
      cachedPrices.set(mint, price);
    });

    return cachedPrices;
  } catch (error) {
    console.error('Error fetching token prices:', error);
    return new Map();
  }
};

// Get single token price
export const getTokenPrice = async (mintAddress: string): Promise<number> => {
  const prices = await getTokenPrices([mintAddress]);
  return prices.get(mintAddress) || 0;
};

// Get token metadata from Jupiter
export const getTokenMetadata = async (mintAddress: string) => {
  // Skip on devnet - Jupiter API only works on mainnet
  if (import.meta.env.VITE_NETWORK === 'devnet') {
    return null;
  }
  
  try {
    const response = await fetch(
      `https://tokens.jup.ag/token/${mintAddress}`
    );
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      logoURI: data.logoURI,
    };
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return null;
  }
};

/**
 * NOTE: All token addresses are centralized in src/config/addresses.ts
 * Import from there instead of using hardcoded values!
 * 
 * This KNOWN_TOKENS object is kept for backward compatibility only.
 * For new code, always import from src/config/addresses.ts
 */

// Cache SOL price to avoid repeated RPC calls
let solPriceCache: { price: number; timestamp: number } | null = null;
const SOL_PRICE_CACHE_TTL = 30000; // 30 seconds cache

/**
 * Get SOL price from on-chain SOL/USDC pool
 * Reads actual reserves from the pool vaults
 * Cached for 30 seconds to improve performance
 */
export const getSolPrice = async (connection: any, forceRefresh: boolean = false): Promise<number> => {
  // Return cached price if still valid
  const now = Date.now();
  if (!forceRefresh && solPriceCache && (now - solPriceCache.timestamp) < SOL_PRICE_CACHE_TTL) {
    return solPriceCache.price;
  }

  try {
    const { SOL_VAULT, USDC_VAULT_IN_SOL_POOL } = await import('../config/addresses');
    
    // Read vault balances
    const solVaultInfo = await connection.getTokenAccountBalance(SOL_VAULT);
    const usdcVaultInfo = await connection.getTokenAccountBalance(USDC_VAULT_IN_SOL_POOL);
    
    if (!solVaultInfo?.value?.amount || !usdcVaultInfo?.value?.amount) {
      console.warn('⚠️ Could not read SOL/USDC pool vault balances');
      const fallbackPrice = 150;
      solPriceCache = { price: fallbackPrice, timestamp: now };
      return fallbackPrice;
    }
    
    // Parse reserves (SOL has 9 decimals, USDC has 6)
    const solReserve = parseFloat(solVaultInfo.value.amount) / 1e9;
    const usdcReserve = parseFloat(usdcVaultInfo.value.amount) / 1e6;
    
    if (solReserve === 0) {
      console.warn('⚠️ SOL reserve is zero in pool');
      const fallbackPrice = 150;
      solPriceCache = { price: fallbackPrice, timestamp: now };
      return fallbackPrice;
    }
    
    // Calculate price: USDC / SOL
    const solPrice = usdcReserve / solReserve;
    
    // Cache the price
    solPriceCache = { price: solPrice, timestamp: now };
    
    console.log(`💰 SOL price from pool: $${solPrice.toFixed(2)} (${solReserve.toFixed(2)} SOL, ${usdcReserve.toFixed(2)} USDC)`);
    
    return solPrice;
  } catch (error) {
    console.error('Error fetching SOL price from pool:', error);
    const fallbackPrice = 150;
    solPriceCache = { price: fallbackPrice, timestamp: now };
    return fallbackPrice;
  }
};

/**
 * Get USD price of any token using SOL/USDC as reference
 * For tokens paired with SOL, calculates: tokenPriceInUSD = tokenPriceInSOL * solPriceInUSD
 * For USDC, returns 1
 * For SOL, returns SOL/USDC price
 */
export const getTokenUsdPrice = async (
  connection: any,
  tokenMint: string,
  tokenSymbol?: string
): Promise<number> => {
  try {
    const { SOL_MINT, USDC_MINT } = await import('../config/addresses');
    
    // USDC is always $1
    if (tokenMint === USDC_MINT.toString()) {
      return 1;
    }
    
    // SOL price from SOL/USDC pool
    if (tokenMint === SOL_MINT.toString()) {
      return await getSolPrice(connection);
    }
    
    // For other tokens, find their pool with SOL or USDC
    const { fetchPools } = await import('./amm');
    const { PublicKey } = await import('@solana/web3.js');
    
    // Convert tokenMint string to PublicKey for comparison
    const tokenMintPubkey = new PublicKey(tokenMint);
    const solMintPubkey = SOL_MINT;
    const usdcMintPubkey = USDC_MINT;
    
    const pools = await fetchPools(connection, null, false);
    
    console.log(`🔍 Looking for USD price for ${tokenSymbol || tokenMint}`);
    console.log(`📊 Checking ${pools.length} pools...`);
    
    // Try to find TOKEN/SOL pool first
    const tokenSolPool = pools.find((pool: any) => {
      const poolToken0 = pool.token0Mint.toString();
      const poolToken1 = pool.token1Mint.toString();
      const tokenMintStr = tokenMintPubkey.toString();
      const solMintStr = solMintPubkey.toString();
      
      const matches = (poolToken0 === tokenMintStr && poolToken1 === solMintStr) ||
                     (poolToken1 === tokenMintStr && poolToken0 === solMintStr);
      
      if (matches) {
        console.log(`✅ Found TOKEN/SOL pool: ${pool.token0Symbol}/${pool.token1Symbol}`, {
          token0Reserve: pool.token0Reserve,
          token1Reserve: pool.token1Reserve,
        });
      }
      
      return matches;
    });
    
    if (tokenSolPool) {
      const solPrice = await getSolPrice(connection);
      console.log(`💰 SOL price: $${solPrice.toFixed(2)}`);
      
      // Calculate token price in SOL
      let tokenPriceInSol: number;
      const tokenMintStr = tokenMintPubkey.toString();
      if (tokenSolPool.token0Mint.toString() === tokenMintStr) {
        // token0 is our token, token1 is SOL
        tokenPriceInSol = tokenSolPool.token1Reserve / tokenSolPool.token0Reserve;
        console.log(`💰 Token price calculation: ${tokenSolPool.token1Reserve} SOL / ${tokenSolPool.token0Reserve} ${tokenSymbol} = ${tokenPriceInSol} SOL per ${tokenSymbol}`);
      } else {
        // token1 is our token, token0 is SOL
        tokenPriceInSol = tokenSolPool.token0Reserve / tokenSolPool.token1Reserve;
        console.log(`💰 Token price calculation: ${tokenSolPool.token0Reserve} SOL / ${tokenSolPool.token1Reserve} ${tokenSymbol} = ${tokenPriceInSol} SOL per ${tokenSymbol}`);
      }
      
      // Convert to USD
      const tokenPriceInUsd = tokenPriceInSol * solPrice;
      console.log(`💰 Final USD price: ${tokenPriceInSol} SOL × $${solPrice.toFixed(2)} = $${tokenPriceInUsd.toFixed(2)}`);
      return tokenPriceInUsd;
    }
    
    // Try to find TOKEN/USDC pool
    const tokenUsdcPool = pools.find((pool: any) => {
      const poolToken0 = pool.token0Mint.toString();
      const poolToken1 = pool.token1Mint.toString();
      const tokenMintStr = tokenMintPubkey.toString();
      const usdcMintStr = usdcMintPubkey.toString();
      
      const matches = (poolToken0 === tokenMintStr && poolToken1 === usdcMintStr) ||
                     (poolToken1 === tokenMintStr && poolToken0 === usdcMintStr);
      
      if (matches) {
        console.log(`✅ Found TOKEN/USDC pool: ${pool.token0Symbol}/${pool.token1Symbol}`, {
          token0Reserve: pool.token0Reserve,
          token1Reserve: pool.token1Reserve,
        });
      }
      
      return matches;
    });
    
    if (tokenUsdcPool) {
      // Calculate token price in USDC directly
      const tokenMintStr = tokenMintPubkey.toString();
      let tokenPriceInUsd: number;
      if (tokenUsdcPool.token0Mint.toString() === tokenMintStr) {
        // token0 is our token, token1 is USDC
        tokenPriceInUsd = tokenUsdcPool.token1Reserve / tokenUsdcPool.token0Reserve;
        console.log(`💰 Token price calculation: ${tokenUsdcPool.token1Reserve} USDC / ${tokenUsdcPool.token0Reserve} ${tokenSymbol} = $${tokenPriceInUsd.toFixed(2)}`);
      } else {
        // token1 is our token, token0 is USDC
        tokenPriceInUsd = tokenUsdcPool.token0Reserve / tokenUsdcPool.token1Reserve;
        console.log(`💰 Token price calculation: ${tokenUsdcPool.token0Reserve} USDC / ${tokenUsdcPool.token1Reserve} ${tokenSymbol} = $${tokenPriceInUsd.toFixed(2)}`);
      }
      return tokenPriceInUsd;
    }
    
    // No pool found - return 0 (will be handled by UI)
    console.warn(`⚠️ No pool found for ${tokenSymbol || tokenMint} to calculate USD price`);
    console.log(`📋 Available pools:`, pools.map((p: any) => `${p.token0Symbol}/${p.token1Symbol}`));
    return 0;
  } catch (error) {
    console.error('Error calculating token USD price:', error);
    return 0;
  }
};

