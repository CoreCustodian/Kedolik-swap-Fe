import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { getTokenAccounts, getSolBalance, getTransactionHistory } from '../utils/solana';
import { getTokenPrices, getTokenMetadata } from '../utils/prices';
import { SOL_MINT } from '../config/addresses';

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
  const { connection } = useConnection();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserData = async () => {
    if (!publicKey || !connected) {
      setUserData(null);
      return;
    }

    setIsLoading(true);
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
      const signatures = await getTransactionHistory(connection, publicKey, 20);
      const recentTransactions: Transaction[] = signatures.map((sig) => ({
        id: sig.signature,
        type: 'swap', // You can parse this from transaction details
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: '0.0',
        amountOut: '0.0',
        timestamp: (sig.blockTime || 0) * 1000,
        signature: sig.signature,
        status: sig.err ? 'failed' : 'success'
      }));
      
      // 7. Set user data
      setUserData({
        totalValue: totalValue.toFixed(2),
        totalPnL: 0, // Calculate based on historical data if needed
        pnl24h: 0, // Can be calculated from 24h old snapshot
        assets: assets.filter(a => parseFloat(a.valueUsd) > 0.01), // Filter out dust
        recentTransactions: recentTransactions.slice(0, 10)
      });
      
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Fallback to mock data if blockchain fetch fails
      setUserData({
        totalValue: '0.00',
        totalPnL: 0,
        pnl24h: 0,
        assets: [],
        recentTransactions: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [publicKey, connected, connection]);

  const refreshUserData = async () => {
    await fetchUserData();
  };

  return (
    <UserContext.Provider value={{ userData, isLoading, refreshUserData }}>
      {children}
    </UserContext.Provider>
  );
};

