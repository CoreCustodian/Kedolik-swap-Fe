import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenBalance } from './amm';

/**
 * Balance cache to reduce RPC calls
 * Caches token balances with TTL to prevent excessive requests
 */

interface BalanceCacheEntry {
  balance: number;
  timestamp: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();
const BALANCE_CACHE_TTL = 10000; // 10 seconds cache
const BALANCE_DEBOUNCE_MS = 500; // 500ms debounce

// Track pending requests to prevent duplicate fetches
const pendingRequests = new Map<string, Promise<number>>();

/**
 * Get cached balance or fetch from RPC
 * @param connection Solana connection
 * @param mint Token mint address
 * @param wallet Wallet public key
 * @param forceRefresh Force refresh even if cache is valid
 * @returns Token balance
 */
export const getCachedBalance = async (
  connection: Connection,
  mint: PublicKey,
  wallet: PublicKey,
  forceRefresh: boolean = false
): Promise<number> => {
  const cacheKey = `${mint.toString()}-${wallet.toString()}`;
  const now = Date.now();
  
  // Return cached balance if still valid
  const cached = balanceCache.get(cacheKey);
  if (!forceRefresh && cached && (now - cached.timestamp) < BALANCE_CACHE_TTL) {
    return cached.balance;
  }
  
  // Return pending request if one exists
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }
  
  // Create new request
  const request = getTokenBalance(connection, mint, wallet)
    .then((balance) => {
      // Cache the result
      balanceCache.set(cacheKey, {
        balance,
        timestamp: Date.now(),
      });
      // Remove from pending
      pendingRequests.delete(cacheKey);
      return balance;
    })
    .catch((error) => {
      // Remove from pending on error
      pendingRequests.delete(cacheKey);
      throw error;
    });
  
  pendingRequests.set(cacheKey, request);
  return request;
};

/**
 * Batch fetch multiple balances efficiently
 * @param connection Solana connection
 * @param requests Array of {mint, wallet} pairs
 * @returns Map of cacheKey -> balance
 */
export const batchGetBalances = async (
  connection: Connection,
  requests: Array<{ mint: PublicKey; wallet: PublicKey }>
): Promise<Map<string, number>> => {
  const results = new Map<string, number>();
  
  // Fetch all balances in parallel
  const promises = requests.map(async ({ mint, wallet }) => {
    const cacheKey = `${mint.toString()}-${wallet.toString()}`;
    try {
      const balance = await getCachedBalance(connection, mint, wallet);
      results.set(cacheKey, balance);
    } catch (error) {
      console.error(`Error fetching balance for ${mint.toString()}:`, error);
      results.set(cacheKey, 0);
    }
  });
  
  await Promise.all(promises);
  return results;
};

/**
 * Clear balance cache for a specific wallet
 * @param wallet Wallet public key (optional, clears all if not provided)
 */
export const clearBalanceCache = (wallet?: PublicKey): void => {
  if (wallet) {
    // Clear only entries for this wallet
    const walletStr = wallet.toString();
    for (const key of balanceCache.keys()) {
      if (key.endsWith(walletStr)) {
        balanceCache.delete(key);
      }
    }
  } else {
    // Clear all cache
    balanceCache.clear();
  }
  pendingRequests.clear();
};

/**
 * Debounce function to prevent rapid successive calls
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Debounced balance fetcher
 * Use this in useEffect hooks to prevent excessive calls
 */
export const createDebouncedBalanceFetcher = (
  connection: Connection,
  callback: (balances: Map<string, number>) => void,
  wait: number = BALANCE_DEBOUNCE_MS
) => {
  let pendingRequests: Array<{ mint: PublicKey; wallet: PublicKey }> = [];
  let timeout: NodeJS.Timeout | null = null;
  
  return (mint: PublicKey, wallet: PublicKey) => {
    // Add to pending requests
    pendingRequests.push({ mint, wallet });
    
    // Clear existing timeout
    if (timeout) {
      clearTimeout(timeout);
    }
    
    // Set new timeout
    timeout = setTimeout(async () => {
      const requests = [...pendingRequests];
      pendingRequests = [];
      
      const results = await batchGetBalances(connection, requests);
      callback(results);
    }, wait);
  };
};

