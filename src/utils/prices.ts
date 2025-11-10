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

/**
 * Get SOL price from on-chain SOL/USDC pool
 * Reads actual reserves from the pool vaults
 */
export const getSolPrice = async (connection: any): Promise<number> => {
  try {
    const { SOL_VAULT, USDC_VAULT_IN_SOL_POOL } = await import('../config/addresses');
    
    // Read vault balances
    const solVaultInfo = await connection.getTokenAccountBalance(SOL_VAULT);
    const usdcVaultInfo = await connection.getTokenAccountBalance(USDC_VAULT_IN_SOL_POOL);
    
    if (!solVaultInfo?.value?.amount || !usdcVaultInfo?.value?.amount) {
      console.warn('⚠️ Could not read SOL/USDC pool vault balances');
      return 150; // Fallback price
    }
    
    // Parse reserves (SOL has 9 decimals, USDC has 6)
    const solReserve = parseFloat(solVaultInfo.value.amount) / 1e9;
    const usdcReserve = parseFloat(usdcVaultInfo.value.amount) / 1e6;
    
    if (solReserve === 0) {
      console.warn('⚠️ SOL reserve is zero in pool');
      return 150; // Fallback price
    }
    
    // Calculate price: USDC / SOL
    const solPrice = usdcReserve / solReserve;
    
    console.log(`💰 SOL price from pool: $${solPrice.toFixed(2)} (${solReserve.toFixed(2)} SOL, ${usdcReserve.toFixed(2)} USDC)`);
    
    return solPrice;
  } catch (error) {
    console.error('Error fetching SOL price from pool:', error);
    return 150; // Conservative fallback
  }
};

