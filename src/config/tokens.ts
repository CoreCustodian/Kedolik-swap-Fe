import { PublicKey } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';

export interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
}

// Devnet Token List
export const DEVNET_TOKENS: { [key: string]: TokenInfo } = {
  SOL: {
    mint: NATIVE_MINT, // Native SOL (So1111111111111111111111111111111111111111112)
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
  },
  KEDOLOG: {
    mint: new PublicKey('DhKDRUdDLeSGM8tQjsCF8vewTffPFZwi3voZunY7RNsW'),
    symbol: 'KEDOLOG',
    name: 'Kedolog Protocol Token',
    decimals: 9,
  },
  USDC: {
    mint: new PublicKey('2YAPUKzhzPDnV3gxHew5kUUt1L157Tdrdbv7Gbbg3i32'),
    symbol: 'USDC',
    name: 'USD Coin (Test)',
    decimals: 6,
  },
  WSOL: {
    mint: new PublicKey('6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv'),
    symbol: 'WSOL',
    name: 'Wrapped SOL (Test)',
    decimals: 9,
  },
  ETH: {
    mint: new PublicKey('CTHA8taNT2LgyQyj2xVD38nmnxTsCbAJ22Vsee4RvHF3'),
    symbol: 'ETH',
    name: 'Ethereum (Test)',
    decimals: 18,
  },
  BTC: {
    mint: new PublicKey('ErGy4n8vBRw2mscMgbZg5rf3SdyDdk11LsaXKG8JJsoa'),
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


