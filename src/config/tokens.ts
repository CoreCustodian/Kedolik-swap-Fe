import { PublicKey } from '@solana/web3.js';
import { 
  SOL_MINT,
  KEDOLOG_MINT, 
  USDC_MINT, 
  WSOL_MINT,
  ETH_MINT,
  BTC_MINT 
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
 * Devnet Token List
 * 
 * IMPORTANT: All mint addresses are imported from src/config/addresses.ts
 * This ensures a single source of truth for all blockchain addresses.
 * When deploying to mainnet, ONLY update addresses.ts!
 */
export const DEVNET_TOKENS: { [key: string]: TokenInfo } = {
  SOL: {
    mint: SOL_MINT, // Native SOL - imported from addresses.ts
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
  },
  KEDOLOG: {
    mint: KEDOLOG_MINT, // Imported from addresses.ts
    symbol: 'KEDOLOG',
    name: 'Kedolog Protocol Token',
    decimals: 9,
  },
  USDC: {
    mint: USDC_MINT, // Imported from addresses.ts
    symbol: 'USDC',
    name: 'USD Coin (Test)',
    decimals: 6,
  },
  WSOL: {
    mint: WSOL_MINT, // Imported from addresses.ts
    symbol: 'WSOL',
    name: 'Wrapped SOL (Test)',
    decimals: 9,
  },
  ETH: {
    mint: ETH_MINT, // Imported from addresses.ts
    symbol: 'ETH',
    name: 'Ethereum (Test)',
    decimals: 18,
  },
  BTC: {
    mint: BTC_MINT, // Imported from addresses.ts
    symbol: 'BTC',
    name: 'Bitcoin (Test)',
    decimals: 8,
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
  { from: 'ETH', to: 'USDC' },
  { from: 'BTC', to: 'USDC' },
];


