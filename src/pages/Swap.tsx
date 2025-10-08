const Swap = () => {
  return (
    <div className="relative min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Swap Tokens
            </span>
          </h1>
          <p className="text-gray-400">Trade tokens in an instant</p>
        </div>

        <div className="card p-6">
          <div className="space-y-4">
            {/* From Token */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">From</label>
              <div className="bg-dark-900/50 rounded-xl p-4 border border-purple-500/20">
                <div className="flex justify-between items-center mb-2">
                  <input
                    type="number"
                    placeholder="0.0"
                    className="bg-transparent text-3xl font-bold outline-none w-full"
                  />
                  <button className="bg-purple-600/20 hover:bg-purple-600/30 px-4 py-2 rounded-lg border border-purple-500/30 transition-all">
                    <span className="font-semibold">Select Token</span>
                  </button>
                </div>
                <div className="text-sm text-gray-400">Balance: 0.00</div>
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <button className="w-12 h-12 bg-dark-800 hover:bg-dark-700 rounded-xl border border-purple-500/30 flex items-center justify-center transition-all hover:scale-110">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* To Token */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">To</label>
              <div className="bg-dark-900/50 rounded-xl p-4 border border-purple-500/20">
                <div className="flex justify-between items-center mb-2">
                  <input
                    type="number"
                    placeholder="0.0"
                    className="bg-transparent text-3xl font-bold outline-none w-full"
                  />
                  <button className="bg-purple-600/20 hover:bg-purple-600/30 px-4 py-2 rounded-lg border border-purple-500/30 transition-all">
                    <span className="font-semibold">Select Token</span>
                  </button>
                </div>
                <div className="text-sm text-gray-400">Balance: 0.00</div>
              </div>
            </div>

            {/* Swap Action Button */}
            <button className="w-full btn-primary mt-6">
              Connect Wallet
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-6 card p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Rate</span>
              <span>--</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Price Impact</span>
              <span>--</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Network Fee</span>
              <span>--</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Swap;

