import { useState } from 'react';

const Swap = () => {
  const [slippage, setSlippage] = useState('0.5');
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
      <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Swap Card */}
          <div className="lg:col-span-2">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold mb-4 font-heading">
                <span className="gradient-text">Swap Tokens</span>
              </h1>
              <p className="text-gray-400 text-lg">Trade tokens instantly with the best rates</p>
            </div>

            <div className="card p-8 relative overflow-hidden">
              {/* Settings Button */}
              <div className="absolute top-6 right-6">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300 group"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:rotate-90 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>

              {/* Settings Panel */}
              {showSettings && (
                <div className="mb-6 p-4 bg-dark-900/50 rounded-xl border border-white/10 animate-in slide-in-from-top duration-300">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span>⚙️</span> Transaction Settings
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-2 block">Slippage Tolerance</label>
                      <div className="flex gap-2">
                        {['0.1', '0.5', '1.0'].map((val) => (
                          <button
                            key={val}
                            onClick={() => setSlippage(val)}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                              slippage === val
                                ? 'bg-gradient-brand text-white'
                                : 'bg-white/5 hover:bg-white/10 text-gray-300'
                            }`}
                          >
                            {val}%
                          </button>
                        ))}
                        <input
                          type="number"
                          placeholder="Custom"
                          className="px-4 py-2 bg-white/5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-pink/50 w-24"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {/* From Token */}
                <div className="relative">
                  <div className="flex justify-between mb-2">
                    <label className="text-sm text-gray-400 font-medium">You Pay</label>
                    <button className="text-xs text-brand-cyan hover:text-brand-pink transition-colors">
                      Balance: 0.00
                    </button>
                  </div>
                  <div className="bg-dark-900/50 rounded-2xl p-5 border border-white/10 hover:border-brand-cyan/30 transition-all duration-300 group">
                    <div className="flex justify-between items-center gap-4">
                      <div className="flex-1">
                        <input
                          type="number"
                          placeholder="0.0"
                          className="bg-transparent text-4xl font-bold outline-none w-full placeholder:text-gray-600"
                        />
                        <div className="text-sm text-gray-500 mt-1">~$0.00</div>
                      </div>
                      <div>
                        <button className="flex items-center gap-2 bg-gradient-brand px-5 py-3 rounded-xl font-semibold hover:brightness-110 transition-all duration-300 group shadow-glow-brand">
                          <div className="w-6 h-6 bg-white rounded-full"></div>
                          <span>Select</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button className="text-xs text-brand-cyan hover:text-brand-pink transition-colors mt-2 block text-right">
                          MAX
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center -my-3 relative z-10">
                  <button className="w-14 h-14 bg-gradient-brand rounded-2xl flex items-center justify-center transition-all hover:scale-110 hover:rotate-180 duration-300 shadow-glow-brand group">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                </div>

                {/* To Token */}
                <div className="relative">
                  <div className="flex justify-between mb-2">
                    <label className="text-sm text-gray-400 font-medium">You Receive</label>
                    <span className="text-xs text-gray-500">Balance: 0.00</span>
                  </div>
                  <div className="bg-dark-900/50 rounded-2xl p-5 border border-white/10 hover:border-brand-pink/30 transition-all duration-300">
                    <div className="flex justify-between items-center gap-4">
                      <div className="flex-1">
                        <input
                          type="number"
                          placeholder="0.0"
                          className="bg-transparent text-4xl font-bold outline-none w-full placeholder:text-gray-600"
                        />
                        <div className="text-sm text-gray-500 mt-1">~$0.00</div>
                      </div>
                      <button className="flex items-center gap-2 bg-gradient-brand px-5 py-3 rounded-xl font-semibold hover:brightness-110 transition-all duration-300 shadow-glow-brand">
                        <div className="w-6 h-6 bg-white rounded-full"></div>
                        <span>Select</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="mt-6 p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-xl">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <span>⚡</span> Rate
                    </span>
                    <span className="font-semibold">1 SOL = 23.45 USDC</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <span>📊</span> Price Impact
                    </span>
                    <span className="font-semibold text-green-400">&lt; 0.01%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <span>💰</span> Network Fee
                    </span>
                    <span className="font-semibold">~0.00005 SOL</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <span>🎯</span> Minimum Received
                    </span>
                    <span className="font-semibold">23.33 USDC</span>
                  </div>
                </div>
              </div>

              {/* Swap Action Button */}
              <button className="w-full btn-primary mt-6 text-lg py-4">
                Connect Wallet to Swap
              </button>

              {/* Route Info */}
              <div className="mt-4 text-center text-xs text-gray-500">
                <span className="flex items-center justify-center gap-2">
                  <span>🔄</span> Best route via Jupiter Aggregator
                </span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
                <span>📈</span> Market Stats
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-dark-900/50 rounded-xl border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">24h Volume</div>
                  <div className="text-2xl font-bold gradient-text">$4.2B</div>
                  <div className="text-xs text-green-400 mt-1">+12.5%</div>
                </div>
                <div className="p-4 bg-dark-900/50 rounded-xl border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Total Liquidity</div>
                  <div className="text-2xl font-bold gradient-text">$1.8B</div>
                  <div className="text-xs text-green-400 mt-1">+5.3%</div>
                </div>
              </div>
            </div>

            {/* Recent Swaps */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
                <span>🔥</span> Recent Swaps
              </h3>
              <div className="space-y-3">
                {[
                  { from: 'SOL', to: 'USDC', amount: '10.5', time: '2m ago' },
                  { from: 'USDC', to: 'BONK', amount: '1,200', time: '5m ago' },
                  { from: 'RAY', to: 'SOL', amount: '45.2', time: '8m ago' },
                ].map((swap, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        <div className="w-6 h-6 bg-gradient-brand rounded-full border-2 border-dark-800"></div>
                        <div className="w-6 h-6 bg-gradient-brand-reverse rounded-full border-2 border-dark-800"></div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{swap.from} → {swap.to}</div>
                        <div className="text-xs text-gray-500">{swap.amount} {swap.from}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{swap.time}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Tips */}
            <div className="card p-6 bg-gradient-to-br from-brand-pink/10 to-brand-cyan/10 border-brand-cyan/20">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2 font-heading">
                <span>💡</span> Pro Tip
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Use limit orders to buy or sell at your desired price. Set it and forget it!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Swap;
