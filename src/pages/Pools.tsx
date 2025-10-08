const Pools = () => {
  return (
    <div className="relative min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Liquidity Pools
            </span>
          </h1>
          <p className="text-gray-400">Provide liquidity and earn rewards</p>
        </div>

        <div className="card p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex gap-4 w-full md:w-auto">
              <button className="px-6 py-2 bg-gradient-purple rounded-lg font-semibold shadow-glow-purple">
                All Pools
              </button>
              <button className="px-6 py-2 bg-dark-900/50 hover:bg-dark-800 rounded-lg font-semibold transition-all">
                My Pools
              </button>
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <input
                type="text"
                placeholder="Search pools..."
                className="px-4 py-2 bg-dark-900/50 rounded-lg border border-purple-500/20 outline-none focus:border-purple-500/50 transition-all flex-1"
              />
            </div>
          </div>
        </div>

        {/* Pools Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((pool) => (
            <div key={pool} className="card p-6 hover:scale-105 transition-transform">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-purple rounded-full"></div>
                  <div className="w-10 h-10 bg-gradient-cyan rounded-full -ml-4"></div>
                  <span className="font-bold ml-2">SOL / USDC</span>
                </div>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold">
                  Active
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">TVL</span>
                  <span className="font-semibold">$2,450,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">APR</span>
                  <span className="font-semibold text-green-400">24.5%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Volume 24h</span>
                  <span className="font-semibold">$1,200,000</span>
                </div>
              </div>

              <button className="w-full mt-4 px-4 py-2 bg-gradient-purple rounded-lg font-semibold hover:shadow-glow-purple transition-all">
                Add Liquidity
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Pools;

