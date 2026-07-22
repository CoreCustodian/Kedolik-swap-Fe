import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useRemoteTokens } from './useRemoteTokens';
import { TokenInfo } from '../config/tokens';
import { getJupiterTrendingTokens, isJupiterEnabled, searchJupiterTokens } from '../utils/jupiter';

const TRENDING_CACHE_MS = 60 * 60 * 1000;

let trendingCache: { tokens: TokenInfo[]; timestamp: number } | null = null;

/**
 * Swap token list: Kedolik remote config + Jupiter trending/search tokens.
 */
export function useSwapTokens() {
  const remote = useRemoteTokens('swap');
  const [jupiterTokens, setJupiterTokens] = useState<TokenInfo[]>([]);
  const [isLoadingJupiter, setIsLoadingJupiter] = useState(false);

  useEffect(() => {
    if (!isJupiterEnabled()) return;

    const loadTrending = async () => {
      if (trendingCache && Date.now() - trendingCache.timestamp < TRENDING_CACHE_MS) {
        setJupiterTokens(trendingCache.tokens);
        return;
      }

      setIsLoadingJupiter(true);
      try {
        const trending = await getJupiterTrendingTokens();
        trendingCache = { tokens: trending, timestamp: Date.now() };
        setJupiterTokens(trending);
      } catch (error) {
        console.error('Failed to load Jupiter trending tokens:', error);
      } finally {
        setIsLoadingJupiter(false);
      }
    };

    loadTrending();
  }, []);

  const mergedTokens = useMemo(() => {
    const byMint = new Map<string, TokenInfo>();
    remote.tokens.forEach((token) => byMint.set(token.mint.toString(), token));
    jupiterTokens.forEach((token) => {
      if (!byMint.has(token.mint.toString())) {
        byMint.set(token.mint.toString(), token);
      }
    });
    return Array.from(byMint.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [remote.tokens, jupiterTokens]);

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

      if (!isJupiterEnabled() || normalized.length < 2) {
        return localMatches;
      }

      const jupiterMatches = await searchJupiterTokens(query);
      const byMint = new Map<string, TokenInfo>();
      localMatches.forEach((token) => byMint.set(token.mint.toString(), token));
      jupiterMatches.forEach((token) => {
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
    jupiterTokens,
    isLoading: remote.isLoading,
    isLoadingJupiter,
    error: remote.error,
    version: remote.version,
    refresh: remote.refresh,
    searchTokens,
    getTokenByMint,
    getScopedTokenByMint: getTokenByMint,
    jupiterEnabled: isJupiterEnabled(),
  };
}

export default useSwapTokens;
