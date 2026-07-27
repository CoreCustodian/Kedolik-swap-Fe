import type { AggregatorQuoteResult } from './aggregatorRouter';

const QUOTE_CACHE_TTL_MS = 8_000;

interface QuoteCacheEntry {
  result: AggregatorQuoteResult | null;
  cachedAt: number;
}

const quoteCache = new Map<string, QuoteCacheEntry>();

export const buildQuoteCacheKey = (params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageSetting: string;
  userWallet?: string;
  compareAllProviders?: boolean;
}): string =>
  [
    params.inputMint,
    params.outputMint,
    params.amount.toFixed(8),
    params.slippageSetting,
    params.userWallet ?? '',
    params.compareAllProviders ? 'compare' : 'single',
  ].join(':');

export const getCachedQuote = (key: string): AggregatorQuoteResult | null | undefined => {
  const entry = quoteCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > QUOTE_CACHE_TTL_MS) {
    quoteCache.delete(key);
    return undefined;
  }
  return entry.result;
};

export const setCachedQuote = (key: string, result: AggregatorQuoteResult | null): void => {
  quoteCache.set(key, { result, cachedAt: Date.now() });
};

export const clearQuoteCache = (): void => {
  quoteCache.clear();
};
