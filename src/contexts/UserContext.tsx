import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserData = async () => {
    if (!publicKey || !connected) {
      setUserData(null);
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Replace with actual API calls to fetch user data
      // This is mock data for demonstration
      const mockData: UserData = {
        totalValue: '12,456.78',
        totalPnL: 15.4,
        pnl24h: 3.2,
        assets: [
          {
            symbol: 'SOL',
            name: 'Solana',
            balance: '45.23',
            valueUsd: '4,523.00',
            change24h: 5.6,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            balance: '5,234.56',
            valueUsd: '5,234.56',
            change24h: 0.01,
          },
          {
            symbol: 'RAY',
            name: 'Raydium',
            balance: '234.89',
            valueUsd: '1,234.56',
            change24h: -2.3,
          },
          {
            symbol: 'BONK',
            name: 'Bonk',
            balance: '1,234,567',
            valueUsd: '789.23',
            change24h: 12.8,
          },
        ],
        recentTransactions: [
          {
            id: '1',
            type: 'swap',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amountIn: '10.5',
            amountOut: '245.67',
            timestamp: Date.now() - 120000,
            signature: '5xJ8...9k4L',
            status: 'success',
          },
          {
            id: '2',
            type: 'add_liquidity',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amountIn: '5.0',
            amountOut: '117.50',
            timestamp: Date.now() - 3600000,
            signature: '3hG7...2m8N',
            status: 'success',
          },
          {
            id: '3',
            type: 'swap',
            tokenIn: 'USDC',
            tokenOut: 'RAY',
            amountIn: '500.00',
            amountOut: '95.43',
            timestamp: Date.now() - 7200000,
            signature: '9pF4...7k1M',
            status: 'success',
          },
        ],
      };

      setUserData(mockData);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [publicKey, connected]);

  const refreshUserData = async () => {
    await fetchUserData();
  };

  return (
    <UserContext.Provider value={{ userData, isLoading, refreshUserData }}>
      {children}
    </UserContext.Provider>
  );
};

