import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { DEVNET_TOKENS, TokenInfo, getTokenList } from '../config/tokens';
import { ToastContainer, ToastType } from '../components/Toast';
import { TransactionModal } from '../components/TransactionModal';
import { 
  fetchPools, 
  calculateSwapOutput, 
  swapBaseInput,
  getPoolState,
  sortTokenMints,
  getTokenBalance,
  clearPoolCache,
} from '../utils/amm';
import { 
  findBestRoute, 
  executeMultiHopSwap,
  SwapRoute, 
  calculateRouteOutput 
} from '../utils/routing';

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
  const [poolRefreshTrigger, setPoolRefreshTrigger] = useState(0);
  
  // Multi-hop routing
  const [swapRoute, setSwapRoute] = useState<SwapRoute | null>(null);
  const [isMultiHop, setIsMultiHop] = useState(false);
  
  // Toast notifications state
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: ToastType;
    txSignature?: string;
  }>>([]);
  
  // Refs for click-outside handling
  const fromTokenDropdownRef = useRef<HTMLDivElement>(null);
  const toTokenDropdownRef = useRef<HTMLDivElement>(null);
  
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
  
  // Cooldown to prevent rapid-fire transactions
  const [isTransactionInProgress, setIsTransactionInProgress] = useState(false);
  
  // Toast helper functions
  const showToast = (message: string, type: ToastType, txSignature?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, txSignature }]);
  };
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  // Fetch token balances
  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fromTokenDropdownRef.current && !fromTokenDropdownRef.current.contains(event.target as Node)) {
        setShowFromTokenList(false);
      }
      if (toTokenDropdownRef.current && !toTokenDropdownRef.current.contains(event.target as Node)) {
        setShowToTokenList(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicKey || !connected) {
        setFromBalance(0);
        setToBalance(0);
        return;
      }
      
      try {
        // Fetch from token balance (handles both native SOL and SPL tokens)
        const fromBal = await getTokenBalance(connection, fromToken.mint, publicKey);
        setFromBalance(fromBal);
        
        // Fetch to token balance (handles both native SOL and SPL tokens)
        const toBal = await getTokenBalance(connection, toToken.mint, publicKey);
        setToBalance(toBal);
      } catch (error) {
        console.error('Error fetching balances:', error);
        showToast('Failed to fetch token balances', 'error');
      }
    };
    
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000); // Update every 15s
    return () => clearInterval(interval);
  }, [publicKey, connected, fromToken, toToken, connection]);
  
  // Fetch pool reserves and check for routes
  useEffect(() => {
    const fetchPoolData = async () => {
      try {
        // Check if trying to swap same token (including WSOL <-> Native SOL)
        const { isNativeSOL } = await import('../utils/amm');
        const isSameToken = fromToken.mint.equals(toToken.mint) || 
                           (isNativeSOL(fromToken.mint) && isNativeSOL(toToken.mint));
        
        if (isSameToken) {
          console.log('⚠️ Cannot swap between the same token');
          setPoolReserves(null);
          setSwapRoute(null);
          setIsMultiHop(false);
          return;
        }
        
        const { token0, token1 } = sortTokenMints(fromToken.mint, toToken.mint);
        const poolState = getPoolState(token0, token1);
        
        console.log('🔄 Fetching pool/route for:', {
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          poolState: poolState.toString(),
        });
        
        const pools = await fetchPools(connection, wallet);
        const pool = pools.find(p => p.address.equals(poolState));
        
        if (pool) {
          // Direct pool found
          console.log('✅ Direct pool found:', {
            reserve0: pool.token0Reserve,
            reserve1: pool.token1Reserve,
          });
          setPoolReserves({
            reserve0: pool.token0Reserve,
            reserve1: pool.token1Reserve,
          });
          setIsMultiHop(false);
          setSwapRoute(null);
        } else {
          // No direct pool, look for multi-hop route
          console.log('❌ No direct pool found, searching for multi-hop route...');
          setPoolReserves(null);
          
          try {
            const route = await findBestRoute(
              fromToken.mint,
              toToken.mint,
              1, // Test with 1 token to find route
              connection,
              wallet,
              3 // Max 3 hops
            );
            
            if (route) {
              console.log('✅ Multi-hop route found:', {
                hops: route.hops,
                expectedOutput: route.expectedOutput,
              });
              setSwapRoute(route);
              setIsMultiHop(true);
            } else {
              console.log('❌ No route found');
              setSwapRoute(null);
              setIsMultiHop(false);
            }
          } catch (error) {
            console.error('Error finding route:', error);
            setSwapRoute(null);
            setIsMultiHop(false);
          }
        }
      } catch (error) {
        console.error('Error fetching pool data:', error);
        setPoolReserves(null);
        setSwapRoute(null);
        setIsMultiHop(false);
      }
    };
    
    fetchPoolData();
    
    // Refresh less frequently to avoid RPC rate limits (every 15 seconds)
    // Pool cache handles updates between refreshes
    const interval = setInterval(fetchPoolData, 15000);
    return () => clearInterval(interval);
  }, [fromToken, toToken, connection, wallet, poolRefreshTrigger]);
  
  // Calculate quote when amount changes (handles both direct and multi-hop)
  useEffect(() => {
    if (!fromAmount) {
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
    
    // Calculate immediately for instant feedback (no debounce)
    // This provides instant visual feedback while the accurate calculation is pending
    const calculateQuote = () => {
      try {
        if (poolReserves) {
          // Direct pool swap
          const { token0 } = sortTokenMints(fromToken.mint, toToken.mint);
          const isInputToken0 = fromToken.mint.equals(token0);
          
          const reserveIn = isInputToken0 ? poolReserves.reserve0 : poolReserves.reserve1;
          const reserveOut = isInputToken0 ? poolReserves.reserve1 : poolReserves.reserve0;
          
          const quote = calculateSwapOutput(amount, reserveIn, reserveOut);
          setQuoteData(quote);
          setToAmount(quote.amountOut.toFixed(6));
        } else if (swapRoute) {
          // Multi-hop swap - use actual fee rates from pools
          const { expectedOutput, priceImpact } = calculateRouteOutput(swapRoute, amount);
          
          // Calculate total fee more accurately based on actual pool fees
          let totalFee = 0;
          let currentAmount = amount;
          for (const pool of swapRoute.pools) {
            const feeRate = pool.tradeFeeRate / 1000000; // Convert basis points to decimal
            const hopFee = currentAmount * feeRate;
            totalFee += hopFee;
            currentAmount = currentAmount - hopFee; // Reduce amount for next hop
          }
          
          setQuoteData({
            amountOut: expectedOutput,
            priceImpact,
            fee: totalFee,
          });
          setToAmount(expectedOutput.toFixed(6));
        } else {
          setToAmount('');
          setQuoteData(null);
        }
      } catch (error) {
        console.error('Error calculating quote:', error);
      }
    };
    
    // Call immediately for instant feedback
    setIsLoadingQuote(true);
    calculateQuote();
    
    // Also use a tiny debounce to prevent excessive re-renders during fast typing
    const timer = setTimeout(() => {
      calculateQuote();
      setIsLoadingQuote(false);
    }, 50); // Minimal debounce (50ms) for render optimization
    
    return () => clearTimeout(timer);
  }, [fromAmount, poolReserves, swapRoute, fromToken, toToken]);
  
  // Handle swap
  const handleSwap = async () => {
    // Prevent multiple transactions at once
    if (isTransactionInProgress) {
      showToast('Transaction already in progress. Please wait...', 'warning');
      return;
    }
    
    // Clear any existing toasts and modals first
    setToasts([]);
    setTxModal({
      isOpen: false,
      status: 'pending',
      message: '',
    });
    
    // Validation
    if (!connected || !publicKey || !wallet) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }
    
    if (!fromAmount || !toAmount) {
      showToast('Please enter an amount to swap', 'warning');
      return;
    }
    
    if (!poolReserves && !swapRoute) {
      showToast('No swap route found. Try creating a pool or using different tokens.', 'error');
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
    
    // Mark transaction as in progress
    setIsTransactionInProgress(true);
    
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
        type: isMultiHop ? 'multi-hop' : 'direct',
        from: fromToken.symbol,
        to: toToken.symbol,
        amountIn,
        expectedOut,
        minimumOut,
        slippage: slippageBps,
      });
      
      let signature: string;
      
      if (isMultiHop && swapRoute) {
        // Execute multi-hop swap in ONE transaction
        console.log('🔄 Executing multi-hop swap (atomic transaction)...');
        const signatures = await executeMultiHopSwap(
          swapRoute,
          amountIn,
          minimumOut,
          connection,
          wallet,
          publicKey,
          slippageBps
        );
        signature = signatures[0]; // Only one signature for atomic transaction
        console.log('✅ Multi-hop swap completed atomically');
      } else {
        // Execute direct swap
        signature = await swapBaseInput(
          connection,
          wallet,
          publicKey,
          fromToken.mint,
          toToken.mint,
          amountIn,
          minimumOut,
          slippageBps
        );
      }
      
      // Show success modal with explorer link
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
      
      // Clear pool cache and trigger refresh after successful swap
      console.log('🔄 Clearing cache and triggering pool refresh after successful swap');
      clearPoolCache(); // Clear cache to force fresh fetch
      setPoolRefreshTrigger(prev => prev + 1);
      
      // Refresh balances and pool reserves after successful swap
      setTimeout(() => {
        console.log('⏱️ Delayed refresh - updating balances and pool reserves');
        
        // Trigger balance refresh by re-fetching
        const refreshBalances = async () => {
          if (!publicKey) return;
          
          // Fetch balances (handles both native SOL and SPL tokens)
          const fromBal = await getTokenBalance(connection, fromToken.mint, publicKey);
          setFromBalance(fromBal);
          
          const toBal = await getTokenBalance(connection, toToken.mint, publicKey);
          setToBalance(toBal);
        };
        refreshBalances();
        
        // Also trigger another pool refresh to ensure we have latest data
        setPoolRefreshTrigger(prev => prev + 1);
      }, 2000); // Wait 2 seconds for transaction to finalize
      
      // Mark transaction as complete after a delay to prevent rapid re-clicking
      // Longer delay for multi-hop to ensure state updates
      setTimeout(() => {
        setIsTransactionInProgress(false);
      }, isMultiHop ? 5000 : 3000);
      
    } catch (error: unknown) {
      // Mark transaction as complete on error
      setIsTransactionInProgress(false);
      console.error('Swap error:', error);
      const e = error as { message?: string; logs?: unknown; code?: unknown; name?: string };
      console.error('Error details:', {
        message: e?.message,
        logs: e?.logs,
        code: e?.code,
        name: e?.name,
      });
      
      // Parse error message
      let errorMessage = 'Swap failed. Please try again.';
      
      if (e?.message) {
        const msg = e.message.toLowerCase();
        
        if (msg.includes('user rejected') || msg.includes('user declined')) {
          errorMessage = 'Transaction was rejected by user';
        } else if (msg.includes('insufficient')) {
          errorMessage = 'Insufficient balance or liquidity in pool';
        } else if (msg.includes('slippage')) {
          errorMessage = 'Price moved too much. Try increasing slippage tolerance.';
        } else if (msg.includes('already in progress')) {
          errorMessage = 'Another transaction is pending. Please wait.';
        } else if (msg.includes('simulation failed')) {
          type ErrWithLogs = { logs?: unknown };
          const logs = (e as ErrWithLogs)?.logs as string[] | undefined;
          if (Array.isArray(logs)) {
            const errorLog = logs.find((log: string) => log.includes('Error:'));
            if (errorLog) {
              errorMessage = `Simulation failed: ${errorLog}`;
            } else {
              errorMessage = 'Transaction simulation failed. Pool may not exist or have insufficient liquidity.';
            }
          } else {
            errorMessage = 'Transaction simulation failed. Check pool liquidity and token balances.';
          }
        } else if (msg.includes('blockhash not found')) {
          errorMessage = 'Network congestion. Please try again.';
        } else if (msg.includes('custom program error')) {
          errorMessage = 'Smart contract error. Check token amounts and slippage.';
        } else {
          // Use the actual error message if it's short enough
          const full = e?.message || '';
          errorMessage = full.length > 100 
            ? full.substring(0, 100) + '...' 
            : full;
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
    // Don't allow switching if tokens are the same (edge case)
    if (fromToken.mint.equals(toToken.mint)) {
      return;
    }
    
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFromBalance(toBalance);
    setToBalance(fromBalance);
  };
  
  // Percentage quick-fill handled inline with buttons
  
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
          <div className="card p-4 sm:p-6 md:p-8 relative">
            {/* Settings Button - No overlap */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-300">Trade Details</h3>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-all duration-300 group ${
                  showSettings ? 'bg-gradient-brand text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                title="Slippage Settings"
              >
                <svg className={`w-5 h-5 transition-transform duration-300 ${showSettings ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Settings Panel - Fixed positioning to avoid overlap */}
            {showSettings && (
              <div className="mb-6 p-4 sm:p-5 bg-dark-900 rounded-xl border border-white/20 animate-scale-in shadow-xl">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-white">
                  <span>⚙️</span> Transaction Settings
                </h3>
                <div>
                  <label className="text-xs text-gray-400 mb-3 block font-medium">Slippage Tolerance</label>
                  <div className="grid grid-cols-5 gap-2">
                    {['0.1', '0.5', '1.0', '2.0'].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSlippage(val)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                          slippage === val
                            ? 'bg-gradient-brand text-white shadow-glow-brand'
                            : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      max={50}
                      value={slippage}
                      onChange={(e) => {
                        const v = e.target.value;
                        // clamp to 0-50
                        const n = Math.max(0, Math.min(50, parseFloat(v || '0')));
                        setSlippage(isNaN(n) ? '0.5' : n.toString());
                      }}
                      className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-200 focus:outline-none focus:border-brand-cyan"
                      placeholder="Custom"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-3 bg-white/5 p-2 rounded">
                    💡 Your transaction will revert if price changes unfavorably by more than this percentage.
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
                    Balance: <span className="text-brand-cyan font-semibold">{fromBalance.toFixed(2)}</span>
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
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="relative" ref={fromTokenDropdownRef}>
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
                        {fromToken.symbol !== 'SOL' && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(fromToken.mint.toString());
                              showToast('Contract address copied!', 'success');
                            }}
                            className="mt-2 w-full px-2 py-1.5 text-[10px] sm:text-xs text-gray-400 hover:text-brand-cyan bg-dark-900/50 hover:bg-brand-cyan/10 rounded-lg transition-all border border-white/5 hover:border-brand-cyan/30 flex items-center gap-1.5 justify-center"
                            title="Copy contract address"
                          >
                            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">Copy CA</span>
                          </button>
                        )}
                        
                        {/* Token Dropdown */}
                        {showFromTokenList && (
                          <div className="absolute top-full mt-2 right-0 bg-dark-900 rounded-xl border border-white/30 shadow-2xl z-[100] min-w-[220px] max-h-[300px] overflow-y-auto custom-scrollbar">
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
                      <div className="grid grid-cols-4 gap-1">
                        {[25,50,75,100].map(pct => (
                          <button
                            key={pct}
                            onClick={() => {
                              const amt = (fromBalance * pct) / 100;
                              setFromAmount(amt.toString());
                            }}
                            className={`text-[10px] sm:text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors ${pct===100 ? 'text-brand-cyan' : 'text-gray-300'}`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
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
                    Balance: <span className="text-brand-cyan font-semibold">{toBalance.toFixed(2)}</span>
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
                    </div>
                    <div className="relative" ref={toTokenDropdownRef}>
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
                      {toToken.symbol !== 'SOL' && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(toToken.mint.toString());
                            showToast('Contract address copied!', 'success');
                          }}
                          className="mt-2 w-full px-2 py-1.5 text-[10px] sm:text-xs text-gray-400 hover:text-brand-cyan bg-dark-900/50 hover:bg-brand-cyan/10 rounded-lg transition-all border border-white/5 hover:border-brand-cyan/30 flex items-center gap-1.5 justify-center"
                          title="Copy contract address"
                        >
                          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium">Copy CA</span>
                        </button>
                      )}
                      
                      {/* Token Dropdown */}
                      {showToTokenList && (
                        <div className="absolute top-full mt-2 right-0 bg-dark-900 rounded-xl border border-white/30 shadow-2xl z-[100] min-w-[220px] max-h-[300px] overflow-y-auto custom-scrollbar">
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

            {/* Swap Info - Enhanced */}
            {quoteData && (
              <div className="mt-6 p-4 bg-dark-900 rounded-xl border border-white/20">
                <div className="space-y-2.5 text-sm">
                  {/* Rate */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Rate</span>
                    <span className="font-semibold text-white">
                      1 {fromToken.symbol} ≈ {(quoteData.amountOut / parseFloat(fromAmount || '1')).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                  
                  {/* Price Impact with color coding */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1">
                      Price Impact
                      <span className="text-xs">💹</span>
                    </span>
                    <span className={`font-semibold ${
                      quoteData.priceImpact < 1 ? 'text-green-400' :
                      quoteData.priceImpact < 3 ? 'text-yellow-400' :
                      quoteData.priceImpact < 5 ? 'text-orange-400' :
                      'text-red-400'
                    }`}>
                      {quoteData.priceImpact < 0.01 ? '< 0.01' : quoteData.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  
                  {/* Slippage Tolerance */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Slippage Tolerance</span>
                    <span className="font-semibold text-white">
                      {slippage}%
                    </span>
                  </div>
                  
                  {/* Fee */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Estimated Fee</span>
                    <span className="font-semibold text-white">
                      {quoteData.fee.toFixed(6)} {fromToken.symbol}
                    </span>
                  </div>
                  
                  {/* Min Received */}
                  <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <span className="text-gray-400 font-medium">Min. Received</span>
                    <span className="font-bold text-brand-cyan">
                      {(parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                  
                  {/* Route for multi-hop (label simplified, no hop count) */}
                  {isMultiHop && swapRoute && (
                    <div className="flex justify-between items-center pt-2 border-t border-white/10">
                      <span className="text-gray-400">Route</span>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-semibold text-brand-cyan text-xs">
                          {swapRoute.path.map((mint) => {
                            const token = getTokenList().find(t => t.mint.equals(mint));
                            return token?.symbol || '?';
                          }).join(' → ')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* High Price Impact Warning */}
            {quoteData && quoteData.priceImpact > 5 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg animate-scale-in">
                <div className="text-xs text-center text-red-400 flex items-center justify-center gap-2">
                  <span>⚠️</span> High price impact ({quoteData.priceImpact.toFixed(2)}%)! Consider adding more liquidity to pools or reducing swap amount.
                </div>
              </div>
            )}
            
            {/* No Route Warning */}
            {!poolReserves && !swapRoute && fromAmount && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg animate-scale-in">
                <div className="text-xs text-center text-yellow-400 flex items-center justify-center gap-2">
                  <span>⚠️</span> No swap route found for {fromToken.symbol}/{toToken.symbol}. Create a direct pool or intermediate pools.
                </div>
              </div>
            )}
            
            {/* Multi-Hop Info hidden as requested */}

            {/* Swap Action Button */}
            <button 
              onClick={handleSwap}
              disabled={!connected || (!poolReserves && !swapRoute) || !fromAmount || !toAmount || isLoadingQuote}
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
              ) : !poolReserves && !swapRoute ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  No Route Available
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
        onClose={() => setTxModal({ 
          isOpen: false, 
          status: 'pending', 
          message: '',
          txSignature: undefined 
        })}
      />
    </>
  );
};

export default Swap;
