import { PublicKey } from '@solana/web3.js';
import { 
  SOL_MINT,
  KEDOLOG_MINT, 
  USDC_MINT
} from './addresses';

// For test tokens, define mints locally (not in addresses.ts since they're dynamic)
const WSOL_MINT_TEST = new PublicKey('6xuEzd4YE3XRXWdSRKZ6V2LELkR6tocvPcnu18E8rwjv');
const ETH_MINT_TEST = new PublicKey('CTHA8taNT2LgyQyj2xVD38nmnxTsCbAJ22Vsee4RvHF3');
const BTC_MINT_TEST = new PublicKey('ErGy4n8vBRw2mscMgbZg5rf3SdyDdk11LsaXKG8JJsoa');
const TEST1_MINT = new PublicKey('HWb5ost8dtu1gMzvbBPcA1UaCRqyGnuDNwktrrkMnqcQ');
const TEST2_MINT = new PublicKey('6aP9X54pSCjsfT78Xf1MQyLwVJ9pBusKVRbt8MQDLytg');

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
    mint: WSOL_MINT_TEST, // Test token (dynamic pool discovery)
    symbol: 'WSOL',
    name: 'Wrapped SOL (Test)',
    decimals: 9,
  },
  ETH: {
    mint: ETH_MINT_TEST, // Test token (dynamic pool discovery)
    symbol: 'ETH',
    name: 'Ethereum (Test)',
    decimals: 18,
  },
  BTC: {
    mint: BTC_MINT_TEST, // Test token (dynamic pool discovery)
    symbol: 'BTC',
    name: 'Bitcoin (Test)',
    decimals: 8,
  },
  TEST1: {
    mint: TEST1_MINT, // Test token (dynamic pool discovery)
    symbol: 'TEST1',
    name: 'Test Token 1',
    decimals: 9,
  },
  TEST2: {
    mint: TEST2_MINT, // Test token (dynamic pool discovery)
    symbol: 'TEST2',
    name: 'Test Token 2',
    decimals: 9,
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


