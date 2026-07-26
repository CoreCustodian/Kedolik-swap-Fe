import { PublicKey } from '@solana/web3.js';
import { KEDOLOG_MINT, SOL_MINT } from '../config/addresses';
import { TokenInfo } from '../config/tokens';

const STORAGE_KEY = 'kedolik-swap-selected-pair';

/** Default swap pair: pay KEDOL, receive SOL */
export const DEFAULT_SWAP_PAIR = {
  from: KEDOLOG_MINT.toString(),
  to: SOL_MINT.toString(),
} as const;

export const getSwapDefaultPath = () =>
  `/swap?from=${DEFAULT_SWAP_PAIR.from}&to=${DEFAULT_SWAP_PAIR.to}`;

export interface SerializedTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface StoredSwapPair {
  from: string;
  to: string;
  fromMeta?: SerializedTokenInfo;
  toMeta?: SerializedTokenInfo;
}

export const serializeToken = (token: TokenInfo): SerializedTokenInfo => ({
  mint: token.mint.toString(),
  symbol: token.symbol,
  name: token.name,
  decimals: token.decimals,
  logoURI: token.logoURI,
});

export const deserializeToken = (meta: SerializedTokenInfo): TokenInfo => ({
  mint: new PublicKey(meta.mint),
  symbol: meta.symbol,
  name: meta.name,
  decimals: meta.decimals,
  logoURI: meta.logoURI,
});

export const saveSwapPair = (
  fromMint: string,
  toMint: string,
  fromToken?: TokenInfo,
  toToken?: TokenInfo
) => {
  try {
    const payload: StoredSwapPair = { from: fromMint, to: toMint };
    if (fromToken && fromToken.mint.toString() === fromMint) {
      payload.fromMeta = serializeToken(fromToken);
    }
    if (toToken && toToken.mint.toString() === toMint) {
      payload.toMeta = serializeToken(toToken);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode errors
  }
};

export const loadSwapPair = (): StoredSwapPair | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSwapPair;
    if (parsed?.from && parsed?.to) return parsed;
  } catch {
    // ignore
  }
  return null;
};
