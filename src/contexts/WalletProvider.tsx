import { FC, ReactNode, useMemo, useCallback } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

// Inner component that has access to wallet context
const ConnectionProviderWithWalletRPC: FC<{ children: ReactNode }> = ({ children }) => {
  const { wallet } = useWallet();

  // Function to get RPC endpoint - tries wallet's RPC first, then falls back
  const getEndpoint = useCallback(() => {
    // 1. Check for custom RPC in environment variable (highest priority)
    const customEndpoint = import.meta.env.VITE_RPC_ENDPOINT;
    if (customEndpoint) {
      console.log('🌐 Using custom RPC endpoint from .env');
      return customEndpoint;
    }

    // 2. Try to use wallet's RPC endpoint if available
    // Some wallets like Phantom expose their RPC endpoint
    if (wallet?.adapter) {
      // Check if wallet adapter has an RPC endpoint property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walletAdapter = wallet.adapter as any;
      if (walletAdapter.rpcEndpoint) {
        console.log('🌐 Using wallet RPC endpoint:', walletAdapter.rpcEndpoint);
        return walletAdapter.rpcEndpoint;
      }
      
      // Phantom wallet sometimes exposes RPC through a different property
      if (walletAdapter._rpcEndpoint) {
        console.log('🌐 Using wallet RPC endpoint (internal):', walletAdapter._rpcEndpoint);
        return walletAdapter._rpcEndpoint;
      }
    }

    // 3. Fallback to PublicNode (free, reliable, no API key needed)
    console.log('🌐 Using PublicNode RPC (free, no API key required)');
    console.log('💡 Tip: Wallets like Phantom use their own RPC when connected');
    return 'https://solana-rpc.publicnode.com';
  }, [wallet]);

  const endpoint = useMemo(() => getEndpoint(), [getEndpoint]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {children}
    </ConnectionProvider>
  );
};

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <SolanaWalletProvider wallets={wallets} autoConnect>
      <ConnectionProviderWithWalletRPC>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </ConnectionProviderWithWalletRPC>
    </SolanaWalletProvider>
  );
};

