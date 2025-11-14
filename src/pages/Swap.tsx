import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { DEVNET_TOKENS, TokenInfo, getTokenList } from '../config/tokens';
import { ToastContainer, ToastType } from '../components/Toast';
import { TransactionModal } from '../components/TransactionModal';
import { TokenSelectModal } from '../components/TokenSelectModal';
import { 
  fetchPools, 
  calculateSwapOutput, 
  swapBaseInput,
  swapWithKedologDiscount,
  calculateKedologFee,
  getPoolState,
  sortTokenMints,
  getTokenBalance,
  clearPoolCache,
  WSOL_MINT,
} from '../utils/amm';
import { KEDOLOG_CONFIG } from '../config/fees';
import { SOL_MINT, KEDOLOG_MINT, USDC_MINT } from '../config/addresses';
import { 
  findBestRoute, 
  executeMultiHopSwap,
  SwapRoute, 
  calculateRouteOutput 
} from '../utils/routing';
import { isKedologDiscountAvailable, KedologAvailability } from '../utils/swapRestrictions';

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
  const [toToken, setToToken] = useState<TokenInfo>(DEVNET_TOKENS.KEDOLOG);
  const [showFromTokenModal, setShowFromTokenModal] = useState(false);
  const [showToTokenModal, setShowToTokenModal] = useState(false);
  
  // Balances
  const [fromBalance, setFromBalance] = useState<number>(0);
  const [toBalance, setToBalance] = useState<number>(0);
  
  // USD prices for display
  const [fromTokenUsdPrice, setFromTokenUsdPrice] = useState<number>(0);
  const [toTokenUsdPrice, setToTokenUsdPrice] = useState<number>(0);
  
  // Pool data
  const [poolReserves, setPoolReserves] = useState<{ reserve0: number; reserve1: number; tradeFeeRate: number } | null>(null);
  const [quoteData, setQuoteData] = useState<{ amountOut: number; priceImpact: number; fee: number; bonusAmount?: number } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [poolRefreshTrigger, setPoolRefreshTrigger] = useState(0);
  
  // Multi-hop routing
  const [swapRoute, setSwapRoute] = useState<SwapRoute | null>(null);
  const [isMultiHop, setIsMultiHop] = useState(false);
  
  // KEDOLOG discount feature
  const [useKedologDiscount, setUseKedologDiscount] = useState(false);
  const [kedologBalance, setKedologBalance] = useState<number>(0);
  const [isLoadingKedologFee, setIsLoadingKedologFee] = useState(false);
  const [kedologAvailability, setKedologAvailability] = useState<KedologAvailability>({ available: true });
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [estimatedKedologFee, setEstimatedKedologFee] = useState<{
    kedologFee: number;
    discountedFeeUsd: number;
    normalFeeUsd: number;
    protocolFeeInInputToken: number;
    savingsInInputToken: number;
    lpFeeInInputToken: number;
    totalFeeInInputToken: number;
    discountedTotalFeeInInputToken: number;
  } | null>(null);
  
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
  
  // Cooldown to prevent rapid-fire transactions
  const [isTransactionInProgress, setIsTransactionInProgress] = useState(false);
  
  // Toast helper functions
  const showToast = (message: string, type: ToastType, txSignature?: string) => {
    // Use timestamp + random number to ensure unique IDs even when called in same millisecond
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
        // Fetch from token balance (handles both native SOL and SPL tokens)
        const fromBal = await getTokenBalance(connection, fromToken.mint, publicKey);
        setFromBalance(fromBal);
        
        // Fetch to token balance (handles both native SOL and SPL tokens)
        const toBal = await getTokenBalance(connection, toToken.mint, publicKey);
        setToBalance(toBal);
        
        // Fetch KEDOLOG balance
        const kedologBal = await getTokenBalance(connection, KEDOLOG_CONFIG.MINT, publicKey);
        setKedologBalance(kedologBal);
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
            tradeFeeRate: pool.tradeFeeRate,
          });
          setPoolReserves({
            reserve0: pool.token0Reserve,
            reserve1: pool.token1Reserve,
            tradeFeeRate: pool.tradeFeeRate,
          });
          setPoolAddress(pool.address.toString());
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
  
  // Check KEDOLOG discount availability when tokens change
  useEffect(() => {
    try {
      const poolPubkey = poolAddress ? new PublicKey(poolAddress) : undefined;
      
      const availability = isKedologDiscountAvailable(
        fromToken.mint,
        toToken.mint,
        poolPubkey
      );
      
      setKedologAvailability(availability);
      
      // Auto-disable if not available (but don't show toast to avoid spam)
      if (!availability.available && useKedologDiscount) {
        setUseKedologDiscount(false);
      }
    } catch (error) {
      console.error('Error checking KEDOLOG availability:', error);
      setKedologAvailability({ available: true }); // Default to available on error
    }
  }, [fromToken, toToken, poolAddress, useKedologDiscount]);
  
  // Fetch USD prices for tokens
  useEffect(() => {
    const fetchUsdPrices = async () => {
      if (!connection) return;
      
      try {
        const { getTokenUsdPrice } = await import('../utils/prices');
        const [fromPrice, toPrice] = await Promise.all([
          getTokenUsdPrice(connection, fromToken.mint.toString(), fromToken.symbol),
          getTokenUsdPrice(connection, toToken.mint.toString(), toToken.symbol),
        ]);
        setFromTokenUsdPrice(fromPrice);
        setToTokenUsdPrice(toPrice);
      } catch (error) {
        console.error('Error fetching USD prices:', error);
        setFromTokenUsdPrice(0);
        setToTokenUsdPrice(0);
      }
    };
    
    fetchUsdPrices();
  }, [connection, fromToken, toToken]);
  
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
          // Direct pool swap - use pool's actual fee rate
          const { token0 } = sortTokenMints(fromToken.mint, toToken.mint);
          const isInputToken0 = fromToken.mint.equals(token0);
          
          const reserveIn = isInputToken0 ? poolReserves.reserve0 : poolReserves.reserve1;
          const reserveOut = isInputToken0 ? poolReserves.reserve1 : poolReserves.reserve0;
          
          // Apply KEDOLOG discount if enabled: only LP fee (0.20%) is taken from input
          // Protocol fee (0.05%) is paid in KEDOLOG, so effective fee is 2000 instead of 2500
          const effectiveFeeRate = useKedologDiscount ? 2000 : poolReserves.tradeFeeRate;
          
          const quote = calculateSwapOutput(amount, reserveIn, reserveOut, effectiveFeeRate);
          
          // Calculate bonus amount if discount is enabled (for UI display)
          let bonusAmount = 0;
          if (useKedologDiscount && poolReserves.tradeFeeRate !== 2000) {
            const normalQuote = calculateSwapOutput(amount, reserveIn, reserveOut, poolReserves.tradeFeeRate);
            bonusAmount = quote.amountOut - normalQuote.amountOut;
          }
          
          setQuoteData({ ...quote, bonusAmount });
          setToAmount(quote.amountOut.toFixed(6));
        } else if (swapRoute) {
          // Multi-hop swap - apply KEDOLOG discount if enabled
          let expectedOutput = 0;
          let priceImpact = 0;
          let totalFee = 0;
          let bonusAmount = 0;
          
          if (useKedologDiscount) {
            // Calculate with KEDOLOG discount: only LP fee (0.20%) per hop
            let currentAmount = amount;
            
            for (let i = 0; i < swapRoute.pools.length; i++) {
              const pool = swapRoute.pools[i];
              const inputMint = swapRoute.path[i];
              const isInputToken0 = inputMint.equals(pool.token0Mint);
              
              const reserveIn = isInputToken0 ? pool.token0Reserve : pool.token1Reserve;
              const reserveOut = isInputToken0 ? pool.token1Reserve : pool.token0Reserve;
              
              // Only LP fee (0.20% = 2000 basis points) is taken from input
              const lpFeeRate = 2000;
              const quote = calculateSwapOutput(currentAmount, reserveIn, reserveOut, lpFeeRate);
              
              totalFee += quote.fee;
              priceImpact += quote.priceImpact;
              currentAmount = quote.amountOut;
            }
            
            expectedOutput = currentAmount;
            
            // Calculate bonus (difference vs normal fees)
            const normalOutput = calculateRouteOutput(swapRoute, amount).expectedOutput;
            bonusAmount = expectedOutput - normalOutput;
            
            console.log('💰 Multi-hop with discount:', {
              normalOutput,
              discountedOutput: expectedOutput,
              bonus: bonusAmount,
            });
          } else {
            // Normal multi-hop calculation
            const routeOutput = calculateRouteOutput(swapRoute, amount);
            expectedOutput = routeOutput.expectedOutput;
            priceImpact = routeOutput.priceImpact;
            
            // Calculate total fee
          let currentAmount = amount;
          for (const pool of swapRoute.pools) {
              const feeRate = pool.tradeFeeRate / 1000000;
            const hopFee = currentAmount * feeRate;
            totalFee += hopFee;
              currentAmount = currentAmount - hopFee;
            }
          }
          
          setQuoteData({
            amountOut: expectedOutput,
            priceImpact,
            fee: totalFee,
            bonusAmount,
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
  }, [fromAmount, poolReserves, swapRoute, fromToken, toToken, useKedologDiscount]);
  
  // Calculate KEDOLOG fee estimate
  useEffect(() => {
    const calculateFee = async () => {
      if (!fromAmount || !wallet || !useKedologDiscount) {
        setEstimatedKedologFee(null);
        setIsLoadingKedologFee(false);
        return;
      }
      
      const amount = parseFloat(fromAmount);
      if (isNaN(amount) || amount <= 0) {
        setEstimatedKedologFee(null);
        setIsLoadingKedologFee(false);
        return;
      }
      
      try {
        setIsLoadingKedologFee(true);
        // Estimate USD value of the INPUT token
        // If input is a stablecoin (USDC/USDT), price is $1
        // Otherwise, try to estimate from the swap quote
        let inputTokenPrice = 1;
        
        if (fromToken.symbol === 'USDC' || fromToken.symbol === 'USDT') {
          // Input is a stablecoin - always $1
          inputTokenPrice = 1;
          console.log(`💰 ${fromToken.symbol} is a stablecoin: $1.00`);
        } else if (fromToken.symbol === 'SOL' || fromToken.mint.equals(SOL_MINT)) {
          // Input is SOL - get price from SOL/USDC pool
          try {
            const { getSolPrice } = await import('../utils/prices');
            inputTokenPrice = await getSolPrice(connection);
            console.log(`💰 SOL price from SOL/USDC pool: $${inputTokenPrice.toFixed(2)}`);
          } catch (error) {
            console.error('Error fetching SOL price:', error);
            // Fallback: try to calculate from quote if output is USDC
            if (quoteData && quoteData.amountOut > 0 && (toToken.symbol === 'USDC' || toToken.symbol === 'USDT')) {
              inputTokenPrice = quoteData.amountOut / amount;
              console.log(`💰 SOL price from quote fallback: $${inputTokenPrice.toFixed(2)}`);
            } else {
              inputTokenPrice = 150; // Conservative fallback
              console.log(`⚠️ Using fallback SOL price: $150`);
            }
          }
        } else if (fromToken.symbol === 'KEDOLOG' || fromToken.mint.equals(KEDOLOG_MINT)) {
          // Input is KEDOLOG - get price from KEDOLOG/USDC pool
          try {
            const { fetchKedologPrice } = await import('../utils/amm');
            inputTokenPrice = await fetchKedologPrice(connection, wallet);
            console.log(`💰 KEDOLOG price from KEDOLOG/USDC pool: $${inputTokenPrice.toFixed(6)}`);
          } catch (error) {
            console.error('Error fetching KEDOLOG price:', error);
            // Fallback: try to calculate from quote if output is USDC
            if (quoteData && quoteData.amountOut > 0 && (toToken.symbol === 'USDC' || toToken.symbol === 'USDT')) {
              inputTokenPrice = quoteData.amountOut / amount;
              console.log(`💰 KEDOLOG price from quote fallback: $${inputTokenPrice.toFixed(6)}`);
            } else {
              inputTokenPrice = 0.001; // Conservative fallback (~$0.001)
              console.log(`⚠️ Using fallback KEDOLOG price: $0.001`);
            }
          }
        } else if (quoteData && quoteData.amountOut > 0 && (toToken.symbol === 'USDC' || toToken.symbol === 'USDT')) {
          // Input is NOT a stablecoin, swapping TO a stablecoin - calculate input price directly
          inputTokenPrice = quoteData.amountOut / amount;
          console.log(`💰 Estimated ${fromToken.symbol} price from quote: $${inputTokenPrice.toFixed(2)} (${amount} ${fromToken.symbol} → ${quoteData.amountOut.toFixed(2)} ${toToken.symbol})`);
        } else {
          // Try to calculate token price via intermediate pools (TOKEN → SOL → USDC)
          try {
            console.log(`🔍 Calculating ${fromToken.symbol} price via pool discovery...`);
            
            // Get SOL price first
            const { getSolPrice } = await import('../utils/prices');
            const solPrice = await getSolPrice(connection);
            console.log(`💰 SOL price: $${solPrice.toFixed(2)}`);
            
            // Try to find TOKEN/SOL pool
            const { fetchPools } = await import('../utils/amm');
            const allPools = await fetchPools(connection, wallet);
            
            const tokenSolPool = allPools.find((pool) => 
              (pool.token0Mint.equals(fromToken.mint) && pool.token1Mint.equals(SOL_MINT)) ||
              (pool.token1Mint.equals(fromToken.mint) && pool.token0Mint.equals(SOL_MINT))
            );
            
            if (tokenSolPool) {
              // Calculate TOKEN price in SOL
              const { getAccount } = await import('@solana/spl-token');
              
              const isToken0Input = tokenSolPool.token0Mint.equals(fromToken.mint);
              const tokenVault = isToken0Input ? tokenSolPool.token0Vault : tokenSolPool.token1Vault;
              const solVault = isToken0Input ? tokenSolPool.token1Vault : tokenSolPool.token0Vault;
              
              const tokenVaultAccount = await getAccount(connection, tokenVault);
              const solVaultAccount = await getAccount(connection, solVault);
              
              const tokenDecimals = fromToken.decimals || 9;
              const solDecimals = 9;
              
              const tokenReserve = Number(tokenVaultAccount.amount) / Math.pow(10, tokenDecimals);
              const solReserve = Number(solVaultAccount.amount) / Math.pow(10, solDecimals);
              
              // Price = SOL reserve / TOKEN reserve * SOL price
              const tokenPriceInSol = solReserve / tokenReserve;
              inputTokenPrice = tokenPriceInSol * solPrice;
              
              console.log(`💰 ${fromToken.symbol} price calculated:`, {
                tokenReserve: tokenReserve.toFixed(4),
                solReserve: solReserve.toFixed(4),
                priceInSol: tokenPriceInSol.toFixed(6),
                priceInUsd: inputTokenPrice.toFixed(2),
              });
            } else {
              // Try TOKEN/USDC pool as fallback
              const tokenUsdcPool = allPools.find((pool) => 
                (pool.token0Mint.equals(fromToken.mint) && pool.token1Mint.equals(USDC_MINT)) ||
                (pool.token1Mint.equals(fromToken.mint) && pool.token0Mint.equals(USDC_MINT))
              );
              
              if (tokenUsdcPool) {
                const { getAccount } = await import('@solana/spl-token');
                
                const isToken0Input = tokenUsdcPool.token0Mint.equals(fromToken.mint);
                const tokenVault = isToken0Input ? tokenUsdcPool.token0Vault : tokenUsdcPool.token1Vault;
                const usdcVault = isToken0Input ? tokenUsdcPool.token1Vault : tokenUsdcPool.token0Vault;
                
                const tokenVaultAccount = await getAccount(connection, tokenVault);
                const usdcVaultAccount = await getAccount(connection, usdcVault);
                
                const tokenDecimals = fromToken.decimals || 9;
                const usdcDecimals = 6;
                
                const tokenReserve = Number(tokenVaultAccount.amount) / Math.pow(10, tokenDecimals);
                const usdcReserve = Number(usdcVaultAccount.amount) / Math.pow(10, usdcDecimals);
                
                // Price = USDC reserve / TOKEN reserve
                inputTokenPrice = usdcReserve / tokenReserve;
                
                console.log(`💰 ${fromToken.symbol} price from USDC pool:`, {
                  tokenReserve: tokenReserve.toFixed(4),
                  usdcReserve: usdcReserve.toFixed(2),
                  priceInUsd: inputTokenPrice.toFixed(2),
                });
              } else {
                console.warn(`⚠️ No pool found for ${fromToken.symbol}, using default: $1`);
                inputTokenPrice = 1;
              }
            }
          } catch (error) {
            console.error(`Error calculating ${fromToken.symbol} price:`, error);
            console.log(`⚠️ Using fallback price: $1`);
            inputTokenPrice = 1;
          }
        }
        
        if (isMultiHop && swapRoute) {
          // Calculate fee for EACH hop in the route
          console.log('💰 Calculating multi-hop KEDOLOG fees:', swapRoute.hops, 'hops');
          
          let totalKedologFee = 0;
          let totalProtocolFeeInInputToken = 0;
          let totalSavingsInInputToken = 0;
          let totalLpFeeInInputToken = 0;
          let currentAmount = amount;
          
          for (let i = 0; i < swapRoute.pools.length; i++) {
            const pool = swapRoute.pools[i];
            const inputMint = swapRoute.path[i];
            const outputMint = swapRoute.path[i + 1];
            
            // Calculate protocol fee for this hop (0.05% of input)
            const protocolFeeRate = 500; // 0.05% in basis points
            const protocolFeeAmount = (currentAmount * protocolFeeRate) / 1_000_000;
            
            // Calculate LP fee for this hop (0.20% of input)
            const lpFeeRate = 2000; // 0.20% in basis points
            const lpFeeAmount = (currentAmount * lpFeeRate) / 1_000_000;
            
            // Get KEDOLOG fee for this hop
            const hopFee = await calculateKedologFee(connection, wallet, currentAmount, inputTokenPrice);
            
            totalKedologFee += hopFee.kedologFee;
            totalProtocolFeeInInputToken += protocolFeeAmount;
            totalSavingsInInputToken += hopFee.savingsInInputToken;
            totalLpFeeInInputToken += lpFeeAmount;
            
            console.log(`  Hop ${i + 1}:`, {
              input: inputMint.toString().slice(0, 8),
              output: outputMint.toString().slice(0, 8),
              amount: currentAmount,
              protocolFee: protocolFeeAmount,
              kedologFee: hopFee.kedologFee,
            });
            
            // Calculate output for this hop to use as input for next hop
            const isInputToken0 = inputMint.equals(pool.token0Mint);
            const reserveIn = isInputToken0 ? pool.token0Reserve : pool.token1Reserve;
            const reserveOut = isInputToken0 ? pool.token1Reserve : pool.token0Reserve;
            
            // Simple AMM formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
            // Subtract fees first
            const amountAfterFees = currentAmount - lpFeeAmount - protocolFeeAmount;
            currentAmount = (amountAfterFees * reserveOut) / (reserveIn + amountAfterFees);
          }
          
          console.log('💰 Total multi-hop fees:', {
            totalKedologFee,
            totalProtocolFeeInInputToken,
            totalSavingsInInputToken,
            totalLpFeeInInputToken,
          });
          
          // Return aggregated fees for all hops
          const normalFeeUsd = totalProtocolFeeInInputToken * inputTokenPrice;
          const discountedFeeUsd = normalFeeUsd * 0.75; // 25% discount
          
          setEstimatedKedologFee({
            kedologFee: totalKedologFee,
            discountedFeeUsd,
            normalFeeUsd,
            protocolFeeInInputToken: totalProtocolFeeInInputToken,
            savingsInInputToken: totalSavingsInInputToken,
            lpFeeInInputToken: totalLpFeeInInputToken,
            totalFeeInInputToken: totalLpFeeInInputToken + totalProtocolFeeInInputToken,
            discountedTotalFeeInInputToken: totalLpFeeInInputToken,
          });
        } else {
          // Single hop - use existing calculation
          const fee = await calculateKedologFee(connection, wallet, amount, inputTokenPrice);
          console.log(`💰 KEDOLOG fee calculation: ${fee.kedologFee.toFixed(4)} KEDOLOG (threshold: 0.001)`);
          setEstimatedKedologFee(fee);
        }
      } catch (error) {
        console.error('Error calculating KEDOLOG fee:', error);
        setEstimatedKedologFee(null);
      } finally {
        setIsLoadingKedologFee(false);
      }
    };
    
    calculateFee();
  }, [fromAmount, useKedologDiscount, wallet, connection, isMultiHop, swapRoute, quoteData, toToken, fromToken]);
  
  // Auto-disable KEDOLOG discount for multi-hop swaps
  const prevIsMultiHopRef = useRef(isMultiHop);
  useEffect(() => {
    // Only trigger when transitioning to multi-hop
    if (isMultiHop && !prevIsMultiHopRef.current && useKedologDiscount) {
      setUseKedologDiscount(false);
      showToast('KEDOLOG discount is currently only available for direct swaps', 'info');
    }
    prevIsMultiHopRef.current = isMultiHop;
  }, [isMultiHop, useKedologDiscount]);
  
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
    
    // Special handling for native SOL swaps
    if (fromToken.symbol === 'SOL') {
      // Reserve SOL for transaction fees and rent (~0.005 SOL)
      const MIN_SOL_RESERVE = 0.005;
      const maxSwappableSOL = fromBalance - MIN_SOL_RESERVE;
      
      if (amountIn > maxSwappableSOL) {
        showToast(
          `Keep at least ${MIN_SOL_RESERVE} SOL for transaction fees. Maximum you can swap: ${maxSwappableSOL.toFixed(4)} SOL`,
          'error'
        );
        return;
      }
    } else {
      // Balance validation for other tokens
    if (amountIn > fromBalance) {
      showToast(`Insufficient ${fromToken.symbol} balance`, 'error');
      return;
      }
    }
    
    // KEDOLOG balance and minimum amount validation
    if (useKedologDiscount) {
      if (estimatedKedologFee) {
        console.log('🔍 KEDOLOG fee validation:', {
          kedologFee: estimatedKedologFee.kedologFee,
          threshold: 0.001,
          isTooSmall: estimatedKedologFee.kedologFee < 0.001,
          amountIn,
        });
        
        // Check if KEDOLOG fee is too small (would round to 0 in contract)
        // Use 0.001 KEDOLOG as minimum (with 9 decimals, this is 1,000,000 base units)
        if (estimatedKedologFee.kedologFee < 0.001) {
          const minAmount = (amountIn * 0.001) / estimatedKedologFee.kedologFee;
          console.error('❌ KEDOLOG fee too small:', {
            currentFee: estimatedKedologFee.kedologFee,
            minRequired: 0.001,
            calculatedMinAmount: minAmount,
          });
          showToast(
            `Swap amount too small for KEDOLOG discount. Minimum ${minAmount.toFixed(4)} ${fromToken.symbol} required. Try without discount or increase amount.`,
            'warning'
          );
          return;
        }
        
        // Check KEDOLOG balance
        if (kedologBalance < estimatedKedologFee.kedologFee) {
          showToast(`Insufficient KEDOLOG balance. You need ${estimatedKedologFee.kedologFee.toFixed(2)} KEDOLOG.`, 'error');
          return;
        }
      } else {
        showToast('Unable to calculate KEDOLOG fee. Please try again.', 'error');
        return;
      }
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
      
      if (useKedologDiscount && estimatedKedologFee) {
      if (isMultiHop && swapRoute) {
          // Execute multi-hop swap with KEDOLOG discount
          console.log('🔄💰 Executing multi-hop swap with KEDOLOG discount (atomic transaction)...');
        const signatures = await executeMultiHopSwap(
          swapRoute,
          amountIn,
          minimumOut,
          connection,
          wallet,
          publicKey,
            slippageBps,
            true // Enable KEDOLOG discount
          );
          signature = signatures[0];
          console.log('✅ Multi-hop swap with KEDOLOG discount completed atomically');
        } else {
          // Execute KEDOLOG discount swap (direct)
          console.log('💰 Executing KEDOLOG discount swap...');
          signature = await swapWithKedologDiscount(
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
      } else if (isMultiHop && swapRoute) {
        // Execute normal multi-hop swap (no discount)
        console.log('🔄 Executing multi-hop swap (atomic transaction)...');
        const signatures = await executeMultiHopSwap(
          swapRoute,
          amountIn,
          minimumOut,
          connection,
          wallet,
          publicKey,
          slippageBps,
          false // No KEDOLOG discount
        );
        signature = signatures[0];
        console.log('✅ Multi-hop swap completed atomically');
      } else {
        // Execute normal swap
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
      // If swapping to SOL, the unwrap happens automatically in the same transaction!
      const outputToken = toToken.mint.equals(WSOL_MINT) ? 'SOL' : toToken.symbol;
      setTxModal({
        isOpen: true,
        status: 'success',
        message: `Successfully swapped ${fromAmount} ${fromToken.symbol} for ${outputToken}!`,
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
      
      // Check if it's "already processed" error - transaction likely succeeded!
      if (e?.message && e.message.includes('already been processed')) {
        console.log('✅ Transaction was already processed - treating as success!');
        
        // Show success modal (without signature since we don't have it)
        const outputToken = toToken.mint.equals(WSOL_MINT) ? 'SOL' : toToken.symbol;
        setTxModal({
          isOpen: true,
          status: 'success',
          message: `Swap completed! ${fromAmount} ${fromToken.symbol} → ${outputToken}. Please check your wallet balance.`,
        });
        
        showToast(`Swap completed! Check your wallet.`, 'success');
        
        // Reset form
        setFromAmount('');
        setToAmount('');
        setQuoteData(null);
        
        // Refresh data
        clearPoolCache();
        setPoolRefreshTrigger(prev => prev + 1);
        
        setTimeout(() => {
          const refreshBalances = async () => {
            if (!publicKey) return;
            const fromBal = await getTokenBalance(connection, fromToken.mint, publicKey);
            setFromBalance(fromBal);
            const toBal = await getTokenBalance(connection, toToken.mint, publicKey);
            setToBalance(toBal);
          };
          refreshBalances();
          setPoolRefreshTrigger(prev => prev + 1);
        }, 2000);
        
        setTimeout(() => {
          setIsTransactionInProgress(false);
        }, 3000);
        
        return; // Exit early - this is actually a success!
      }
      
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
                      type="text"
                      inputMode="decimal"
                      value={slippage}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Allow empty string
                        if (v === '') {
                          setSlippage('');
                          return;
                        }
                        // Allow valid decimal number patterns while typing
                        // Allows: "0", "0.", "0.1", "0.10", "10", "10.", "10.5", etc.
                        if (/^\d*\.?\d*$/.test(v)) {
                          // If it's a valid number, check if it's within range
                          const n = parseFloat(v);
                          if (!isNaN(n) && n >= 0 && n <= 50) {
                            setSlippage(v);
                          } else if (isNaN(n)) {
                            // Still typing (e.g., "0.", "10."), allow it
                            setSlippage(v);
                          } else if (n > 50) {
                            setSlippage('50');
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // On blur, clean up the value
                        const v = e.target.value;
                        if (v === '' || v === '.' || isNaN(parseFloat(v))) {
                          setSlippage('0.5');
                        } else {
                          // Clean up trailing decimal point
                          const n = parseFloat(v);
                          setSlippage(n.toString());
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()} // Prevent scroll from changing value
                      className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-200 focus:outline-none focus:border-brand-cyan [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Custom"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-3 bg-white/5 p-2 rounded">
                    💡 Your transaction will revert if price changes unfavorably by more than this percentage.
                  </p>
                </div>
              </div>
            )}

            {/* KEDOLOG Discount Feature - Disabled for multi-hop due to small intermediate amounts */}
            {(
              <div className="mb-4 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="kedolog-discount"
                    checked={useKedologDiscount}
                    onChange={(e) => {
                      if (isMultiHop) {
                        showToast('KEDOLOG discount is currently only available for direct swaps', 'warning');
                        return;
                      }
                      if (!kedologAvailability.available) {
                        showToast(kedologAvailability.reason || 'KEDOLOG discount not available for this pair', 'warning');
                        return;
                      }
                      setUseKedologDiscount(e.target.checked);
                    }}
                    disabled={isMultiHop || !kedologAvailability.available}
                    className={`mt-0.5 w-5 h-5 rounded border-purple-500/50 bg-dark-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 ${(isMultiHop || !kedologAvailability.available) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  />
                  <div className="flex-1">
                <label htmlFor="kedolog-discount" className={`text-sm font-semibold text-white ${(isMultiHop || !kedologAvailability.available) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} flex items-center gap-2`}>
                  💰 Pay protocol fee with KEDOLOG (Save 25%!)
                  {isMultiHop && <span className="text-[10px] text-yellow-400">(Direct swaps only)</span>}
                  {!kedologAvailability.available && !isMultiHop && <span className="text-[10px] text-orange-400">(Unavailable for this pair)</span>}
                </label>
                <p className="text-xs text-gray-300 mt-1">
                  {!kedologAvailability.available && !isMultiHop
                    ? (kedologAvailability.reason || 'Not available for this pair')
                    : isMultiHop 
                      ? 'Currently available for direct swaps only. Multi-hop support coming soon!'
                      : 'Get 25% discount on protocol fees and receive more output tokens'
                  }
                  {!kedologAvailability.available && kedologAvailability.suggestion && (
                    <span className="block mt-1 text-xs text-purple-300">
                      💡 {kedologAvailability.suggestion}
                    </span>
                  )}
                </p>
                    
                    {useKedologDiscount && (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Your KEDOLOG Balance:</span>
                          <span className="font-semibold text-purple-300">{kedologBalance.toFixed(2)} KEDOLOG</span>
                        </div>
                        {isLoadingKedologFee ? (
                          <div className="mt-2 p-3 bg-black/30 rounded-lg flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs text-purple-300">Calculating KEDOLOG fee...</span>
                          </div>
                        ) : estimatedKedologFee ? (
                          <>
                            {/* Fee Breakdown */}
                            <div className="mt-2 p-2 bg-black/30 rounded-lg space-y-1.5">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-gray-500">LP Fee (0.20%):</span>
                                <span className="text-gray-300">{estimatedKedologFee.lpFeeInInputToken.toFixed(6)} {fromToken.symbol}</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-gray-500">Protocol Fee (0.05%):</span>
                                <span className="text-gray-300 line-through">{estimatedKedologFee.protocolFeeInInputToken.toFixed(6)} {fromToken.symbol}</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-purple-400">Paid in KEDOLOG:</span>
                                <span className="text-purple-300 font-semibold">{estimatedKedologFee.kedologFee.toFixed(2)} KEDOLOG</span>
                              </div>
                              <div className="border-t border-white/10 pt-1.5 flex justify-between text-xs">
                                <span className="text-green-400 font-semibold">You Save:</span>
                                <span className="text-green-400 font-bold">{estimatedKedologFee.savingsInInputToken.toFixed(6)} {fromToken.symbol}</span>
                              </div>
                            </div>
                            
                            {estimatedKedologFee.kedologFee < 0.001 && (() => {
                              const currentAmount = parseFloat(fromAmount) || 0;
                              const minAmount = currentAmount > 0 && estimatedKedologFee.kedologFee > 0
                                ? ((currentAmount * 0.001) / estimatedKedologFee.kedologFee).toFixed(4)
                                : '0';
                              return (
                                <div className="mt-2 px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                                  <p className="text-xs text-yellow-300">
                                    ⚠️ Amount too small for KEDOLOG discount. Minimum {minAmount} {fromToken.symbol} required. Increase amount or disable discount.
                                  </p>
                                </div>
                              );
                            })()}
                            
                            {kedologBalance < estimatedKedologFee.kedologFee && estimatedKedologFee.kedologFee >= 0.001 && (
                              <div className="mt-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                                <p className="text-xs text-red-300">
                                  ⚠️ Insufficient KEDOLOG balance. You need {estimatedKedologFee.kedologFee.toFixed(2)} KEDOLOG.
                                </p>
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
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
                    {fromToken.symbol === 'SOL' && fromBalance > 0.005 && (
                      <span className="text-yellow-400 ml-1" title="Keep 0.005 SOL for transaction fees">
                        (Max: {(fromBalance - 0.005).toFixed(4)})
                      </span>
                    )}
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
                        onWheel={(e) => e.currentTarget.blur()} // Prevent scroll from changing value
                        className="bg-transparent text-2xl sm:text-3xl font-bold outline-none w-full placeholder:text-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {fromAmount && parseFloat(fromAmount) > 0 && fromTokenUsdPrice > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          ≈ ${(parseFloat(fromAmount) * fromTokenUsdPrice).toFixed(2)} USD
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="relative">
                        <button 
                          onClick={() => setShowFromTokenModal(true)}
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
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[25,50,75,100].map(pct => (
                          <button
                            key={pct}
                            onClick={() => {
                              // For SOL, reserve some for transaction fees
                              let maxBalance = fromBalance;
                              if (fromToken.symbol === 'SOL') {
                                const MIN_SOL_RESERVE = 0.005;
                                maxBalance = Math.max(0, fromBalance - MIN_SOL_RESERVE);
                              }
                              const amt = (maxBalance * pct) / 100;
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
                  <label className="text-sm text-gray-400 font-medium">
                    You Receive
                    {useKedologDiscount && estimatedKedologFee && quoteData && quoteData.bonusAmount && quoteData.bonusAmount > 0 && toTokenUsdPrice > 0 && (
                      <span className="ml-2 text-xs text-green-400 font-semibold">
                        ↑ +{quoteData.bonusAmount.toFixed(6)} (+${(quoteData.bonusAmount * toTokenUsdPrice).toFixed(2)})
                      </span>
                    )}
                  </label>
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
                        onWheel={(e) => e.currentTarget.blur()} // Prevent scroll from changing value
                        className="bg-transparent text-2xl sm:text-3xl font-bold outline-none w-full placeholder:text-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {toAmount && parseFloat(toAmount) > 0 && toTokenUsdPrice > 0 && (
                        <div className="text-xs mt-1">
                          <div className="text-gray-500">
                            ≈ ${(parseFloat(toAmount) * toTokenUsdPrice).toFixed(2)} USD
                          </div>
                          {useKedologDiscount && quoteData && quoteData.bonusAmount && quoteData.bonusAmount > 0 && (
                            <div className="text-green-400 font-semibold mt-0.5">
                              +${(quoteData.bonusAmount * toTokenUsdPrice).toFixed(2)} USD bonus
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <button 
                        onClick={() => setShowToTokenModal(true)}
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
                    <span className="text-gray-400">
                      {useKedologDiscount && estimatedKedologFee ? `Estimated Fee (${fromToken.symbol})` : 'Estimated Fee (0.25%)'}
                    </span>
                    <span className="font-semibold text-white">
                      {useKedologDiscount && estimatedKedologFee 
                        ? `${estimatedKedologFee.lpFeeInInputToken.toFixed(6)} ${fromToken.symbol}`
                        : `${quoteData.fee.toFixed(6)} ${fromToken.symbol}`
                      }
                    </span>
                  </div>
                  
                  {/* Fee Breakdown when discount is enabled */}
                  {useKedologDiscount && estimatedKedologFee && (
                    <div className="text-[10px] -mt-1 flex items-center gap-1">
                      <span className="text-gray-500">LP fee only</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-500">Protocol fee:</span>
                      <span className="text-purple-400 font-semibold">{estimatedKedologFee.kedologFee.toFixed(2)} KEDOLOG</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-green-400">Saves {estimatedKedologFee.savingsInInputToken.toFixed(6)} {fromToken.symbol}</span>
                    </div>
                  )}
                  
                  {/* Min Received */}
                  <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <span className="text-gray-400 font-medium">
                      Min. Received
                      {useKedologDiscount && estimatedKedologFee && (
                        <span className="ml-2 text-xs text-green-400">↑ boosted</span>
                      )}
                    </span>
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
                  <span>⚠️</span> High price impact ({quoteData.priceImpact.toFixed(2)}%)! Consider reducing swap amount.
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
              disabled={
                !connected || 
                (!poolReserves && !swapRoute) || 
                !fromAmount || 
                !toAmount || 
                isLoadingQuote || 
                isLoadingKedologFee ||
                isTransactionInProgress ||
                (useKedologDiscount && estimatedKedologFee !== null && estimatedKedologFee.kedologFee < 0.001) ||
                (useKedologDiscount && estimatedKedologFee === null && isLoadingKedologFee)
              }
              className="w-full btn-primary mt-6 text-base sm:text-lg py-3 sm:py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:brightness-100 flex items-center justify-center gap-2"
            >
              {!connected ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Connect Wallet to Swap
                </>
              ) : isTransactionInProgress ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : isLoadingQuote ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Calculating Quote...
                </>
              ) : isLoadingKedologFee ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Calculating KEDOLOG Fee...
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
      
      {/* Token Selection Modals */}
      <TokenSelectModal
        isOpen={showFromTokenModal}
        onClose={() => setShowFromTokenModal(false)}
        onSelect={(token) => {
          setFromToken(token);
          setShowFromTokenModal(false);
        }}
        excludeToken={toToken}
        connection={connection}
      />
      
      <TokenSelectModal
        isOpen={showToTokenModal}
        onClose={() => setShowToTokenModal(false)}
        onSelect={(token) => {
          setToToken(token);
          setShowToTokenModal(false);
        }}
        excludeToken={fromToken}
        connection={connection}
      />
    </>
  );
};

export default Swap;
