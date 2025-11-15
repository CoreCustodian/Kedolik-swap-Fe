import { PublicKey } from '@solana/web3.js';
import { 
  SOL_MINT,
  KEDOLOG_MINT, 
  USDC_MINT
} from './addresses';

export interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
}

/**
 * Mainnet Token List
 * 
 * Core tokens supported by Kedolik DEX:
 * - SOL (Native Solana)
 * - KEDOLOG (Protocol Token)
 * - USDC (Stablecoin)
 * 
 * Users can import additional tokens using the custom token import feature.
 */
export const DEVNET_TOKENS: { [key: string]: TokenInfo } = {
  SOL: {
    mint: SOL_MINT,
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    coingeckoId: 'solana',
  },
  KEDOLOG: {
    mint: KEDOLOG_MINT,
    symbol: 'KEDOL',
    name: 'Kedol Protocol Token',
    decimals: 9,
  },
  USDC: {
    mint: USDC_MINT,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
};

// Get token list as array
export const getTokenList = (): TokenInfo[] => {
  return Object.values(DEVNET_TOKENS);
};

// Get token by mint
export const getTokenByMint = (mint: PublicKey): TokenInfo | undefined => {
  return getTokenList().find(token => token.mint.equals(mint));
};

// Get token by symbol
export const getTokenBySymbol = (symbol: string): TokenInfo | undefined => {
  return DEVNET_TOKENS[symbol];
};

// Default token pairs for quick access
export const DEFAULT_TOKEN_PAIRS = [
  { from: 'KEDOLOG', to: 'USDC' },
  { from: 'SOL', to: 'USDC' },
  { from: 'KEDOLOG', to: 'SOL' },
];


