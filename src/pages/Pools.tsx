import { useState, useEffect } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { fetchPools, PoolInfo, addLiquidity, createPool } from '../utils/amm';
import { DEVNET_TOKENS, TokenInfo, getTokenList } from '../config/tokens';
import { ToastContainer, ToastType } from '../components/Toast';
import { TransactionModal } from '../components/TransactionModal';

const Pools = () => {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [showAddLiquidity, setShowAddLiquidity] = useState<PoolInfo | null>(null);
  
  // Toast notifications state
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: ToastType;
    txSignature?: string;
  }>>([]);
  
  // Transaction modal state
  const [txModal, setTxModal] = useState<{
    isOpen: boolean;
    status: 'pending' | 'success' | 'error';
    message: string;
    txSignature?: string;
  }>({
    isOpen: false,
    status: 'pending',
    message: '',
  });
  
  // Toast helper functions
  const showToast = (message: string, type: ToastType, txSignature?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, txSignature }]);
  };
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  // Fetch pools
  useEffect(() => {
    const loadPools = async () => {
      setIsLoading(true);
      try {
        const fetchedPools = await fetchPools(connection, wallet);
        setPools(fetchedPools);
      } catch (error) {
        console.error('Error fetching pools:', error);
        setPools([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPools();
    const interval = setInterval(loadPools, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [connection, wallet]);
  
  // Calculate stats
  const totalTVL = pools.reduce((sum, pool) => sum + (pool.token0Reserve + pool.token1Reserve), 0);
  const totalVolume = totalTVL * 0.5; // Simplified
  const avgAPR = 34.2; // Placeholder
  
  // Filter pools
  const filteredPools = pools.filter(pool => {
    const matchesSearch = searchQuery === '' || 
      pool.token0Symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.token1Symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'all' || (activeTab === 'my' && connected);
    return matchesSearch && matchesTab;
  });
  
  return (
    <>
      <div className="min-h-screen pt-20 px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-3 sm:mb-4">
              Liquidity Pools
            </h1>
            <p className="text-base sm:text-lg text-gray-400">
              Provide liquidity and earn trading fees
            </p>
          </div>
          
          {/* Stats Grid - Responsive */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8 sm:mb-12">
            <div className="card p-4 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-400 mb-2">Total Value Locked</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-bold gradient-text">
                ${(totalTVL / 1e9).toFixed(2)}B
              </p>
            </div>
            <div className="card p-4 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-400 mb-2">24h Volume</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-brand-cyan">
                ${(totalVolume / 1e6).toFixed(2)}M
              </p>
            </div>
            <div className="card p-4 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-400 mb-2">Active Pools</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-brand-pink">
                {pools.length}
              </p>
            </div>
            <div className="card p-4 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-400 mb-2">Avg APR</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-green-400">
                {avgAPR}%
              </p>
            </div>
          </div>
          
          {/* Controls - Responsive */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 sm:mb-8">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search pools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-dark-800/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-cyan transition-colors"
              />
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-gradient-brand text-white'
                    : 'bg-dark-800/80 text-gray-400 hover:text-white'
                }`}
              >
                All Pools
              </button>
              <button
                onClick={() => setActiveTab('my')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'my'
                    ? 'bg-gradient-brand text-white'
                    : 'bg-dark-800/80 text-gray-400 hover:text-white'
                }`}
              >
                My Positions
              </button>
              {connected && (
                <button
                  onClick={() => setShowCreatePool(true)}
                  className="px-4 sm:px-6 py-3 bg-gradient-brand rounded-xl font-semibold hover:brightness-110 transition-all text-sm sm:text-base whitespace-nowrap"
                >
                  + Create Pool
                </button>
              )}
            </div>
          </div>
          
          {/* Pools Grid - Responsive */}
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-12 h-12 border-4 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredPools.length === 0 ? (
            <div className="card p-8 sm:p-12 text-center">
              <div className="text-5xl sm:text-6xl mb-4">🏊</div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">No pools found</h3>
              <p className="text-gray-400 text-sm sm:text-base">
                {searchQuery ? 'Try a different search term' : 'Be the first to create a pool!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredPools.map((pool, index) => (
                <PoolCard
                  key={index}
                  pool={pool}
                  onAddLiquidity={() => setShowAddLiquidity(pool)}
                  connected={connected}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Modals */}
      {showCreatePool && (
        <CreatePoolModal
          onClose={() => setShowCreatePool(false)}
          onSuccess={() => {
            setShowCreatePool(false);
            showToast('Pool created successfully!', 'success');
          }}
          showToast={showToast}
          setTxModal={setTxModal}
        />
      )}
      
      {showAddLiquidity && (
        <AddLiquidityModal
          pool={showAddLiquidity}
          onClose={() => setShowAddLiquidity(null)}
          onSuccess={() => {
            setShowAddLiquidity(null);
            showToast('Liquidity added successfully!', 'success');
          }}
          showToast={showToast}
          setTxModal={setTxModal}
        />
      )}
      
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Transaction Modal */}
      <TransactionModal
        isOpen={txModal.isOpen}
        status={txModal.status}
        message={txModal.message}
        txSignature={txModal.txSignature}
        onClose={() => setTxModal({ ...txModal, isOpen: false })}
      />
    </>
  );
};

// Pool Card Component - Responsive
const PoolCard = ({
  pool,
  onAddLiquidity,
  connected
}: {
  pool: PoolInfo;
  onAddLiquidity: () => void;
  connected: boolean;
}) => {
  return (
    <div className="card p-4 sm:p-6 hover:scale-105 transition-transform">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-brand rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base">
            {pool.token0Symbol[0]}
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-brand-pink to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base -ml-3">
            {pool.token1Symbol[0]}
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg">
              {pool.token0Symbol}/{pool.token1Symbol}
            </h3>
            <p className="text-xs text-gray-400">0.3% Fee</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-lg">
          <span className="text-green-400 text-xs sm:text-sm font-semibold">APR</span>
          <span className="text-green-400 text-xs sm:text-sm font-bold">~42%</span>
        </div>
      </div>
      
      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-gray-400">{pool.token0Symbol} Reserve</span>
          <span className="font-semibold">{(pool.token0Reserve / Math.pow(10, pool.token0Decimals)).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-gray-400">{pool.token1Symbol} Reserve</span>
          <span className="font-semibold">{(pool.token1Reserve / Math.pow(10, pool.token1Decimals)).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-gray-400">TVL</span>
          <span className="font-semibold text-brand-cyan">
            ${((pool.token0Reserve + pool.token1Reserve) / 1e9).toFixed(2)}M
          </span>
        </div>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-gray-400">24h Volume</span>
          <span className="font-semibold">${((pool.token0Reserve + pool.token1Reserve) * 0.1 / 1e6).toFixed(2)}K</span>
        </div>
      </div>
      
      <button
        onClick={onAddLiquidity}
        disabled={!connected}
        className={`w-full py-2 sm:py-3 rounded-xl font-semibold transition-all text-sm sm:text-base ${
          connected
            ? 'bg-gradient-brand hover:brightness-110'
            : 'bg-gray-700 cursor-not-allowed'
        }`}
      >
        {connected ? 'Add Liquidity' : 'Connect Wallet'}
      </button>
    </div>
  );
};

// Create Pool Modal Component
const CreatePoolModal = ({
  onClose,
  onSuccess,
  showToast,
  setTxModal
}: {
  onClose: () => void;
  onSuccess: () => void;
  showToast: (message: string, type: ToastType, txSignature?: string) => void;
  setTxModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    status: 'pending' | 'success' | 'error';
    message: string;
    txSignature?: string;
  }>>;
}) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  
  const [token0, setToken0] = useState<TokenInfo>(DEVNET_TOKENS.SOL);
  const [token1, setToken1] = useState<TokenInfo>(DEVNET_TOKENS.USDC);
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [token0Balance, setToken0Balance] = useState<number>(0);
  const [token1Balance, setToken1Balance] = useState<number>(0);
  
  const tokenList = getTokenList();
  
  // Fetch token 0 balance when it changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey) return;
      
      try {
        const tokenAccount = await getAssociatedTokenAddress(token0.mint, publicKey);
        const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
        const balance = parseFloat(accountInfo.value.uiAmount?.toString() || '0');
        setToken0Balance(balance);
        console.log(`✅ ${token0.symbol} balance: ${balance}`);
      } catch (error) {
        setToken0Balance(0);
        console.log(`⚠️ ${token0.symbol} balance: 0 (no account)`);
      }
    };
    
    fetchBalance();
  }, [token0, publicKey, connection]);
  
  // Fetch token 1 balance when it changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey) return;
      
      try {
        const tokenAccount = await getAssociatedTokenAddress(token1.mint, publicKey);
        const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
        const balance = parseFloat(accountInfo.value.uiAmount?.toString() || '0');
        setToken1Balance(balance);
        console.log(`✅ ${token1.symbol} balance: ${balance}`);
      } catch (error) {
        setToken1Balance(0);
        console.log(`⚠️ ${token1.symbol} balance: 0 (no account)`);
      }
    };
    
    fetchBalance();
  }, [token1, publicKey, connection]);
  
  const handleCreate = async () => {
    if (!amount0 || !amount1) {
      showToast('Please enter both amounts', 'warning');
      return;
    }
    
    if (!publicKey || !wallet) {
      showToast('Wallet not connected. Please reconnect your wallet.', 'error');
      return;
    }
    
    // Validate balances
    if (parseFloat(amount0) > token0Balance) {
      showToast(`Insufficient ${token0.symbol} balance`, 'error');
      return;
    }
    if (parseFloat(amount1) > token1Balance) {
      showToast(`Insufficient ${token1.symbol} balance`, 'error');
      return;
    }
    
    // Show pending modal
    setTxModal({
      isOpen: true,
      status: 'pending',
      message: 'Creating pool... Please confirm the transaction in your wallet.',
    });
    
    try {
      const result = await createPool(
        connection,
        wallet,
        publicKey,
        token0.mint,
        token1.mint,
        parseFloat(amount0),
        parseFloat(amount1)
      );
      
      // Show success modal
      setTxModal({
        isOpen: true,
        status: 'success',
        message: `Pool created successfully for ${token0.symbol}/${token1.symbol}!`,
        txSignature: result.tx,
      });
      
      showToast('Pool created successfully!', 'success', result.tx);
      onSuccess();
    } catch (error: any) {
      console.error('Create pool error:', error);
      
      // Show error modal
      setTxModal({
        isOpen: true,
        status: 'error',
        message: error.message || 'Failed to create pool. Please try again.',
      });
      
      showToast(`Failed to create pool: ${error.message || 'Unknown error'}`, 'error');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card max-w-md w-full p-4 sm:p-6 my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold gradient-text">Create Pool</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">✕</button>
        </div>
        
        {/* Token 0 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">First Token</label>
          <select
            value={token0.symbol}
            onChange={(e) => setToken0(tokenList.find(t => t.symbol === e.target.value) || DEVNET_TOKENS.SOL)}
            className="w-full bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-cyan"
          >
            {tokenList.map(token => (
              <option key={token.symbol} value={token.symbol}>{token.name} ({token.symbol})</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Balance: {token0Balance.toLocaleString()} {token0.symbol}</p>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Amount</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount0}
              onChange={(e) => setAmount0(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-cyan"
            />
            <button
              onClick={() => setAmount0(token0Balance.toString())}
              className="px-4 py-2 bg-brand-cyan/20 text-brand-cyan rounded-lg hover:bg-brand-cyan/30 transition-colors text-sm font-semibold"
            >
              MAX
            </button>
          </div>
        </div>
        
        {/* Token 1 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Second Token</label>
          <select
            value={token1.symbol}
            onChange={(e) => setToken1(tokenList.find(t => t.symbol === e.target.value) || DEVNET_TOKENS.USDC)}
            className="w-full bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-cyan"
          >
            {tokenList.map(token => (
              <option key={token.symbol} value={token.symbol}>{token.name} ({token.symbol})</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Balance: {token1Balance.toLocaleString()} {token1.symbol}</p>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Amount</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount1}
              onChange={(e) => setAmount1(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-cyan"
            />
            <button
              onClick={() => setAmount1(token1Balance.toString())}
              className="px-4 py-2 bg-brand-cyan/20 text-brand-cyan rounded-lg hover:bg-brand-cyan/30 transition-colors text-sm font-semibold"
            >
              MAX
            </button>
          </div>
        </div>
        
        {/* Info Alert */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-6">
          <p className="text-xs text-blue-400">
            ℹ️ You'll receive LP tokens representing your share of the pool. Prices will be set based on the ratio you provide.
          </p>
        </div>
        
        <button
          onClick={handleCreate}
          disabled={!amount0 || !amount1}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            amount0 && amount1
              ? 'bg-gradient-brand hover:brightness-110'
              : 'bg-gray-700 cursor-not-allowed'
          }`}
        >
          Create Pool
        </button>
      </div>
    </div>
  );
};

// Add Liquidity Modal Component
const AddLiquidityModal = ({
  pool,
  onClose,
  onSuccess,
  showToast,
  setTxModal
}: {
  pool: PoolInfo;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (message: string, type: ToastType, txSignature?: string) => void;
  setTxModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    status: 'pending' | 'success' | 'error';
    message: string;
    txSignature?: string;
  }>>;
}) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [balance0, setBalance0] = useState<number>(0);
  const [balance1, setBalance1] = useState<number>(0);
  
  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicKey) return;
      
      try {
        const token0Account = await getAssociatedTokenAddress(pool.token0Mint, publicKey);
        const token0Info = await connection.getTokenAccountBalance(token0Account);
        setBalance0(parseFloat(token0Info.value.uiAmount?.toString() || '0'));
      } catch (error) {
        setBalance0(0);
      }
      
      try {
        const token1Account = await getAssociatedTokenAddress(pool.token1Mint, publicKey);
        const token1Info = await connection.getTokenAccountBalance(token1Account);
        setBalance1(parseFloat(token1Info.value.uiAmount?.toString() || '0'));
      } catch (error) {
        setBalance1(0);
      }
    };
    
    fetchBalances();
  }, [pool, publicKey, connection]);
  
  // Auto-calculate amount1 based on pool ratio
  const handleAmount0Change = (value: string) => {
    setAmount0(value);
    if (value && pool.token0Reserve > 0) {
      const ratio = pool.token1Reserve / pool.token0Reserve;
      setAmount1((parseFloat(value) * ratio).toFixed(6));
    }
  };
  
  const handleAdd = async () => {
    if (!amount0 || !amount1) {
      showToast('Please enter amounts', 'warning');
      return;
    }
    
    if (!publicKey || !wallet) {
      showToast('Wallet not connected', 'error');
      return;
    }
    
    // Validate balances
    if (parseFloat(amount0) > balance0) {
      showToast(`Insufficient ${pool.token0Symbol} balance`, 'error');
      return;
    }
    if (parseFloat(amount1) > balance1) {
      showToast(`Insufficient ${pool.token1Symbol} balance`, 'error');
      return;
    }
    
    setTxModal({
      isOpen: true,
      status: 'pending',
      message: 'Adding liquidity... Please confirm in your wallet.',
    });
    
    try {
      const result = await addLiquidity(
        connection,
        wallet,
        publicKey,
        pool.poolState,
        parseFloat(amount0),
        parseFloat(amount1)
      );
      
      setTxModal({
        isOpen: true,
        status: 'success',
        message: `Successfully added liquidity to ${pool.token0Symbol}/${pool.token1Symbol} pool!`,
        txSignature: result,
      });
      
      showToast('Liquidity added successfully!', 'success', result);
      onSuccess();
    } catch (error: any) {
      console.error('Add liquidity error:', error);
      
      setTxModal({
        isOpen: true,
        status: 'error',
        message: error.message || 'Failed to add liquidity',
      });
      
      showToast(`Failed: ${error.message || 'Unknown error'}`, 'error');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card max-w-md w-full p-4 sm:p-6 my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold gradient-text">Add Liquidity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">✕</button>
        </div>
        
        <div className="bg-dark-900/50 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-lg mb-2">{pool.token0Symbol}/{pool.token1Symbol}</h3>
          <div className="text-xs text-gray-400 space-y-1">
            <p>Current Price: 1 {pool.token0Symbol} = {(pool.token1Reserve / pool.token0Reserve).toFixed(4)} {pool.token1Symbol}</p>
            <p>Pool Share: You'll own ~0.1% of the pool</p>
          </div>
        </div>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-gray-400">{pool.token0Symbol} Amount</label>
            <span className="text-xs text-gray-500">Balance: {balance0.toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount0}
              onChange={(e) => handleAmount0Change(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-cyan"
            />
            <button
              onClick={() => handleAmount0Change(balance0.toString())}
              className="px-4 py-2 bg-brand-cyan/20 text-brand-cyan rounded-lg hover:bg-brand-cyan/30 transition-colors text-sm font-semibold"
            >
              MAX
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-gray-400">{pool.token1Symbol} Amount</label>
            <span className="text-xs text-gray-500">Balance: {balance1.toLocaleString()}</span>
          </div>
          <input
            type="number"
            value={amount1}
            readOnly
            placeholder="0.0"
            className="w-full bg-dark-900/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none opacity-60"
          />
          <p className="text-xs text-gray-500 mt-1">Amount calculated based on pool ratio</p>
        </div>
        
        <button
          onClick={handleAdd}
          disabled={!amount0 || !amount1}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            amount0 && amount1
              ? 'bg-gradient-brand hover:brightness-110'
              : 'bg-gray-700 cursor-not-allowed'
          }`}
        >
          Add Liquidity
        </button>
      </div>
    </div>
  );
};

export default Pools;
