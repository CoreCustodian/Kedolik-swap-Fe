import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { getTokenAccounts, getSolBalance, getTransactionHistory } from '../utils/solana';
import { getTokenPrices, getTokenMetadata } from '../utils/prices';
import { SOL_MINT } from '../config/addresses';
import { onRefreshEvent, REFRESH_EVENTS } from '../utils/refreshEvents';
import { isPageVisible } from '../utils/visibilityControl';

interface Transaction {
  id: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: number;
  signature: string;
  status: 'success' | 'failed' | 'pending';
}

interface Asset {
  symbol: string;
  name: string;
  balance: string;
  valueUsd: string;
  change24h: number;
  logo?: string;
}

interface UserData {
  totalValue: string;
  totalPnL: number;
  pnl24h: number;
  assets: Asset[];
  recentTransactions: Transaction[];
}

interface UserContextType {
  userData: UserData | null;
  isLoading: boolean;
  refreshUserData: () => Promise<void>;
}

const MIN_REFRESH_INTERVAL_MS = 20_000;
const TX_HISTORY_TTL_MS = 2 * 60 * 1000;

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const txCacheRef = useRef<{ transactions: Transaction[]; fetchedAt: number } | null>(null);

  const fetchUserData = useCallback(async (force = false) => {
    if (!publicKey || !connected) {
      setUserData(null);
      hasLoadedRef.current = false;
      return;
    }

    if (!force && hasLoadedRef.current) {
      return;
    }

    if (!isPageVisible()) {
      return;
    }

    // Refresh events (swap/stake/balance) can arrive in bursts; a forced refresh
    // still has to respect this floor so one swap isn't worth many portfolio scans.
    if (Date.now() - lastFetchAtRef.current < MIN_REFRESH_INTERVAL_MS) {
      return;
    }

    if (inflightRef.current) {
      return inflightRef.current;
    }

    lastFetchAtRef.current = Date.now();
    setIsLoading(true);

    const run = async () => {
      try {
      // Fetch data directly from blockchain - NO SERVER NEEDED!
      // Uses connection from wallet context (which can use wallet's RPC endpoint)
      
      // 1. Get SOL balance
      const solBalance = await getSolBalance(connection, publicKey);
      
      // 2. Get all SPL token accounts
      const tokenAccounts = await getTokenAccounts(connection, publicKey);
      
      // 3. Get prices for all tokens (Jupiter API - free!)
      const allMints = [SOL_MINT.toString(), ...tokenAccounts.map(t => t.mint)];
      const prices = await getTokenPrices(allMints);
      
      // 4. Build assets list
      const assets: Asset[] = [];
      
      // Add SOL
      const solPrice = prices.get(SOL_MINT.toString()) || 0;
      const solValue = solBalance * solPrice;
      assets.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: solBalance.toFixed(4),
        valueUsd: solValue.toFixed(2),
        change24h: 0, // Can fetch from CoinGecko if needed
        logo: `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${SOL_MINT.toString()}/logo.png`
      });
      
      // Add SPL tokens
      for (const token of tokenAccounts) {
        if (token.balance > 0) {
          const price = prices.get(token.mint) || 0;
          const value = token.balance * price;
          
          // Get token metadata from Jupiter
          const metadata = await getTokenMetadata(token.mint);
          
          assets.push({
            symbol: metadata?.symbol || token.mint.slice(0, 4),
            name: metadata?.name || 'Unknown Token',
            balance: token.balance.toFixed(4),
            valueUsd: value.toFixed(2),
            change24h: 0,
            logo: metadata?.logoURI
          });
        }
      }
      
      // 5. Calculate total portfolio value
      const totalValue = assets.reduce((sum, asset) => {
        return sum + parseFloat(asset.valueUsd);
      }, 0);
      
      // 6. Get transaction history (directly from blockchain!)
      // getSignaturesForAddress is one of the priciest calls, so it gets its own
      // longer TTL rather than riding along with every balance refresh.
      const txCache = txCacheRef.current;
      let recentTransactions: Transaction[];

      if (txCache && Date.now() - txCache.fetchedAt < TX_HISTORY_TTL_MS) {
        recentTransactions = txCache.transactions;
      } else {
        const signatures = await getTransactionHistory(connection, publicKey, 20);
        recentTransactions = signatures.map((sig) => ({
          id: sig.signature,
          type: 'swap' as const,
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: '0.0',
          amountOut: '0.0',
          timestamp: (sig.blockTime || 0) * 1000,
          signature: sig.signature,
          status: sig.err ? ('failed' as const) : ('success' as const),
        }));
        txCacheRef.current = { transactions: recentTransactions, fetchedAt: Date.now() };
      }
      
      // 7. Set user data
      setUserData({
        totalValue: totalValue.toFixed(2),
        totalPnL: 0,
        pnl24h: 0,
        assets: assets.filter(a => parseFloat(a.valueUsd) > 0.01),
        recentTransactions: recentTransactions.slice(0, 10)
      });
      hasLoadedRef.current = true;
      
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserData({
          totalValue: '0.00',
          totalPnL: 0,
          pnl24h: 0,
          assets: [],
          recentTransactions: []
        });
      } finally {
        setIsLoading(false);
        inflightRef.current = null;
      }
    };

    inflightRef.current = run();
    return inflightRef.current;
  }, [publicKey, connected, connection]);

  useEffect(() => {
    hasLoadedRef.current = false;
    lastFetchAtRef.current = 0;
    txCacheRef.current = null;
    void fetchUserData(true);
  }, [publicKey, connected, connection, fetchUserData]);

  useEffect(() => {
    const stopBalance = onRefreshEvent(REFRESH_EVENTS.BALANCES, () => {
      hasLoadedRef.current = false;
      void fetchUserData(true);
    });
    const stopSwap = onRefreshEvent(REFRESH_EVENTS.SWAP_SUCCESS, () => {
      hasLoadedRef.current = false;
      void fetchUserData(true);
    });
    return () => {
      stopBalance();
      stopSwap();
    };
  }, [fetchUserData]);

  // Explicit user action, so it clears the rate-limit floor first.
  const refreshUserData = async () => {
    hasLoadedRef.current = false;
    lastFetchAtRef.current = 0;
    txCacheRef.current = null;
    await fetchUserData(true);
  };

  return (
    <UserContext.Provider value={{ userData, isLoading, refreshUserData }}>
      {children}
    </UserContext.Provider>
  );
};

