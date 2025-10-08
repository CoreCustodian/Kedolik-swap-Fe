import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useUser } from '../contexts/UserContext';
import { Link } from 'react-router-dom';

const Profile = () => {
  const { publicKey, connected } = useWallet();
  const { userData, isLoading } = useUser();

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'swap':
        return '🔄';
      case 'add_liquidity':
        return '➕';
      case 'remove_liquidity':
        return '➖';
      default:
        return '💫';
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'swap':
        return 'Swap';
      case 'add_liquidity':
        return 'Add Liquidity';
      case 'remove_liquidity':
        return 'Remove Liquidity';
      default:
        return 'Transaction';
    }
  };

  if (!connected || !publicKey) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
        
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="card p-12 text-center">
            <div className="w-24 h-24 bg-gradient-brand rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-brand">
              <span className="text-5xl">👤</span>
            </div>
            <h2 className="text-3xl font-bold mb-4 font-heading gradient-text">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Connect your Solana wallet to view your portfolio, track your trades, and access your profile
            </p>
            <WalletMultiButton className="!bg-gradient-brand !rounded-full !shadow-glow-brand hover:!brightness-110 !transition-all !duration-300 hover:!scale-105 !font-semibold !px-8 !py-4 !text-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="relative">
          <div className="w-16 h-16 border-4 border-brand-cyan border-t-brand-pink rounded-full animate-spin"></div>
          <p className="text-gray-400 mt-4 text-center">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
      <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Header */}
        <div className="card p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand">
                <span className="text-3xl md:text-4xl">👤</span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold font-heading gradient-text mb-2">
                  Your Portfolio
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{formatAddress(publicKey.toBase58())}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(publicKey.toBase58())}
                    className="p-1 hover:text-brand-cyan transition-colors"
                  >
                    📋
                  </button>
                  <a
                    href={`https://solscan.io/account/${publicKey.toBase58()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:text-brand-cyan transition-colors"
                  >
                    🔗
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              <Link to="/swap" className="btn-secondary text-center py-3 px-6 text-sm md:text-base">
                Trade Now
              </Link>
              <button className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full font-semibold border border-white/10 transition-all text-sm md:text-base">
                Settings
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">💰</span>
              </div>
              <span className="text-sm text-gray-400">Total Value</span>
            </div>
            <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              ${userData?.totalValue}
            </div>
            <div className={`text-sm ${userData && userData.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {userData && userData.totalPnL >= 0 ? '↗' : '↘'} {Math.abs(userData?.totalPnL || 0)}% All Time
            </div>
          </div>

          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">📈</span>
              </div>
              <span className="text-sm text-gray-400">24h P&L</span>
            </div>
            <div className={`text-3xl md:text-4xl font-bold mb-2 ${userData && userData.pnl24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {userData && userData.pnl24h >= 0 ? '+' : ''}{userData?.pnl24h}%
            </div>
            <div className="text-sm text-gray-400">
              Last 24 hours
            </div>
          </div>

          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">🎯</span>
              </div>
              <span className="text-sm text-gray-400">Total Assets</span>
            </div>
            <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              {userData?.assets.length}
            </div>
            <div className="text-sm text-gray-400">
              Different tokens
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Assets */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6 md:p-8">
              <h2 className="text-2xl font-bold mb-6 font-heading flex items-center gap-2">
                <span>💎</span> Your Assets
              </h2>
              <div className="space-y-3">
                {userData?.assets.map((asset, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all group"
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand">
                        <span className="font-bold text-sm md:text-base">{asset.symbol.slice(0, 2)}</span>
                      </div>
                      <div>
                        <div className="font-bold text-base md:text-lg">{asset.symbol}</div>
                        <div className="text-xs md:text-sm text-gray-400">{asset.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-base md:text-lg">{asset.balance}</div>
                      <div className="text-sm text-gray-400">${asset.valueUsd}</div>
                      <div className={`text-xs md:text-sm ${asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {asset.change24h >= 0 ? '↗' : '↘'} {Math.abs(asset.change24h)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="card p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold font-heading flex items-center gap-2">
                  <span>📜</span> Recent Transactions
                </h2>
                <button className="text-sm text-brand-cyan hover:text-brand-pink transition-colors">
                  View All →
                </button>
              </div>
              <div className="space-y-3">
                {userData?.recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all group"
                  >
                    <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand shrink-0">
                        <span className="text-lg">{getTransactionIcon(tx.type)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm md:text-base">{getTransactionLabel(tx.type)}</div>
                        <div className="text-xs md:text-sm text-gray-400 truncate">
                          {tx.amountIn} {tx.tokenIn} → {tx.amountOut} {tx.tokenOut}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{formatTime(tx.timestamp)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                        tx.status === 'success' ? 'bg-green-500/20 text-green-400' :
                        tx.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {tx.status === 'success' ? '✓' : tx.status === 'failed' ? '✗' : '⏳'}
                      </span>
                      <a
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="View on Solscan"
                      >
                        <svg className="w-4 h-4 text-gray-400 hover:text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-4 font-heading">Quick Actions</h3>
              <div className="space-y-3">
                <Link to="/swap" className="block p-4 bg-gradient-brand rounded-xl font-semibold text-center hover:brightness-110 transition-all shadow-glow-brand">
                  💱 Swap Tokens
                </Link>
                <Link to="/pools" className="block p-4 bg-white/5 hover:bg-white/10 rounded-xl font-semibold text-center border border-white/10 transition-all">
                  💧 Add Liquidity
                </Link>
                <button className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-xl font-semibold text-center border border-white/10 transition-all">
                  📊 View Analytics
                </button>
              </div>
            </div>

            {/* Trading Stats */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-4 font-heading">Trading Stats</h3>
              <div className="space-y-4">
                <div className="p-4 bg-dark-900/50 rounded-xl border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Total Trades</div>
                  <div className="text-2xl font-bold gradient-text">127</div>
                </div>
                <div className="p-4 bg-dark-900/50 rounded-xl border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Total Volume</div>
                  <div className="text-2xl font-bold gradient-text">$45.2K</div>
                </div>
                <div className="p-4 bg-dark-900/50 rounded-xl border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Win Rate</div>
                  <div className="text-2xl font-bold text-green-400">68.5%</div>
                </div>
              </div>
            </div>

            {/* Rewards */}
            <div className="card p-6 bg-gradient-to-br from-brand-pink/10 to-brand-cyan/10 border-brand-cyan/20">
              <h3 className="text-lg font-bold mb-3 font-heading flex items-center gap-2">
                <span>🎁</span> Rewards
              </h3>
              <p className="text-sm text-gray-300 mb-4">
                Earn $KEDOL tokens by providing liquidity and trading!
              </p>
              <button className="w-full btn-primary text-sm py-3">
                Claim Rewards
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

