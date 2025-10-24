// Jupiter API for token prices - NO SERVER NEEDED!
// Free to use, no API key required for basic usage

interface TokenPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

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

// Well-known token addresses for quick reference
export const KNOWN_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
};

