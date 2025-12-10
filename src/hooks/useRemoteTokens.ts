import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { 
  fetchRemoteTokenList, 
  convertRemoteToken,
  clearRemoteConfigCache 
} from '../config/remoteConfig';
import { TokenInfo, DEVNET_TOKENS } from '../config/tokens';

/**
 * React hook for accessing the remote token list
 * 
 * Fetches tokens from GitHub and falls back to local tokens if unavailable.
 * 
 * Usage:
 * ```tsx
 * const { tokens, isLoading, getTokenByMint, refresh } = useRemoteTokens();
 * ```
 */
export function useRemoteTokens() {
  const [tokens, setTokens] = useState<TokenInfo[]>(Object.values(DEVNET_TOKENS));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('local');

  const loadTokens = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (forceRefresh) {
        clearRemoteConfigCache();
      }
      
      const remoteData = await fetchRemoteTokenList();
      
      if (remoteData && remoteData.tokens.length > 0) {
        // Convert remote tokens to local format
        const convertedTokens: TokenInfo[] = remoteData.tokens
          .filter(t => t.enabled !== false) // Filter out disabled tokens
          .map(convertRemoteToken);
        
        setTokens(convertedTokens);
        setVersion(remoteData.version);
        console.log(`📋 Using remote token list v${remoteData.version}`);
      } else {
        // Fallback to local tokens
        console.log('📋 Using local fallback token list');
        setTokens(Object.values(DEVNET_TOKENS));
        setVersion('local-fallback');
      }
    } catch (err) {
      console.error('Error loading remote tokens:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Keep using local tokens on error
      setTokens(Object.values(DEVNET_TOKENS));
      setVersion('local-error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
    
    // Refresh tokens every 10 minutes
    const interval = setInterval(() => {
      loadTokens();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loadTokens]);

  const refresh = useCallback(() => loadTokens(true), [loadTokens]);

  const getTokenByMint = useCallback((mint: PublicKey): TokenInfo | undefined => {
    return tokens.find(token => token.mint.equals(mint));
  }, [tokens]);

  const getTokenBySymbol = useCallback((symbol: string): TokenInfo | undefined => {
    return tokens.find(token => token.symbol.toUpperCase() === symbol.toUpperCase());
  }, [tokens]);

  return {
    tokens,
    isLoading,
    error,
    version,
    refresh,
    getTokenByMint,
    getTokenBySymbol,
  };
}

export default useRemoteTokens;

