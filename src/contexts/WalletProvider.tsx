import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

// Inner component that provides connection with RPC from .env
const ConnectionProviderWithRPC: FC<{ children: ReactNode }> = ({ children }) => {
  // Get RPC endpoint from environment variable - SINGLE SOURCE OF TRUTH
  const endpoint = useMemo(() => {
    const rpcEndpoint = import.meta.env.VITE_RPC_ENDPOINT;
    
    if (!rpcEndpoint) {
      console.error('❌ ERROR: VITE_RPC_ENDPOINT is not set in .env file!');
      console.error('💡 Please create a .env file with your RPC endpoint:');
      console.error('   For Devnet: VITE_RPC_ENDPOINT=https://api.devnet.solana.com');
      console.error('   For Mainnet: VITE_RPC_ENDPOINT=https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/');
      throw new Error('VITE_RPC_ENDPOINT environment variable is required. Please set it in your .env file.');
    }
    
    // Log that we're using the configured RPC (but don't log the full URL to avoid exposing it)
    const maskedUrl = rpcEndpoint.replace(/\/\/[^/]+@/, '//***@').replace(/\/[^/]+\/[^/]+\//, '/***/***/');
    console.log('🌐 Using RPC endpoint from .env:', maskedUrl);
    
    return rpcEndpoint;
  }, []);

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
      <ConnectionProviderWithRPC>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </ConnectionProviderWithRPC>
    </SolanaWalletProvider>
  );
};

