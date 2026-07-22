import { KEDOLOG_MINT, SOL_MINT } from '../config/addresses';

const STORAGE_KEY = 'kedolik-swap-selected-pair';

/** Default swap pair: pay KEDOL, receive SOL */
export const DEFAULT_SWAP_PAIR = {
  from: KEDOLOG_MINT.toString(),
  to: SOL_MINT.toString(),
} as const;

export const getSwapDefaultPath = () =>
  `/swap?from=${DEFAULT_SWAP_PAIR.from}&to=${DEFAULT_SWAP_PAIR.to}`;

export interface StoredSwapPair {
  from: string;
  to: string;
}
export const saveSwapPair = (fromMint: string, toMint: string) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ from: fromMint, to: toMint }));
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
