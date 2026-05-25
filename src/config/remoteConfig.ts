import { PublicKey } from '@solana/web3.js';

/**
 * Remote Configuration System
 * 
 * Fetches token list and feature flags from GitHub for easy updates
 * without requiring code changes or redeployment.
 * 
 * GitHub Raw URLs:
 * - Token List: https://raw.githubusercontent.com/{owner}/{repo}/main/config/tokens.json
 * - Feature Flags: https://raw.githubusercontent.com/{owner}/{repo}/main/config/features.json
 */

// ============================================================================
// CONFIGURATION - KEDOLIK SWAP GITHUB CONFIG
// ============================================================================

// Using raw.githubusercontent.com - add timestamp to each request to bypass browser cache
const BASE_URL = 'https://raw.githubusercontent.com/KedolikSwap/config/refs/heads/main';

// These are base URLs - timestamp will be added at fetch time
export const REMOTE_URLS = {
  tokenList: `${BASE_URL}/tokens.json`,
  featureFlags: `${BASE_URL}/features.json`,
};

// Cache duration in milliseconds (0 = always fetch fresh)
const CACHE_DURATION = 0;

// ============================================================================
// TYPES
// ============================================================================

export type TokenDisplayScope = 'swap' | 'pools' | 'staking' | 'locker';
export type TokenListScope = TokenDisplayScope | 'all';

export interface RemoteTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
  enabled?: boolean; // Optional: can disable specific tokens
  display?: Partial<Record<TokenDisplayScope, boolean>>;
  lists?: TokenListScope[];
  showOnSwap?: boolean;
  showOnPools?: boolean;
  showOnStaking?: boolean;
  showOnLocker?: boolean;
}

export interface TokenListResponse {
  version: string;
  lastUpdated: string;
  tokens: RemoteTokenInfo[];
}

export interface FeatureFlags {
  swapEnabled: boolean;
  poolsEnabled: boolean;
  liquidityEnabled: boolean;
  maintenanceMode: boolean;
  kedolikDevnetEnabled?: boolean;
  maintenanceMessage?: string;
  announcementBanner?: {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
  };
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache: {
  tokens?: CacheEntry<TokenListResponse>;
  features?: CacheEntry<FeatureFlags>;
} = {};

function isCacheValid<T>(entry?: CacheEntry<T>): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

// ============================================================================
// DEFAULT VALUES (Fallback if GitHub is unreachable)
// ============================================================================

// Default flags - used as fallback if GitHub is unreachable
// Set conservative defaults (enabled) since we don't want to block users
// if there's a network issue fetching config
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  swapEnabled: true,
  poolsEnabled: true,
  liquidityEnabled: true,
  maintenanceMode: false,
  kedolikDevnetEnabled: true,
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

/**
 * Fetch token list from GitHub
 */
export async function fetchRemoteTokenList(): Promise<TokenListResponse | null> {
  // Check cache first
  if (isCacheValid(cache.tokens)) {
    console.log('📋 Using cached token list');
    return cache.tokens!.data;
  }

  try {
    // Add timestamp to bypass browser cache
    const url = `${REMOTE_URLS.tokenList}?_=${Date.now()}`;
    console.log('🌐 Fetching token list from:', url);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: TokenListResponse = await response.json();
    
    // Validate the response
    if (!data.tokens || !Array.isArray(data.tokens)) {
      throw new Error('Invalid token list format');
    }

    // Cache the result
    cache.tokens = {
      data,
      timestamp: Date.now(),
    };

    console.log(`✅ Loaded ${data.tokens.length} tokens from GitHub (v${data.version})`);
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch remote token list:', error);
    return null;
  }
}

export function isRemoteTokenEnabledForScope(
  token: RemoteTokenInfo,
  scope: TokenListScope = 'all'
): boolean {
  if (token.enabled === false) {
    return false;
  }

  if (scope === 'all') {
    return true;
  }

  if (Array.isArray(token.lists)) {
    return token.lists.includes('all') || token.lists.includes(scope);
  }

  if (token.display) {
    return token.display[scope] === true;
  }

  const legacyFlags = {
    swap: token.showOnSwap,
    pools: token.showOnPools,
    staking: token.showOnStaking,
    locker: token.showOnLocker,
  };

  const hasLegacyScopeFlags = Object.values(legacyFlags).some((value) => value !== undefined);
  if (hasLegacyScopeFlags) {
    return legacyFlags[scope] === true;
  }

  return true;
}

/**
 * Fetch feature flags from GitHub
 */
export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  // Check cache first
  if (isCacheValid(cache.features)) {
    console.log('🎛️ Using cached feature flags');
    return cache.features!.data;
  }

  try {
    // Add timestamp to bypass browser cache
    const url = `${REMOTE_URLS.featureFlags}?_=${Date.now()}`;
    console.log('🌐 Fetching feature flags from:', url);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: FeatureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...(await response.json()),
    };

    // Cache the result
    cache.features = {
      data,
      timestamp: Date.now(),
    };

    console.log('✅ Feature flags from GitHub:', JSON.stringify(data));
    console.log('   swapEnabled:', data.swapEnabled);
    console.log('   poolsEnabled:', data.poolsEnabled);
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch feature flags:', error);
    console.error('   URL was:', REMOTE_URLS.featureFlags);
    console.error('   Using defaults instead');
    return DEFAULT_FEATURE_FLAGS;
  }
}

/**
 * Clear the cache (useful for forcing a refresh)
 */
export function clearRemoteConfigCache(): void {
  cache.tokens = undefined;
  cache.features = undefined;
  console.log('🗑️ Remote config cache cleared');
}

/**
 * Convert remote token info to local format with PublicKey
 */
export function convertRemoteToken(token: RemoteTokenInfo): {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
} {
  return {
    mint: new PublicKey(token.mint),
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    logoURI: token.logoURI,
    coingeckoId: token.coingeckoId,
  };
}

