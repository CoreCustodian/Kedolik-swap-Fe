// Jupiter Aggregator API - Get best swap routes
// NO SERVER NEEDED - Free public API!

export interface JupiterRoute {
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  marketInfos: {
    id: string;
    label: string;
    inputMint: string;
    outputMint: string;
    notEnoughLiquidity: boolean;
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    lpFee: {
      amount: string;
      mint: string;
      pct: number;
    };
    platformFee: {
      amount: string;
      mint: string;
      pct: number;
    };
  }[];
}

export interface QuoteResponse {
  data: JupiterRoute[];
  timeTaken: number;
}

// Get best swap route from Jupiter
export const getJupiterQuote = async (
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50 // 0.5% default
): Promise<JupiterRoute | null> => {
  try {
    // Convert amount to lamports/smallest unit
    const amountInSmallestUnit = Math.floor(amount * 1e9);

    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amountInSmallestUnit}&` +
      `slippageBps=${slippageBps}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Jupiter quote');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Jupiter quote:', error);
    return null;
  }
};

// Get swap transaction from Jupiter
export const getJupiterSwapTransaction = async (
  route: any,
  userPublicKey: string
) => {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: route,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get swap transaction');
    }

    const { swapTransaction } = await response.json();
    return swapTransaction;
  } catch (error) {
    console.error('Error getting swap transaction:', error);
    return null;
  }
};

// Get all available tokens from Jupiter
export const getJupiterTokenList = async () => {
  try {
    const response = await fetch('https://token.jup.ag/all');
    
    if (!response.ok) {
      throw new Error('Failed to fetch token list');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching token list:', error);
    return [];
  }
};

