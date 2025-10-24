import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { fetchAllBalances, TokenBalance } from '../utils/balances';

const Profile = () => {
  const { connected, publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [solBalance, setSolBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  
  // Fetch balances
  useEffect(() => {
    const loadBalances = async () => {
      if (!publicKey || !connected) {
        setBalances([]);
        setSolBalance(0);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const allBalances = await fetchAllBalances(connection, publicKey);
        const solBal = allBalances.find(b => b.symbol === 'SOL' && b.mint === 'native');
        if (solBal) {
          setSolBalance(solBal.balance);
        }
        setBalances(allBalances.filter(b => b.mint !== 'native'));
      } catch (error) {
        console.error('Error fetching balances:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBalances();
    const interval = setInterval(loadBalances, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connected, connection]);
  
  // Fetch transaction history
  useEffect(() => {
    const loadTxHistory = async () => {
      if (!publicKey) return;
      
      try {
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
        setTxHistory(signatures);
      } catch (error) {
        console.error('Error fetching transaction history:', error);
      }
    };
    
    loadTxHistory();
  }, [publicKey, connection]);
  
  if (!connected || !publicKey) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <div className="text-8xl mb-6">👤</div>
            <h1 className="text-5xl font-bold mb-4 gradient-text font-heading">Profile</h1>
            <p className="text-gray-400 text-lg mb-8">Connect your wallet to view your profile</p>
            <button className="btn-primary">Connect Wallet</button>
          </div>
        </div>
      </div>
    );
  }
  
  const nonZeroBalances = balances.filter(b => b.balance > 0);
  const totalAssets = nonZeroBalances.length + 1; // +1 for SOL
  
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
      <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 font-heading">
            <span className="gradient-text">My Profile</span>
          </h1>
          <p className="text-gray-400 text-lg">Manage your wallet and view your assets</p>
        </div>
        
        {/* Wallet Card */}
        <div className="card p-8 mb-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-brand opacity-5"></div>
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand">
                  <span className="text-4xl">💎</span>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Wallet Address</div>
                  <div className="text-xl font-mono font-bold break-all">
                    {publicKey.toString().slice(0, 16)}...{publicKey.toString().slice(-16)}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(publicKey.toString())}
                    className="text-sm text-brand-cyan hover:text-brand-pink transition-colors mt-2"
                  >
                    📋 Copy Address
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <a
                  href={`https://explorer.solana.com/address/${publicKey.toString()}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-semibold border border-white/10 transition-all"
                >
                  View on Explorer
                </a>
                <button
                  onClick={() => disconnect()}
                  className="px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-semibold border border-red-500/30 transition-all"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-2xl">💰</span>
              </div>
              <div className="text-sm text-gray-400">SOL Balance</div>
            </div>
            <div className="text-3xl font-bold gradient-text">
              {solBalance.toFixed(4)} SOL
            </div>
            <div className="text-xs text-gray-500 mt-1">Native Solana</div>
          </div>
          
          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-2xl">🪙</span>
              </div>
              <div className="text-sm text-gray-400">Total Assets</div>
            </div>
            <div className="text-3xl font-bold gradient-text">
              {totalAssets}
            </div>
            <div className="text-xs text-gray-500 mt-1">With non-zero balance</div>
          </div>
          
          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-2xl">📊</span>
              </div>
              <div className="text-sm text-gray-400">Network</div>
            </div>
            <div className="text-3xl font-bold text-brand-cyan">Devnet</div>
            <div className="text-xs text-gray-500 mt-1">Test Network</div>
          </div>
        </div>
        
        {/* Token Balances */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* All Tokens */}
          <div className="card p-6">
            <h2 className="text-2xl font-bold mb-6 font-heading gradient-text">Token Balances</h2>
            
            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block w-12 h-12 border-4 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin"></div>
                <p className="text-gray-400 mt-4">Loading balances...</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                {balances.map((balance) => {
                  const hasBalance = balance.balance > 0;
                  return (
                    <div
                      key={balance.mint}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        hasBalance
                          ? 'bg-dark-900/50 border-white/10 hover:border-brand-cyan/30'
                          : 'bg-dark-900/20 border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                          balance.symbol === 'SOL'
                            ? 'bg-gradient-to-br from-purple-500 to-cyan-500'
                            : 'bg-gradient-brand'
                        }`}>
                          {balance.symbol[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-lg">{balance.symbol}</div>
                          <div className="text-sm text-gray-500">{balance.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${hasBalance ? 'text-white' : 'text-gray-600'}`}>
                          {balance.balance.toFixed(balance.decimals >= 6 ? 6 : balance.decimals)}
                        </div>
                        <div className="text-xs text-gray-500">$0.00</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Recent Transactions */}
          <div className="card p-6">
            <h2 className="text-2xl font-bold mb-6 font-heading gradient-text">Recent Transactions</h2>
            
            {txHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📝</div>
                <p className="text-gray-400">No recent transactions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {txHistory.map((tx, index) => (
                  <a
                    key={index}
                    href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm group-hover:text-brand-cyan transition-colors">
                          {tx.signature.slice(0, 16)}...{tx.signature.slice(-16)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date((tx.blockTime || 0) * 1000).toLocaleString()}
                        </div>
                      </div>
                      <div className={`text-xs px-3 py-1 rounded-full font-semibold ${
                        tx.err ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'
                      }`}>
                        {tx.err ? 'Failed' : 'Success'}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="card p-8">
          <h2 className="text-2xl font-bold mb-6 font-heading gradient-text text-center">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/swap" className="p-6 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all text-center group">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">💱</div>
              <div className="font-semibold">Swap Tokens</div>
            </a>
            <a href="/pools" className="p-6 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all text-center group">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🏊</div>
              <div className="font-semibold">Liquidity Pools</div>
            </a>
            <button
              onClick={() => window.open(`https://faucet.solana.com`, '_blank')}
              className="p-6 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all text-center group"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🚰</div>
              <div className="font-semibold">Get Devnet SOL</div>
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(publicKey.toString())}
              className="p-6 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all text-center group"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📋</div>
              <div className="font-semibold">Copy Address</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
