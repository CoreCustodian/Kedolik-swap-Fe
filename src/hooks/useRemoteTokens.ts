import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  fetchRemoteTokenList,
  convertRemoteToken,
  clearRemoteConfigCache,
  isRemoteTokenEnabledForScope,
} from '../config/remoteConfig';
import type { TokenListScope } from '../config/remoteConfig';
import type { TokenInfo } from '../config/tokens';

/**
 * React hook for accessing the GitHub token list.
 *
 * `tokens` is filtered for the requested scope and should be used for selectable lists.
 * `allTokens` and `getTokenByMint` keep all enabled token metadata available for display.
 */
export function useRemoteTokens(scope: TokenListScope = 'all') {
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('github-loading');

  const loadTokens = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);

      if (forceRefresh) {
        clearRemoteConfigCache();
      }

      const remoteData = await fetchRemoteTokenList();

      if (remoteData && remoteData.tokens.length > 0) {
        const enabledRemoteTokens = remoteData.tokens.filter((token) => token.enabled !== false);
        const convertedTokens = enabledRemoteTokens.map(convertRemoteToken);
        const scopedTokens = enabledRemoteTokens
          .filter((token) => isRemoteTokenEnabledForScope(token, scope))
          .map(convertRemoteToken);

        setAllTokens(convertedTokens);
        setTokens(scopedTokens);
        setVersion(remoteData.version);
        console.log(`Using remote token list v${remoteData.version} (${scope})`);
      } else {
        console.warn('GitHub token list is unavailable or empty');
        setAllTokens([]);
        setTokens([]);
        setVersion('github-unavailable');
      }
    } catch (err) {
      console.error('Error loading remote tokens:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setAllTokens([]);
      setTokens([]);
      setVersion('github-error');
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadTokens();

    const interval = setInterval(() => {
      loadTokens();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loadTokens]);

  const refresh = useCallback(() => loadTokens(true), [loadTokens]);

  const getTokenByMint = useCallback((mint: PublicKey): TokenInfo | undefined => {
    return allTokens.find((token) => token.mint.equals(mint));
  }, [allTokens]);

  const getScopedTokenByMint = useCallback((mint: PublicKey): TokenInfo | undefined => {
    return tokens.find((token) => token.mint.equals(mint));
  }, [tokens]);

  const getTokenBySymbol = useCallback((symbol: string): TokenInfo | undefined => {
    return allTokens.find((token) => token.symbol.toUpperCase() === symbol.toUpperCase());
  }, [allTokens]);

  const getScopedTokenBySymbol = useCallback((symbol: string): TokenInfo | undefined => {
    return tokens.find((token) => token.symbol.toUpperCase() === symbol.toUpperCase());
  }, [tokens]);

  return {
    tokens,
    allTokens,
    isLoading,
    error,
    version,
    scope,
    refresh,
    getTokenByMint,
    getScopedTokenByMint,
    getTokenBySymbol,
    getScopedTokenBySymbol,
  };
}

export default useRemoteTokens;
