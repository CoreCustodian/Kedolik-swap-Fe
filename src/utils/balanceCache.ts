import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, unpackAccount } from '@solana/spl-token';
import { getTokenBalance, isNativeSOL } from './amm';

/**
 * Parse token amount from RPC response (handles null uiAmount).
 */
export const parseTokenAmount = (value: {
  uiAmount: number | null;
  uiAmountString?: string;
  amount: string;
  decimals: number;
}): number => {
  if (value.uiAmount != null && Number.isFinite(value.uiAmount)) {
    return value.uiAmount;
  }
  if (value.uiAmountString) {
    const parsed = parseFloat(value.uiAmountString);
    if (Number.isFinite(parsed)) return parsed;
  }
  try {
    return Number(value.amount) / Math.pow(10, value.decimals);
  } catch {
    return 0;
  }
};

/** Format a token balance for display (mobile-friendly, avoids misleading .00 for small amounts). */
export const formatTokenBalance = (balance: number, symbol?: string): string => {
  if (!Number.isFinite(balance) || balance <= 0) {
    return symbol ? `0 ${symbol}` : '0';
  }

  let formatted: string;
  if (balance >= 1_000_000) {
    formatted = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else if (balance >= 1_000) {
    formatted = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else if (balance >= 1) {
    formatted = balance.toFixed(4).replace(/\.?0+$/, '');
  } else if (balance >= 0.0001) {
    formatted = balance.toFixed(6).replace(/\.?0+$/, '');
  } else {
    formatted = balance.toExponential(2);
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
};


interface BalanceCacheEntry {
  balance: number;
  timestamp: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();
const BALANCE_CACHE_TTL = 120_000; // 2 min — invalidated by WS + swap/stake events
const BALANCE_DEBOUNCE_MS = 500;

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
  requests: Array<{ mint: PublicKey; wallet: PublicKey }>,
): Promise<Map<string, number>> => {
  const results = new Map<string, number>();
  const now = Date.now();
  const pending: Array<{ mint: PublicKey; wallet: PublicKey; cacheKey: string }> = [];

  for (const { mint, wallet } of requests) {
    const cacheKey = `${mint.toString()}-${wallet.toString()}`;
    const cached = balanceCache.get(cacheKey);
    if (cached && now - cached.timestamp < BALANCE_CACHE_TTL) {
      results.set(cacheKey, cached.balance);
      continue;
    }
    pending.push({ mint, wallet, cacheKey });
  }

  if (pending.length === 0) {
    return results;
  }

  const solPending = pending.filter(({ mint }) => isNativeSOL(mint));
  const splPending = pending.filter(({ mint }) => !isNativeSOL(mint));

  await Promise.all(
    solPending.map(async ({ wallet, cacheKey }) => {
      const lamports = await connection.getBalance(wallet, 'confirmed');
      const balance = lamports / 1e9;
      balanceCache.set(cacheKey, { balance, timestamp: Date.now() });
      results.set(cacheKey, balance);
    }),
  );

  if (splPending.length === 0) {
    return results;
  }

  const ataEntries = splPending.map((entry) => {
    const ata = getAssociatedTokenAddressSync(entry.mint, entry.wallet);
    return { ...entry, ata };
  });

  const uniqueMints = [...new Map(splPending.map((e) => [e.mint.toString(), e.mint])).values()];
  const mintDecimals = new Map<string, number>();
  for (let i = 0; i < uniqueMints.length; i += 100) {
    const chunk = uniqueMints.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk, 'confirmed');
    chunk.forEach((mint, index) => {
      const data = infos[index]?.data;
      let decimals = 9;
      if (data && data.length >= 45) {
        decimals = data[44];
      }
      mintDecimals.set(mint.toString(), decimals);
    });
  }

  for (let i = 0; i < ataEntries.length; i += 100) {
    const chunk = ataEntries.slice(i, i + 100);
    const accounts = await connection.getMultipleAccountsInfo(
      chunk.map((entry) => entry.ata),
      'confirmed',
    );

    chunk.forEach((entry, index) => {
      const account = accounts[index];
      let balance = 0;
      if (account?.data) {
        try {
          const unpacked = unpackAccount(entry.ata, account);
          const decimals = mintDecimals.get(entry.mint.toString()) ?? 9;
          balance = Number(unpacked.amount) / Math.pow(10, decimals);
        } catch {
          balance = 0;
        }
      }
      balanceCache.set(entry.cacheKey, { balance, timestamp: Date.now() });
      results.set(entry.cacheKey, balance);
    });
  }

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

