import { useState } from 'react';

const Pools = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const pools = [
    { name: 'SOL / USDC', tvl: '$4,250,000', apr: '32.5', volume: '$2,100,000', fees: '$8,400', status: 'active' },
    { name: 'RAY / SOL', tvl: '$1,890,000', apr: '45.8', volume: '$950,000', fees: '$3,800', status: 'active' },
    { name: 'BONK / USDC', tvl: '$890,000', apr: '68.2', volume: '$450,000', fees: '$1,800', status: 'hot' },
    { name: 'mSOL / SOL', tvl: '$3,120,000', apr: '28.4', volume: '$1,560,000', fees: '$6,240', status: 'active' },
    { name: 'USDT / USDC', tvl: '$5,670,000', apr: '18.9', volume: '$2,835,000', fees: '$11,340', status: 'stable' },
    { name: 'JUP / SOL', tvl: '$720,000', apr: '52.3', volume: '$360,000', fees: '$1,440', status: 'new' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
      <div className="absolute top-20 right-20 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-40 left-20 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 font-heading">
            <span className="gradient-text">Liquidity Pools</span>
          </h1>
          <p className="text-gray-400 text-lg">Provide liquidity and earn trading fees + rewards</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">💰</span>
              </div>
              <div className="text-sm text-gray-400">Total Value Locked</div>
            </div>
            <div className="text-3xl font-bold gradient-text">$16.5B</div>
            <div className="text-xs text-green-400 mt-1">+8.4% this week</div>
          </div>

          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">📊</span>
              </div>
              <div className="text-sm text-gray-400">24h Volume</div>
            </div>
            <div className="text-3xl font-bold gradient-text">$8.2B</div>
            <div className="text-xs text-green-400 mt-1">+12.8% from yesterday</div>
          </div>

          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">🎯</span>
              </div>
              <div className="text-sm text-gray-400">Average APR</div>
            </div>
            <div className="text-3xl font-bold gradient-text">34.2%</div>
            <div className="text-xs text-brand-cyan mt-1">Across all pools</div>
          </div>

          <div className="card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
                <span className="text-xl">👥</span>
              </div>
              <div className="text-sm text-gray-400">Active Pools</div>
            </div>
            <div className="text-3xl font-bold gradient-text">248</div>
            <div className="text-xs text-brand-cyan mt-1">12 new this week</div>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Tabs */}
            <div className="flex gap-2 w-full md:w-auto">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'all'
                    ? 'bg-gradient-brand text-white shadow-glow-brand'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300'
                }`}
              >
                All Pools
              </button>
              <button
                onClick={() => setActiveTab('my')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'my'
                    ? 'bg-gradient-brand text-white shadow-glow-brand'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300'
                }`}
              >
                My Pools
              </button>
            </div>

            {/* Search */}
            <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <input
                  type="text"
                  placeholder="Search pools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 pl-10 bg-white/5 rounded-xl border border-white/10 outline-none focus:border-brand-cyan/50 transition-all text-sm"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Pools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pools.map((pool, index) => (
            <div
              key={index}
              className="card p-6 hover:scale-105 transition-all duration-300 group relative overflow-hidden"
            >
              {/* Status Badge */}
              <div className="absolute top-4 right-4">
                {pool.status === 'hot' && (
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-bold border border-red-500/30 animate-pulse flex items-center gap-1">
                    🔥 HOT
                  </span>
                )}
                {pool.status === 'new' && (
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30 flex items-center gap-1">
                    ✨ NEW
                  </span>
                )}
                {pool.status === 'stable' && (
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30 flex items-center gap-1">
                    💎 STABLE
                  </span>
                )}
                {pool.status === 'active' && (
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                    ● Active
                  </span>
                )}
              </div>

              {/* Pool Header */}
              <div className="flex items-center gap-3 mb-6 mt-2">
                <div className="flex -space-x-3">
                  <div className="w-12 h-12 bg-gradient-brand rounded-full border-4 border-dark-800 shadow-glow-brand"></div>
                  <div className="w-12 h-12 bg-gradient-brand-reverse rounded-full border-4 border-dark-800 shadow-glow-cyan"></div>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-heading">{pool.name}</h3>
                  <div className="text-xs text-gray-500">Automated Market Maker</div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-dark-900/50 rounded-xl border border-white/10">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <span>💰</span> TVL
                  </span>
                  <span className="font-bold text-lg">{pool.tvl}</span>
                </div>

                <div className="flex justify-between items-center p-3 bg-dark-900/50 rounded-xl border border-white/10">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <span>📈</span> APR
                  </span>
                  <span className="font-bold text-lg text-green-400">{pool.apr}%</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-900/50 rounded-xl border border-white/10">
                    <div className="text-xs text-gray-400 mb-1">24h Volume</div>
                    <div className="font-semibold">{pool.volume}</div>
                  </div>
                  <div className="p-3 bg-dark-900/50 rounded-xl border border-white/10">
                    <div className="text-xs text-gray-400 mb-1">24h Fees</div>
                    <div className="font-semibold text-brand-cyan">{pool.fees}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button className="px-4 py-3 bg-gradient-brand rounded-xl font-semibold hover:brightness-110 transition-all duration-300 shadow-glow-brand">
                  Add Liquidity
                </button>
                <button className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-semibold border border-white/10 transition-all duration-300">
                  Details
                </button>
              </div>

              {/* Hover Glow Effect */}
              <div className="absolute inset-0 bg-gradient-brand opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none rounded-3xl"></div>
            </div>
          ))}
        </div>

        {/* Create Pool CTA */}
        <div className="mt-12 card p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-brand opacity-5"></div>
          <div className="relative z-10">
            <h3 className="text-3xl font-bold mb-4 font-heading gradient-text">
              Can't find your pool?
            </h3>
            <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
              Create a new liquidity pool for your favorite token pair and start earning trading fees
            </p>
            <button className="btn-primary text-lg">
              Create New Pool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pools;
