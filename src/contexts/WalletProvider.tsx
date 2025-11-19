import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Mainnet;

  // Custom RPC endpoint - supports environment variable or defaults to PublicNode
  // To use a custom RPC, set VITE_RPC_ENDPOINT in .env file
  // Example: VITE_RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
  // Default: PublicNode (https://solana-rpc.publicnode.com) - free, reliable, no API key needed
  const endpoint = useMemo(() => {
    // Check for custom RPC in environment variable
    const customEndpoint = import.meta.env.VITE_RPC_ENDPOINT;
    
    if (customEndpoint) {
      console.log('🌐 Using custom RPC endpoint');
      return customEndpoint;
    }
    
    // Fallback to PublicNode (free, reliable alternative to rate-limited public RPC)
    console.log('🌐 Using PublicNode RPC (free, no API key required)');
    console.log('💡 For production with high traffic, consider: Helius, Quicknode, or Alchemy');
    return 'https://solana-rpc.publicnode.com';
  }, [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};

