import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useState, useEffect, useRef } from 'react';
import { fetchAllBalances, TokenBalance } from '../utils/balances';
import { fetchPools, getLpMint } from '../utils/amm';
import { getTokenList, getTokenByMint, getLocalTokenLogo } from '../config/tokens';
import { getExplorerUrl, getExplorerAccountUrl } from '../config/addresses';
import { getCachedBalance, clearBalanceCache, debounce } from '../utils/balanceCache';
import { PublicKey } from '@solana/web3.js';

const Profile = () => {
  const { connected, publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [solBalance, setSolBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  type TxSig = { signature: string; blockTime?: number; err?: unknown };
  const [txHistory, setTxHistory] = useState<TxSig[]>([]);
  const [lpTokens, setLpTokens] = useState<Array<{
    poolAddress: string;
    lpMint: string;
    token0Symbol: string;
    token1Symbol: string;
    lpBalance: number;
    token0Mint: string;
    token1Mint: string;
  }>>([]);
  const [isLoadingLp, setIsLoadingLp] = useState(true);
  
  // Fetch balances (debounced and cached)
  useEffect(() => {
    if (!publicKey || !connected) {
      setBalances([]);
      setSolBalance(0);
      setIsLoading(false);
      return;
    }
    
    let isInitialLoad = true;
    
    // Debounced balance fetcher to prevent excessive RPC calls
    const loadBalances = debounce(async () => {
      // Only show loading spinner on initial load
      if (isInitialLoad) {
        setIsLoading(true);
        console.log('📊 Profile: Loading token balances...');
      }
      
      try {
        console.log('💰 Profile: Fetching all token balances...');
        const allBalances = await fetchAllBalances(connection, publicKey);
        const solBal = allBalances.find(b => b.symbol === 'SOL' && b.mint === 'native');
        
        if (solBal) {
          setSolBalance(solBal.balance);
          console.log(`✅ Profile: SOL balance: ${solBal.balance.toFixed(4)} SOL`);
        }
        
        const tokenBalances = allBalances.filter(b => b.mint !== 'native');
        setBalances(tokenBalances);
        console.log(`✅ Profile: Loaded ${tokenBalances.length} token balances`);
        
        // Log each token with its details
        tokenBalances.forEach((balance) => {
          const tokenMint = new PublicKey(balance.mint);
          const tokenInfo = getTokenByMint(tokenMint);
          const tokenLogo = tokenInfo?.logoURI || getLocalTokenLogo(tokenMint);
          
          console.log(`🪙 Profile: Token balance -`, {
            symbol: balance.symbol,
            name: balance.name,
            balance: balance.balance.toFixed(balance.decimals >= 6 ? 6 : balance.decimals),
            mint: balance.mint,
            logoURI: tokenLogo,
            hasLogo: !!tokenInfo?.logoURI,
          });
        });
      } catch (error) {
        console.error('❌ Profile: Error fetching balances:', error);
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
          isInitialLoad = false;
        }
      }
    }, 500); // 500ms debounce
    
    loadBalances();
    // No auto-refresh - balances update after transactions or when cache expires
  }, [publicKey, connected, connection]);
  
  // Fetch LP tokens (optimized with cached balance fetcher)
  useEffect(() => {
    if (!publicKey || !connected || !wallet) {
      setLpTokens([]);
      setIsLoadingLp(false);
      return;
    }
    
    let isInitialLoad = true;
    
    // Debounced LP token fetcher to prevent excessive RPC calls
    const loadLpTokens = debounce(async () => {
      // Only show loading spinner on initial load
      if (isInitialLoad) {
        setIsLoadingLp(true);
        console.log('🏊 Profile: Loading LP token positions...');
      }
      
      try {
        // Fetch all pools (uses 10s cache)
        console.log('🔄 Profile: Fetching pools for LP positions...');
        const pools = await fetchPools(connection, wallet);
        console.log(`📦 Profile: Found ${pools.length} pools, checking LP balances...`);
        
        const tokenList = getTokenList();
        const lpBalances: Array<{
          poolAddress: string;
          lpMint: string;
          token0Symbol: string;
          token1Symbol: string;
          lpBalance: number;
          token0Mint: string;
          token1Mint: string;
        }> = [];
        
        // Batch fetch LP balances using cached balance fetcher
        // This significantly reduces RPC calls
        const balancePromises = pools.map(async (pool) => {
          try {
            const lpMint = getLpMint(pool.address);
            // Use cached balance fetcher (10s cache, prevents duplicate requests)
            const lpBalance = await getCachedBalance(connection, lpMint, publicKey);
            
            if (lpBalance > 0) {
              const token0 = tokenList.find(t => t.mint.equals(pool.token0Mint));
              const token1 = tokenList.find(t => t.mint.equals(pool.token1Mint));
              
              const token0Info = getTokenByMint(pool.token0Mint);
              const token1Info = getTokenByMint(pool.token1Mint);
              
              lpBalances.push({
                poolAddress: pool.address.toString(),
                lpMint: lpMint.toString(),
                token0Symbol: token0?.symbol || 'Unknown',
                token1Symbol: token1?.symbol || 'Unknown',
                lpBalance,
                token0Mint: pool.token0Mint.toString(),
                token1Mint: pool.token1Mint.toString(),
              });
              
              console.log(`✅ Profile: Found LP position:`, {
                pool: `${token0?.symbol || 'Unknown'}/${token1?.symbol || 'Unknown'}`,
                poolAddress: pool.address.toString(),
                lpMint: lpMint.toString(),
                lpBalance: `${lpBalance.toFixed(6)} LP tokens`,
                token0: {
                  symbol: token0?.symbol || 'Unknown',
                  mint: pool.token0Mint.toString(),
                  logoURI: token0Info?.logoURI || getLocalTokenLogo(pool.token0Mint),
                },
                token1: {
                  symbol: token1?.symbol || 'Unknown',
                  mint: pool.token1Mint.toString(),
                  logoURI: token1Info?.logoURI || getLocalTokenLogo(pool.token1Mint),
                },
              });
            }
          } catch (error) {
            // Account might not exist - this is expected, don't log to avoid spam
          }
        });
        
        await Promise.all(balancePromises);
        setLpTokens(lpBalances);
        console.log(`✅ Profile: Loaded ${lpBalances.length} LP positions`);
      } catch (error) {
        console.error('❌ Profile: Error fetching LP tokens:', error);
        setLpTokens([]);
      } finally {
        if (isInitialLoad) {
          setIsLoadingLp(false);
          isInitialLoad = false;
        }
      }
    }, 500); // 500ms debounce
    
    loadLpTokens();
    // No auto-refresh - LP positions update after add/remove liquidity transactions
  }, [publicKey, connected, connection, wallet]);
  
  // Transaction history cache (persists across renders)
  const txHistoryCacheRef = useRef<{ data: typeof txHistory; timestamp: number; publicKey: string } | null>(null);
  const TX_HISTORY_CACHE_TTL = 30000; // 30 seconds cache
  
  // Fetch transaction history (cached to reduce RPC calls)
  useEffect(() => {
    if (!publicKey) {
      setTxHistory([]);
      return;
    }
    
    const loadTxHistory = debounce(async () => {
      // Return cached data if still valid and for same wallet
      const now = Date.now();
      const cache = txHistoryCacheRef.current;
      if (cache && cache.publicKey === publicKey.toString() && (now - cache.timestamp) < TX_HISTORY_CACHE_TTL) {
        console.log('📦 Profile: Using cached transaction history');
        setTxHistory(cache.data);
        return;
      }
      
      try {
        console.log('📝 Profile: Fetching transaction history...');
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
        const mapped = signatures.map(s => ({ 
          signature: s.signature, 
          blockTime: s.blockTime ?? undefined, 
          err: s.err 
        }));
        
        setTxHistory(mapped);
        txHistoryCacheRef.current = { data: mapped, timestamp: Date.now(), publicKey: publicKey.toString() };
        console.log(`✅ Profile: Loaded ${mapped.length} recent transactions`);
      } catch (error) {
        console.error('❌ Profile: Error fetching transaction history:', error);
        setTxHistory([]);
      }
    }, 500); // 500ms debounce
    
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
            <button className="btn-primary" onClick={() => setWalletModalVisible(true)}>Connect Wallet</button>
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
                  href={getExplorerAccountUrl(publicKey.toString())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-semibold border border-white/10 transition-all"
                >
                  View on Explorer
                </a>
                <button
                  onClick={async () => { 
                    try { 
                      console.log('🔌 Profile: Disconnecting wallet...');
                      await disconnect(); 
                      clearBalanceCache(); // Clear all balance cache on disconnect
                      txHistoryCacheRef.current = null; // Clear transaction history cache
                      console.log('✅ Profile: Wallet disconnected');
                    } catch (e) { 
                      console.error('❌ Profile: Disconnect failed:', e); 
                    } 
                  }}
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
            <div className="text-3xl font-bold text-brand-cyan">Mainnet</div>
            <div className="text-xs text-gray-500 mt-1">Production Network</div>
          </div>
        </div>
        
        {/* LP Tokens Section */}
        {lpTokens.length > 0 && (
          <div className="card p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6 font-heading gradient-text">🏊 LP Tokens (Liquidity Positions)</h2>
            
            {isLoadingLp ? (
              <div className="text-center py-12">
                <div className="inline-block w-12 h-12 border-4 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin"></div>
                <p className="text-gray-400 mt-4">Loading LP positions...</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lpTokens.map((lp) => {
                  const token0Mint = new PublicKey(lp.token0Mint);
                  const token1Mint = new PublicKey(lp.token1Mint);
                  const token0Info = getTokenByMint(token0Mint);
                  const token1Info = getTokenByMint(token1Mint);
                  
                  // Log token details when rendering
                  console.log(`🖼️ Profile: Rendering LP token card -`, {
                    pool: `${lp.token0Symbol}/${lp.token1Symbol}`,
                    poolAddress: lp.poolAddress,
                    lpMint: lp.lpMint,
                    token0: {
                      symbol: lp.token0Symbol,
                      mint: lp.token0Mint,
                      logoURI: token0Info?.logoURI || getLocalTokenLogo(token0Mint),
                    },
                    token1: {
                      symbol: lp.token1Symbol,
                      mint: lp.token1Mint,
                      logoURI: token1Info?.logoURI || getLocalTokenLogo(token1Mint),
                    },
                    lpBalance: lp.lpBalance,
                  });
                  
                  return (
                  <div
                    key={lp.poolAddress}
                    className="p-5 rounded-xl border bg-gradient-to-br from-brand-cyan/5 to-brand-pink/5 border-brand-cyan/30 hover:border-brand-cyan hover:shadow-glow-brand transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const token0Mint = new PublicKey(lp.token0Mint);
                          const token1Mint = new PublicKey(lp.token1Mint);
                          const token0Info = getTokenByMint(token0Mint);
                          const token1Info = getTokenByMint(token1Mint);
                          const token0Logo = token0Info?.logoURI || getLocalTokenLogo(token0Mint);
                          const token1Logo = token1Info?.logoURI || getLocalTokenLogo(token1Mint);
                          
                          return (
                            <>
                              {token0Logo ? (
                                <img 
                                  src={token0Logo} 
                                  alt={lp.token0Symbol}
                                  className="w-12 h-12 rounded-full shadow-glow-brand"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-12 h-12 rounded-full bg-gradient-brand flex items-center justify-center text-base font-bold shadow-glow-brand ${token0Logo ? 'hidden' : ''}`}>
                                {lp.token0Symbol[0]}
                              </div>
                              {token1Logo ? (
                                <img 
                                  src={token1Logo} 
                                  alt={lp.token1Symbol}
                                  className="w-12 h-12 rounded-full shadow-glow-brand -ml-4 border-2 border-dark-800"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-12 h-12 rounded-full bg-gradient-brand flex items-center justify-center text-base font-bold shadow-glow-brand -ml-4 border-2 border-dark-800 ${token1Logo ? 'hidden' : ''}`}>
                                {lp.token1Symbol[0]}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <span className="text-xs px-3 py-1 bg-green-500/20 text-green-400 rounded-full font-semibold border border-green-500/30">
                        ACTIVE
                      </span>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-xl font-bold text-white mb-1">
                        {lp.token0Symbol}/{lp.token1Symbol}
                      </div>
                      <div className="text-xs text-gray-400">AMM Liquidity Pool V2</div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between py-2 px-3 bg-dark-900/50 rounded-lg">
                        <span className="text-xs text-gray-400">LP Balance</span>
                        <span className="text-sm font-bold text-brand-cyan">{lp.lpBalance.toFixed(6)}</span>
                      </div>
                      
                      <div className="py-2 px-3 bg-dark-900/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">Pool Address</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(lp.poolAddress);
                              alert('Pool address copied!');
                            }}
                            className="text-xs text-brand-cyan hover:text-brand-pink transition-colors"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <div className="text-xs font-mono text-gray-500 break-all">
                          {lp.poolAddress.slice(0, 8)}...{lp.poolAddress.slice(-8)}
                        </div>
                      </div>
                      
                      <div className="py-2 px-3 bg-dark-900/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">LP Token Address</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(lp.lpMint);
                              alert('LP token address copied!');
                            }}
                            className="text-xs text-brand-cyan hover:text-brand-pink transition-colors"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <div className="text-xs font-mono text-gray-500 break-all">
                          {lp.lpMint.slice(0, 8)}...{lp.lpMint.slice(-8)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href="/pools"
                        className="py-2 text-center bg-gradient-brand text-white rounded-lg text-xs font-semibold hover:brightness-110 transition-all"
                      >
                        Add More
                      </a>
                      <a
                        href="/pools"
                        className="py-2 text-center bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-all"
                      >
                        Remove
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
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
                  const tokenMint = new PublicKey(balance.mint);
                  const tokenInfo = getTokenByMint(tokenMint);
                  const tokenLogo = tokenInfo?.logoURI || getLocalTokenLogo(tokenMint);
                  
                  // Log token details when rendering
                  console.log(`🖼️ Profile: Rendering token balance card -`, {
                    symbol: balance.symbol,
                    name: balance.name,
                    balance: balance.balance.toFixed(balance.decimals >= 6 ? 6 : balance.decimals),
                    mint: balance.mint,
                    logoURI: tokenLogo,
                    hasBalance: hasBalance,
                  });
                  
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
                        {tokenLogo ? (
                          <img 
                            src={tokenLogo} 
                            alt={balance.symbol}
                            className="w-12 h-12 rounded-full flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${
                          balance.symbol === 'SOL'
                            ? 'bg-gradient-to-br from-purple-500 to-cyan-500'
                            : 'bg-gradient-brand'
                        } ${tokenLogo ? 'hidden' : ''}`}>
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
                    href={getExplorerUrl(tx.signature)}
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
            <a
              href={getExplorerAccountUrl(publicKey.toString())}
              target="_blank"
              rel="noopener noreferrer"
              className="p-6 bg-dark-900/50 rounded-xl border border-white/10 hover:border-brand-cyan/30 transition-all text-center group"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">🔍</div>
              <div className="font-semibold">View Explorer</div>
            </a>
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
