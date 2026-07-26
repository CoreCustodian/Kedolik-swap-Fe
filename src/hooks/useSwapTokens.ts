import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useRemoteTokens } from './useRemoteTokens';
import { TokenInfo } from '../config/tokens';
import { getJupiterTrendingTokens, isJupiterEnabled, searchJupiterTokens } from '../utils/jupiter';
import { getOkxTokenList, isOkxEnabled, searchOkxTokens } from '../utils/okx';
import { isAnyAggregatorEnabled } from '../utils/aggregatorRouter';

const TRENDING_CACHE_MS = 60 * 60 * 1000;

let aggregatorCache: { tokens: TokenInfo[]; timestamp: number } | null = null;

/**
 * Swap token list: Kedolik remote config + Jupiter + OKX aggregator tokens.
 */
export function useSwapTokens() {
  const remote = useRemoteTokens('swap');
  const [aggregatorTokens, setAggregatorTokens] = useState<TokenInfo[]>([]);
  const [isLoadingAggregators, setIsLoadingAggregators] = useState(false);

  useEffect(() => {
    if (!isAnyAggregatorEnabled()) return;

    const loadAggregatorTokens = async () => {
      if (aggregatorCache && Date.now() - aggregatorCache.timestamp < TRENDING_CACHE_MS) {
        setAggregatorTokens(aggregatorCache.tokens);
        return;
      }

      setIsLoadingAggregators(true);
      try {
        const [jupiterTokens, okxTokens] = await Promise.all([
          isJupiterEnabled() ? getJupiterTrendingTokens() : Promise.resolve([]),
          isOkxEnabled() ? getOkxTokenList() : Promise.resolve([]),
        ]);

        const byMint = new Map<string, TokenInfo>();
        [...jupiterTokens, ...okxTokens].forEach((token) => {
          byMint.set(token.mint.toString(), token);
        });

        const merged = Array.from(byMint.values());
        aggregatorCache = { tokens: merged, timestamp: Date.now() };
        setAggregatorTokens(merged);
      } catch (error) {
        console.error('Failed to load aggregator tokens:', error);
      } finally {
        setIsLoadingAggregators(false);
      }
    };

    loadAggregatorTokens();
  }, []);

  const mergedTokens = useMemo(() => {
    const byMint = new Map<string, TokenInfo>();
    remote.tokens.forEach((token) => byMint.set(token.mint.toString(), token));
    aggregatorTokens.forEach((token) => {
      if (!byMint.has(token.mint.toString())) {
        byMint.set(token.mint.toString(), token);
      }
    });
    return Array.from(byMint.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [remote.tokens, aggregatorTokens]);

  const searchTokens = useCallback(
    async (query: string): Promise<TokenInfo[]> => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return mergedTokens;

      const localMatches = mergedTokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(normalized) ||
          token.name.toLowerCase().includes(normalized) ||
          token.mint.toString().toLowerCase().includes(normalized)
      );

      if (!isAnyAggregatorEnabled() || normalized.length < 2) {
        return localMatches;
      }

      const [jupiterMatches, okxMatches] = await Promise.all([
        isJupiterEnabled() ? searchJupiterTokens(query) : Promise.resolve([]),
        isOkxEnabled() ? searchOkxTokens(query) : Promise.resolve([]),
      ]);

      const byMint = new Map<string, TokenInfo>();
      localMatches.forEach((token) => byMint.set(token.mint.toString(), token));
      [...jupiterMatches, ...okxMatches].forEach((token) => {
        if (!byMint.has(token.mint.toString())) {
          byMint.set(token.mint.toString(), token);
        }
      });

      return Array.from(byMint.values());
    },
    [mergedTokens]
  );

  const getTokenByMint = useCallback(
    (mint: PublicKey): TokenInfo | undefined => {
      return (
        remote.getTokenByMint(mint) ||
        mergedTokens.find((token) => token.mint.equals(mint))
      );
    },
    [remote, mergedTokens]
  );

  return {
    tokens: mergedTokens,
    remoteTokens: remote.tokens,
    aggregatorTokens,
    isLoading: remote.isLoading,
    isLoadingAggregators,
    error: remote.error,
    version: remote.version,
    refresh: remote.refresh,
    searchTokens,
    getTokenByMint,
    getScopedTokenByMint: getTokenByMint,
    jupiterEnabled: isJupiterEnabled(),
    okxEnabled: isOkxEnabled(),
    aggregatorsEnabled: isAnyAggregatorEnabled(),
  };
}

export default useSwapTokens;
