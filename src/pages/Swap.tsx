import { useState, useEffect } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { DEVNET_TOKENS, TokenInfo, getTokenList } from '../config/tokens';
import { ToastContainer, ToastType } from '../components/Toast';
import { TransactionModal } from '../components/TransactionModal';
import { 
  fetchPools, 
  calculateSwapOutput, 
  swapBaseInput,
  getPoolState,
  sortTokenMints,
} from '../utils/amm';

const Swap = () => {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  
  const [slippage, setSlippage] = useState('0.5');
  const [showSettings, setShowSettings] = useState(false);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  
  // Token selection
  const [fromToken, setFromToken] = useState<TokenInfo>(DEVNET_TOKENS.SOL);
  const [toToken, setToToken] = useState<TokenInfo>(DEVNET_TOKENS.USDC);
  const [showFromTokenList, setShowFromTokenList] = useState(false);
  const [showToTokenList, setShowToTokenList] = useState(false);
  
  // Balances
  const [fromBalance, setFromBalance] = useState<number>(0);
  const [toBalance, setToBalance] = useState<number>(0);
  
  // Pool data
  const [poolReserves, setPoolReserves] = useState<{ reserve0: number; reserve1: number } | null>(null);
  const [quoteData, setQuoteData] = useState<{ amountOut: number; priceImpact: number; fee: number } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  
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
  
  // Fetch token balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicKey || !connected) {
        setFromBalance(0);
        setToBalance(0);
        return;
      }
      
      try {
        // Fetch from token balance
        try {
          const fromTokenAccount = await getAssociatedTokenAddress(fromToken.mint, publicKey);
          const fromAccountInfo = await connection.getTokenAccountBalance(fromTokenAccount);
          setFromBalance(parseFloat(fromAccountInfo.value.uiAmount?.toString() || '0'));
        } catch (error) {
          setFromBalance(0);
        }
        
        // Fetch to token balance
        try {
          const toTokenAccount = await getAssociatedTokenAddress(toToken.mint, publicKey);
          const toAccountInfo = await connection.getTokenAccountBalance(toTokenAccount);
          setToBalance(parseFloat(toAccountInfo.value.uiAmount?.toString() || '0'));
        } catch (error) {
          setToBalance(0);
        }
      } catch (error) {
        console.error('Error fetching balances:', error);
        showToast('Failed to fetch token balances', 'error');
      }
    };
    
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000); // Update every 15s
    return () => clearInterval(interval);
  }, [publicKey, connected, fromToken, toToken, connection]);
  
  // Fetch pool reserves
  useEffect(() => {
    const fetchPoolData = async () => {
      try {
        const { token0, token1 } = sortTokenMints(fromToken.mint, toToken.mint);
        const poolState = getPoolState(token0, token1);
        
        const pools = await fetchPools(connection, wallet);
        const pool = pools.find(p => p.address.equals(poolState));
        
        if (pool) {
          setPoolReserves({
            reserve0: pool.token0Reserve,
            reserve1: pool.token1Reserve,
          });
        } else {
          setPoolReserves(null);
        }
      } catch (error) {
        console.error('Error fetching pool data:', error);
        setPoolReserves(null);
      }
    };
    
    fetchPoolData();
  }, [fromToken, toToken, connection, wallet]);
  
  // Calculate quote when amount changes
  useEffect(() => {
    if (!fromAmount || !poolReserves) {
      setToAmount('');
      setQuoteData(null);
      setIsLoadingQuote(false);
      return;
    }
    
    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      setToAmount('');
      setQuoteData(null);
      setIsLoadingQuote(false);
      return;
    }
    
    setIsLoadingQuote(true);
    
    // Debounce quote calculation
    const timer = setTimeout(() => {
      try {
        const { token0, token1 } = sortTokenMints(fromToken.mint, toToken.mint);
        const isInputToken0 = fromToken.mint.equals(token0);
        
        const reserveIn = isInputToken0 ? poolReserves.reserve0 : poolReserves.reserve1;
        const reserveOut = isInputToken0 ? poolReserves.reserve1 : poolReserves.reserve0;
        
        const quote = calculateSwapOutput(amount, reserveIn, reserveOut);
        setQuoteData(quote);
        setToAmount(quote.amountOut.toFixed(6));
      } catch (error) {
        console.error('Error calculating quote:', error);
        showToast('Failed to calculate quote', 'error');
      } finally {
        setIsLoadingQuote(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [fromAmount, poolReserves, fromToken, toToken]);
  
  // Handle swap
  const handleSwap = async () => {
    // Validation
    if (!connected || !publicKey || !wallet) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }
    
    if (!fromAmount || !toAmount) {
      showToast('Please enter an amount to swap', 'warning');
      return;
    }
    
    if (!poolReserves) {
      showToast('Pool not found for this token pair. Create a pool first.', 'error');
      return;
    }
    
    const amountIn = parseFloat(fromAmount);
    
    // Balance validation
    if (amountIn > fromBalance) {
      showToast(`Insufficient ${fromToken.symbol} balance`, 'error');
      return;
    }
    
    if (amountIn <= 0) {
      showToast('Amount must be greater than zero', 'warning');
      return;
    }
    
    // Show pending modal
    setTxModal({
      isOpen: true,
      status: 'pending',
      message: `Swapping ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}...`,
    });
    
    try {
      const expectedOut = parseFloat(toAmount);
      const slippageBps = parseFloat(slippage);
      const minimumOut = expectedOut * (1 - slippageBps / 100);
      
      console.log('🔄 Initiating swap:', {
        from: fromToken.symbol,
        to: toToken.symbol,
        amountIn,
        expectedOut,
        minimumOut,
        slippage: slippageBps,
      });
      
      const signature = await swapBaseInput(
        connection,
        wallet,
        publicKey,
        fromToken.mint,
        toToken.mint,
        amountIn,
        minimumOut,
        slippageBps
      );
      
      // Show success modal
      setTxModal({
        isOpen: true,
        status: 'success',
        message: `Successfully swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}!`,
        txSignature: signature,
      });
      
      showToast(`Swap successful!`, 'success', signature);
      
      // Reset form
      setFromAmount('');
      setToAmount('');
      setQuoteData(null);
      
    } catch (error: any) {
      console.error('Swap error:', error);
      
      // Parse error message
      let errorMessage = 'Swap failed. Please try again.';
      if (error.message) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transaction was rejected';
        } else if (error.message.includes('insufficient')) {
          errorMessage = 'Insufficient balance or liquidity';
        } else if (error.message.includes('slippage')) {
          errorMessage = 'Price moved too much. Increase slippage tolerance.';
        } else {
          errorMessage = error.message;
        }
      }
      
      // Show error modal
      setTxModal({
        isOpen: true,
        status: 'error',
        message: errorMessage,
      });
      
      showToast(errorMessage, 'error');
    }
  };
  
  // Handle token switch
  const handleSwitchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFromBalance(toBalance);
    setToBalance(fromBalance);
  };
  
  // Handle max button
  const handleMax = () => {
    if (fromBalance > 0) {
      setFromAmount(fromBalance.toString());
      showToast(`Set to maximum: ${fromBalance} ${fromToken.symbol}`, 'info');
    } else {
      showToast(`No ${fromToken.symbol} balance available`, 'warning');
    }
  };
  
  const tokenList = getTokenList();

  return (
    <>
      <div className="relative min-h-screen overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 font-heading">
              <span className="gradient-text">Swap Tokens</span>
            </h1>
            <p className="text-gray-400 text-base sm:text-lg">Trade tokens instantly with the best rates</p>
          </div>

          {/* Main Swap Card */}
          <div className="card p-4 sm:p-6 md:p-8 relative overflow-hidden">
            {/* Settings Button */}
            <div className="absolute top-4 sm:top-6 right-4 sm:right-6">
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
              <div className="mb-6 p-4 bg-dark-900/50 rounded-xl border border-white/10 animate-scale-in">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <span>⚙️</span> Transaction Settings
                </h3>
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Slippage Tolerance</label>
                  <div className="flex flex-wrap gap-2">
                    {['0.1', '0.5', '1.0', '2.0'].map((val) => (
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
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Your transaction will revert if price changes unfavorably by more than this percentage.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {/* From Token */}
              <div className="relative">
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-gray-400 font-medium">You Pay</label>
                  <span className="text-xs text-gray-500">
                    Balance: <span className="text-brand-cyan font-semibold">{fromBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  </span>
                </div>
                <div className="bg-dark-900/50 rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-brand-cyan/30 transition-all duration-300">
                  <div className="flex justify-between items-center gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={fromAmount}
                        onChange={(e) => setFromAmount(e.target.value)}
                        className="bg-transparent text-2xl sm:text-3xl font-bold outline-none w-full placeholder:text-gray-600"
                      />
                      <div className="text-xs sm:text-sm text-gray-500 mt-1">~$0.00</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="relative">
                        <button 
                          onClick={() => setShowFromTokenList(!showFromTokenList)}
                          className="flex items-center gap-2 bg-gradient-brand px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold hover:brightness-110 transition-all duration-300 shadow-glow-brand text-sm"
                        >
                          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs font-bold text-gray-900">
                            {fromToken.symbol[0]}
                          </div>
                          <span className="hidden sm:inline">{fromToken.symbol}</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {/* Token Dropdown */}
                        {showFromTokenList && (
                          <div className="absolute top-full mt-2 right-0 bg-dark-800 rounded-xl border border-white/10 shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto custom-scrollbar">
                            {tokenList.filter(t => t.symbol !== toToken.symbol).map((token) => (
                              <button
                                key={token.symbol}
                                onClick={() => {
                                  setFromToken(token);
                                  setShowFromTokenList(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-gradient-brand rounded-full flex items-center justify-center text-sm font-bold">
                                  {token.symbol[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold">{token.symbol}</div>
                                  <div className="text-xs text-gray-500 truncate">{token.name}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={handleMax}
                        className="text-xs text-brand-cyan hover:text-brand-pink transition-colors font-semibold px-2 py-1 rounded bg-brand-cyan/10 hover:bg-brand-pink/10"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center -my-3 relative z-10">
                <button 
                  onClick={handleSwitchTokens}
                  className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-brand rounded-2xl flex items-center justify-center transition-all hover:scale-110 hover:rotate-180 duration-300 shadow-glow-brand"
                >
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* To Token */}
              <div className="relative">
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-gray-400 font-medium">You Receive</label>
                  <span className="text-xs text-gray-500">
                    Balance: <span className="text-brand-cyan font-semibold">{toBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  </span>
                </div>
                <div className="bg-dark-900/50 rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-brand-pink/30 transition-all duration-300 relative">
                  {isLoadingQuote && (
                    <div className="absolute inset-0 flex items-center justify-center bg-dark-900/50 backdrop-blur-sm rounded-2xl">
                      <div className="w-6 h-6 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={toAmount}
                        readOnly
                        className="bg-transparent text-2xl sm:text-3xl font-bold outline-none w-full placeholder:text-gray-600"
                      />
                      <div className="text-xs sm:text-sm text-gray-500 mt-1">~$0.00</div>
                    </div>
                    <div className="relative">
                      <button 
                        onClick={() => setShowToTokenList(!showToTokenList)}
                        className="flex items-center gap-2 bg-gradient-brand px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-semibold hover:brightness-110 transition-all duration-300 shadow-glow-brand text-sm"
                      >
                        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs font-bold text-gray-900">
                          {toToken.symbol[0]}
                        </div>
                        <span className="hidden sm:inline">{toToken.symbol}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {/* Token Dropdown */}
                      {showToTokenList && (
                        <div className="absolute top-full mt-2 right-0 bg-dark-800 rounded-xl border border-white/10 shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto custom-scrollbar">
                          {tokenList.filter(t => t.symbol !== fromToken.symbol).map((token) => (
                            <button
                              key={token.symbol}
                              onClick={() => {
                                setToToken(token);
                                setShowToTokenList(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                            >
                              <div className="w-8 h-8 bg-gradient-brand rounded-full flex items-center justify-center text-sm font-bold">
                                {token.symbol[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold">{token.symbol}</div>
                                <div className="text-xs text-gray-500 truncate">{token.name}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Box */}
            {quoteData && (
              <div className="mt-6 p-4 bg-dark-900/50 border border-white/10 rounded-xl">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Rate</span>
                    <span className="font-semibold">
                      1 {fromToken.symbol} = {(quoteData.amountOut / parseFloat(fromAmount || '1')).toFixed(4)} {toToken.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Price Impact</span>
                    <span className={`font-semibold ${quoteData.priceImpact > 1 ? 'text-red-400' : quoteData.priceImpact > 0.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {quoteData.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Min. Received</span>
                    <span className="font-semibold">
                      {(parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Trading Fee</span>
                    <span className="font-semibold">{quoteData.fee.toFixed(6)} {fromToken.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <span className="text-gray-400">Route</span>
                    <span className="font-semibold text-brand-cyan text-xs">Kedolik AMM</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pool Not Found Warning */}
            {!poolReserves && fromAmount && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg animate-scale-in">
                <div className="text-xs text-center text-yellow-400 flex items-center justify-center gap-2">
                  <span>⚠️</span> Pool not found for {fromToken.symbol}/{toToken.symbol}. Please create a pool first.
                </div>
              </div>
            )}

            {/* Swap Action Button */}
            <button 
              onClick={handleSwap}
              disabled={!connected || !poolReserves || !fromAmount || !toAmount || isLoadingQuote}
              className="w-full btn-primary mt-6 text-base sm:text-lg py-3 sm:py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:brightness-100 flex items-center justify-center gap-2"
            >
              {!connected ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Connect Wallet to Swap
                </>
              ) : isLoadingQuote ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Calculating...
                </>
              ) : !poolReserves ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Pool Not Available
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Swap
                </>
              )}
            </button>
          </div>

          {/* Network Info */}
          <div className="mt-6 p-4 bg-dark-900/30 border border-white/5 rounded-xl text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span>Connected to <span className="text-brand-cyan font-semibold">Devnet</span></span>
            </div>
          </div>
        </div>
      </div>
      
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

export default Swap;
