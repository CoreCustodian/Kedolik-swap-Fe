import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useRemoteTokens } from './useRemoteTokens';
import { TokenInfo } from '../config/tokens';
import { getJupiterTrendingTokens, isJupiterEnabled, searchJupiterTokens } from '../utils/jupiter';
import { getOkxTokenList, isOkxEnabled, searchOkxTokens } from '../utils/okx';
import { isAnyAggregatorEnabled } from '../utils/aggregatorRouter';
import {
  createMintPlaceholder,
  isValidMintAddress,
  resolveTokenFromMint,
} from '../utils/tokenMetadata';

const TRENDING_CACHE_MS = 60 * 60 * 1000;

let aggregatorCache: { tokens: TokenInfo[]; timestamp: number } | null = null;

// Tokens the user has actually interacted with (selected, looked up, or swapped
// into) are persisted so they stay resolvable after a page refresh. Without this
// a token that isn't in the default/trending lists would show as a truncated
// address and vanish from the picker once the in-memory state is wiped.
const REMEMBERED_TOKENS_KEY = 'kedolik-remembered-tokens';
const MAX_PERSISTED_TOKENS = 100;

interface StoredTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// A placeholder is a token we haven't resolved real metadata for yet.
const isPlaceholderToken = (token: TokenInfo): boolean =>
  !token || !token.symbol || token.name === 'Loading token...';

const loadPersistedTokens = (): TokenInfo[] => {
  try {
    const raw = localStorage.getItem(REMEMBERED_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTokenInfo[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.mint === 'string')
      .map((entry) => ({
        mint: new PublicKey(entry.mint),
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
        logoURI: entry.logoURI,
      }));
  } catch {
    return [];
  }
};

// Read-modify-write so we only ever persist user-driven single tokens, never the
// bulk trending list (which reloads on its own and would bloat localStorage).
const addPersistedToken = (token: TokenInfo): void => {
  try {
    // Don't persist unresolved placeholders — they'd just show junk after reload.
    if (isPlaceholderToken(token)) return;
    const mintStr = token.mint.toString();
    const existing = loadPersistedTokens();
    if (existing.some((entry) => entry.mint.toString() === mintStr)) return;
    const next: StoredTokenInfo[] = [
      ...existing.map((entry) => ({
        mint: entry.mint.toString(),
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
        logoURI: entry.logoURI,
      })),
      {
        mint: mintStr,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
      },
    ].slice(-MAX_PERSISTED_TOKENS);
    localStorage.setItem(REMEMBERED_TOKENS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode errors
  }
};

/**
 * Swap token list: Kedolik remote config + Jupiter + OKX aggregator tokens.
 */
export function useSwapTokens() {
  const { connection } = useConnection();
  const remote = useRemoteTokens('swap');
  const [aggregatorTokens, setAggregatorTokens] = useState<TokenInfo[]>([]);
  const [isLoadingAggregators, setIsLoadingAggregators] = useState(false);
  const [rememberedTokens, setRememberedTokens] = useState<TokenInfo[]>(() =>
    loadPersistedTokens()
  );

  const rememberToken = useCallback((token: TokenInfo) => {
    // Never remember an unresolved placeholder — it would shadow the real token
    // once the aggregator/remote lists load and leave it stuck as "Loading token…".
    if (isPlaceholderToken(token)) return;
    // User-driven addition — persist it so it survives a refresh.
    addPersistedToken(token);
    setRememberedTokens((prev) => {
      if (prev.some((entry) => entry.mint.equals(token.mint))) return prev;
      return [...prev, token];
    });
  }, []);

  const rememberTokens = useCallback((tokensToRemember: TokenInfo[]) => {
    setRememberedTokens((prev) => {
      const byMint = new Map(prev.map((token) => [token.mint.toString(), token]));
      let changed = false;
      tokensToRemember.forEach((token) => {
        if (isPlaceholderToken(token)) return;
        const key = token.mint.toString();
        if (!byMint.has(key)) {
          byMint.set(key, token);
          changed = true;
        }
      });
      return changed ? Array.from(byMint.values()) : prev;
    });
  }, []);

  useEffect(() => {
    if (!isAnyAggregatorEnabled()) return;

    const loadAggregatorTokens = async () => {
      if (aggregatorCache && Date.now() - aggregatorCache.timestamp < TRENDING_CACHE_MS) {
        setAggregatorTokens(aggregatorCache.tokens);
        rememberTokens(aggregatorCache.tokens);
        return;
      }

      setIsLoadingAggregators(true);
      try {
        const jupiterTokens = isJupiterEnabled()
          ? await getJupiterTrendingTokens()
          : [];
        const okxTokens =
          isOkxEnabled() && jupiterTokens.length === 0
            ? await getOkxTokenList()
            : [];

        const byMint = new Map<string, TokenInfo>();
        [...jupiterTokens, ...okxTokens].forEach((token) => {
          byMint.set(token.mint.toString(), token);
        });

        const merged = Array.from(byMint.values());
        aggregatorCache = { tokens: merged, timestamp: Date.now() };
        setAggregatorTokens(merged);
        rememberTokens(merged);
      } catch (error) {
        console.error('Failed to load aggregator tokens:', error);
      } finally {
        setIsLoadingAggregators(false);
      }
    };

    loadAggregatorTokens();
  }, [rememberTokens]);

  const mergedTokens = useMemo(() => {
    const byMint = new Map<string, TokenInfo>();
    remote.tokens.forEach((token) => byMint.set(token.mint.toString(), token));
    aggregatorTokens.forEach((token) => {
      if (!byMint.has(token.mint.toString())) {
        byMint.set(token.mint.toString(), token);
      }
    });
    rememberedTokens.forEach((token) => {
      if (!byMint.has(token.mint.toString())) {
        byMint.set(token.mint.toString(), token);
      }
    });
    return Array.from(byMint.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [remote.tokens, aggregatorTokens, rememberedTokens]);

  const getTokenByMint = useCallback(
    (mint: PublicKey): TokenInfo | undefined => {
      return (
        remote.getTokenByMint(mint) ||
        rememberedTokens.find((token) => token.mint.equals(mint)) ||
        aggregatorTokens.find((token) => token.mint.equals(mint)) ||
        remote.tokens.find((token) => token.mint.equals(mint))
      );
    },
    [remote, rememberedTokens, aggregatorTokens]
  );

  const lookupTokenByMint = useCallback(
    async (mintStr: string): Promise<TokenInfo | null> => {
      const trimmed = mintStr.trim();
      if (!trimmed || !isValidMintAddress(trimmed)) return null;

      const mint = new PublicKey(trimmed);
      const existing = getTokenByMint(mint);
      if (existing && existing.name !== 'Loading token...') return existing;

      if (isAnyAggregatorEnabled()) {
        const [jupiterMatches, okxMatches] = await Promise.all([
          isJupiterEnabled() ? searchJupiterTokens(trimmed) : Promise.resolve([]),
          isOkxEnabled() ? searchOkxTokens(trimmed) : Promise.resolve([]),
        ]);

        const match =
          [...jupiterMatches, ...okxMatches].find((token) => token.mint.toString() === trimmed) ??
          jupiterMatches[0] ??
          okxMatches[0];

        if (match) {
          rememberToken(match);
          return match;
        }
      }

      const onChain = await resolveTokenFromMint(connection, trimmed);
      if (onChain) {
        rememberToken(onChain);
        return onChain;
      }

      return existing ?? createMintPlaceholder(trimmed);
    },
    [connection, getTokenByMint, rememberToken]
  );

  const searchTokens = useCallback(
    async (query: string): Promise<TokenInfo[]> => {
      const trimmed = query.trim();
      const normalized = trimmed.toLowerCase();
      if (!normalized) return mergedTokens;

      const localMatches = mergedTokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(normalized) ||
          token.name.toLowerCase().includes(normalized) ||
          token.mint.toString().toLowerCase().includes(normalized)
      );

      const mintQuery = isValidMintAddress(trimmed);
      if (!mintQuery && normalized.length < 2) {
        return localMatches;
      }

      const byMint = new Map<string, TokenInfo>();
      localMatches.forEach((token) => byMint.set(token.mint.toString(), token));

      if (isAnyAggregatorEnabled()) {
        const [jupiterMatches, okxMatches] = await Promise.all([
          isJupiterEnabled() ? searchJupiterTokens(trimmed) : Promise.resolve([]),
          isOkxEnabled() ? searchOkxTokens(trimmed) : Promise.resolve([]),
        ]);
        [...jupiterMatches, ...okxMatches].forEach((token) => {
          byMint.set(token.mint.toString(), token);
        });
      }

      if (mintQuery && !byMint.has(trimmed)) {
        const onChain = await resolveTokenFromMint(connection, trimmed);
        if (onChain) {
          byMint.set(trimmed, onChain);
        } else {
          const placeholder = createMintPlaceholder(trimmed);
          if (placeholder) byMint.set(trimmed, placeholder);
        }
      }

      const results = Array.from(byMint.values());
      rememberTokens(results);
      return results;
    },
    [connection, mergedTokens, rememberTokens]
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
    lookupTokenByMint,
    rememberToken,
    getScopedTokenByMint: getTokenByMint,
    jupiterEnabled: isJupiterEnabled(),
    okxEnabled: isOkxEnabled(),
    aggregatorsEnabled: isAnyAggregatorEnabled(),
  };
}

export default useSwapTokens;
