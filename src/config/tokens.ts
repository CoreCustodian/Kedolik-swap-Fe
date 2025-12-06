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
 * Get local logo path for a token mint address
 * Logos are stored in public/tokens/{mint}.png
 */
export const getLocalTokenLogo = (mint: PublicKey): string => {
  return `/tokens/${mint.toString()}.png`;
};

/**
 * Mainnet Token List
 * 
 * Core tokens supported by Kedolik DEX:
 * - SOL (Native Solana)
 * - KEDOL (Protocol Token)
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
    logoURI: getLocalTokenLogo(SOL_MINT),
  },
  KEDOLOG: {
    mint: KEDOLOG_MINT,
    symbol: 'KEDOL',
    name: 'Kedol Protocol Token',
    decimals: 9,
    logoURI: getLocalTokenLogo(KEDOLOG_MINT),
  },
  USDC: {
    mint: USDC_MINT,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
    logoURI: getLocalTokenLogo(USDC_MINT),
  },
  USDT: {
    mint: USDT_MINT,
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    coingeckoId: 'tether',
    logoURI: getLocalTokenLogo(USDT_MINT),
  },
  // Test tokens for localhost/devnet testing
  // TEST1: {
  //   mint: new PublicKey('DhdP3Fgjfa5MCkxzESPmChC4bt8r8PZQDvgdxBKBNfei'),
  //   symbol: 'TEST1',
  //   name: 'Test Token 1',
  //   decimals: 9,
  //   logoURI: getLocalTokenLogo(new PublicKey('DhdP3Fgjfa5MCkxzESPmChC4bt8r8PZQDvgdxBKBNfei')),
  // },
  // TEST2: {
  //   mint: new PublicKey('7XLSRi41pqz6jUpXJPsXQaxtGtAznQdf9mSoy1K2df53'),
  //   symbol: 'TEST2',
  //   name: 'Test Token 2',
  //   decimals: 9,
  //   logoURI: getLocalTokenLogo(new PublicKey('7XLSRi41pqz6jUpXJPsXQaxtGtAznQdf9mSoy1K2df53')),
  // },
  // TEST3: {
  //   mint: new PublicKey('GzaGvGkv1JzYBQnhigvaRo88WofYLaozjuuisPrwreKP'),
  //   symbol: 'TEST3',
  //   name: 'Test Token 3',
  //   decimals: 9,
  //   logoURI: getLocalTokenLogo(new PublicKey('GzaGvGkv1JzYBQnhigvaRo88WofYLaozjuuisPrwreKP')),
  // },
  // TEST4: {
  //   mint: new PublicKey('3mLjunWAwdRsxS7SgKC77VMKj72LdqN95n599CQo2NYs'),
  //   symbol: 'TEST4',
  //   name: 'Test Token 4',
  //   decimals: 9,
  //   logoURI: getLocalTokenLogo(new PublicKey('3mLjunWAwdRsxS7SgKC77VMKj72LdqN95n599CQo2NYs')),
  // },
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
  { from: 'KEDOL', to: 'USDC' },
  { from: 'SOL', to: 'USDC' },
  { from: 'KEDOL', to: 'SOL' },
];


