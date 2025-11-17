import { PublicKey } from '@solana/web3.js';
import { 
  SOL_MINT,
  KEDOLOG_MINT, 
  USDC_MINT,
  USDT_MINT
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
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  KEDOLOG: {
    mint: KEDOLOG_MINT,
    symbol: 'KEDOL',
    name: 'Kedol Protocol Token',
    decimals: 9,
    logoURI: undefined, // Add logo URI if available
  },
  USDC: {
    mint: USDC_MINT,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  USDT: {
    mint: USDT_MINT,
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    coingeckoId: 'tether',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
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


