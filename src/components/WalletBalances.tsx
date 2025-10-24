import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { fetchAllBalances, TokenBalance } from '../utils/balances';

const WalletBalances = () => {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const loadBalances = async () => {
      if (!publicKey || !connected) {
        setBalances([]);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const fetchedBalances = await fetchAllBalances(connection, publicKey);
        setBalances(fetchedBalances);
      } catch (err: any) {
        console.error('Error fetching balances:', err);
        setError(err.message || 'Failed to fetch balances');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBalances();
    
    // Refresh balances every 10 seconds
    const interval = setInterval(loadBalances, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connected, connection]);
  
  if (!connected) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
          <span>💰</span> Wallet Balances
        </h3>
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">Connect your wallet to view balances</p>
        </div>
      </div>
    );
  }
  
  if (isLoading && balances.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
          <span>💰</span> Wallet Balances
        </h3>
        <div className="text-center py-8">
          <div className="inline-block w-8 h-8 border-4 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm mt-2">Loading balances...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
          <span>💰</span> Wallet Balances
        </h3>
        <div className="text-center py-4">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      </div>
    );
  }
  
  // Calculate total value (placeholder - would need prices for real calculation)
  const totalTokens = balances.length;
  const nonZeroBalances = balances.filter(b => b.balance > 0);
  
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2 font-heading">
          <span>💰</span> Wallet Balances
        </h3>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin"></div>
        )}
      </div>
      
      {/* Summary */}
      <div className="mb-4 p-4 bg-gradient-to-br from-brand-pink/10 to-brand-cyan/10 rounded-xl border border-brand-cyan/20">
        <div className="text-sm text-gray-400 mb-1">Total Assets</div>
        <div className="text-2xl font-bold gradient-text">
          {nonZeroBalances.length} / {totalTokens}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {nonZeroBalances.length} tokens with balance
        </div>
      </div>
      
      {/* Balance List */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
        {balances.map((balance) => {
          const hasBalance = balance.balance > 0;
          return (
            <div
              key={balance.mint}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                hasBalance 
                  ? 'bg-dark-900/50 border-white/10 hover:border-brand-cyan/30'
                  : 'bg-dark-900/20 border-white/5 opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  balance.symbol === 'SOL' 
                    ? 'bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'bg-gradient-brand'
                }`}>
                  {balance.symbol[0]}
                </div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {balance.symbol}
                    {balance.symbol === 'SOL' && (
                      <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">
                        Native
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{balance.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${hasBalance ? 'text-white' : 'text-gray-600'}`}>
                  {balance.balance.toFixed(balance.decimals >= 6 ? 6 : balance.decimals)}
                </div>
                <div className="text-xs text-gray-500">$0.00</div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Wallet Address */}
      {publicKey && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-gray-500 mb-1">Connected Wallet</div>
          <div className="text-xs font-mono break-all text-brand-cyan">
            {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletBalances;

