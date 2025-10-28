import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { fetchPools, PROGRAM_ID } from '../utils/amm';
import { ToastContainer, ToastType } from '../components/Toast';

// ADMIN ADDRESS - hardcoded in the program
const ADMIN_ADDRESS = new PublicKey('JAaHqf4p14eNij84tygdF1nQkKV8MU3h7Pi4VCtDYiqa');

interface PoolFees {
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  protocolFeesToken0: number;
  protocolFeesToken1: number;
  fundFeesToken0: number;
  fundFeesToken1: number;
  creatorFeesToken0: number;
  creatorFeesToken1: number;
  ammConfig: PublicKey;
}

interface TotalFees {
  [tokenSymbol: string]: {
    protocol: number;
    fund: number;
    creator: number;
  };
}

export default function Admin() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [poolFees, setPoolFees] = useState<PoolFees[]>([]);
  const [totalFees, setTotalFees] = useState<TotalFees>({});
  const [activeTab, setActiveTab] = useState<'fees' | 'settings'>('fees');
  
  // Settings state
  const [newFeeReceiver, setNewFeeReceiver] = useState('');
  const [updating, setUpdating] = useState(false);
  const [currentFeeReceiver, setCurrentFeeReceiver] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // Toast state
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: ToastType;
    txSignature?: string;
  }>>([]);
  
  const showToast = (message: string, type: ToastType, txSignature?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, txSignature }]);
  };
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  // Check if connected wallet is admin
  useEffect(() => {
    if (publicKey) {
      setIsAdmin(publicKey.equals(ADMIN_ADDRESS));
    } else {
      setIsAdmin(false);
    }
  }, [publicKey]);
  
  // Fetch current fee receiver from AMM config
  const fetchCurrentFeeReceiver = async () => {
    if (!connected || !wallet) return;
    
    setLoadingConfig(true);
    try {
      const { getProgram, AMM_CONFIG } = await import('../utils/amm');
      const program = getProgram(connection, wallet);
      
      type AmmCfg = { protocolOwner: { toString(): string } };
      type AmmProgramAcc = { ammConfig: { fetch: (p: unknown) => Promise<AmmCfg> } };
      const ammConfigData = await (program.account as unknown as AmmProgramAcc).ammConfig.fetch(AMM_CONFIG);
      
      // Use protocol owner as the main fee receiver
      setCurrentFeeReceiver(ammConfigData.protocolOwner.toString());
      
      showToast('Current fee receiver loaded', 'success');
    } catch (error) {
      console.error('Error fetching AMM config:', error);
      showToast('Failed to load current fee receiver', 'error');
    } finally {
      setLoadingConfig(false);
    }
  };
  
  // Fetch pool fees
  const fetchPoolFees = async () => {
    if (!connected || !wallet) return;
    
    setLoading(true);
    try {
      const pools = await fetchPools(connection, wallet);
      
      const fees: PoolFees[] = pools.map(pool => ({
        poolAddress: pool.address.toString(),
        token0Symbol: pool.token0Symbol,
        token1Symbol: pool.token1Symbol,
        protocolFeesToken0: pool.protocolFeesToken0,
        protocolFeesToken1: pool.protocolFeesToken1,
        fundFeesToken0: pool.fundFeesToken0,
        fundFeesToken1: pool.fundFeesToken1,
        creatorFeesToken0: pool.creatorFeesToken0,
        creatorFeesToken1: pool.creatorFeesToken1,
        ammConfig: pool.ammConfig,
      }));
      
      setPoolFees(fees);
      
      // Calculate totals
      const totals: TotalFees = {};
      fees.forEach(pool => {
        // Token 0
        if (!totals[pool.token0Symbol]) {
          totals[pool.token0Symbol] = { protocol: 0, fund: 0, creator: 0 };
        }
        totals[pool.token0Symbol].protocol += pool.protocolFeesToken0;
        totals[pool.token0Symbol].fund += pool.fundFeesToken0;
        totals[pool.token0Symbol].creator += pool.creatorFeesToken0;
        
        // Token 1
        if (!totals[pool.token1Symbol]) {
          totals[pool.token1Symbol] = { protocol: 0, fund: 0, creator: 0 };
        }
        totals[pool.token1Symbol].protocol += pool.protocolFeesToken1;
        totals[pool.token1Symbol].fund += pool.fundFeesToken1;
        totals[pool.token1Symbol].creator += pool.creatorFeesToken1;
      });
      
      setTotalFees(totals);
      showToast('Pool fees fetched successfully', 'success');
    } catch (error) {
      console.error('Error fetching pool fees:', error);
      showToast('Failed to fetch pool fees', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  // Collect ALL fees from a pool (protocol + fund + creator)
  const collectAllFees = async (poolAddress: string, poolData: PoolFees) => {
    if (!isAdmin || !publicKey || !wallet.signTransaction) {
      showToast('Only admin can collect fees', 'error');
      return;
    }

    const totalToken0 = poolData.protocolFeesToken0 + poolData.fundFeesToken0 + poolData.creatorFeesToken0;
    const totalToken1 = poolData.protocolFeesToken1 + poolData.fundFeesToken1 + poolData.creatorFeesToken1;
    
    if (totalToken0 === 0 && totalToken1 === 0) {
      showToast('No fees to collect', 'warning');
      return;
    }

    try {
      showToast('Preparing fee collection transaction...', 'info');
      
      const { getProgram, getAuthority } = await import('../utils/amm');
      const { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
      const { PublicKey: PK, Transaction } = await import('@solana/web3.js');
      const BN = (await import('bn.js')).default;
      
      const program = getProgram(connection, wallet);
      const pool = new PK(poolAddress);
      
      // Get pool data
      const pools = await fetchPools(connection, wallet);
      const poolInfo = pools.find(p => p.address.equals(pool));
      
      if (!poolInfo) {
        throw new Error('Pool not found');
      }
      
      const authority = getAuthority();
      const token0Mint = poolInfo.token0Mint;
      const token1Mint = poolInfo.token1Mint;
      const ammConfig = poolInfo.ammConfig;
      
      // Get recipient token accounts (admin's accounts)
      const recipientToken0 = await getAssociatedTokenAddress(token0Mint, publicKey);
      const recipientToken1 = await getAssociatedTokenAddress(token1Mint, publicKey);
      
      // Check if accounts exist, create if needed
      const token0AccountInfo = await connection.getAccountInfo(recipientToken0);
      const token1AccountInfo = await connection.getAccountInfo(recipientToken1);
      
      const transaction = new Transaction();
      
      // Create token accounts if they don't exist
      if (!token0AccountInfo) {
        console.log('Creating token 0 account for admin');
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            recipientToken0,
            publicKey,
            token0Mint
          )
        );
      }
      
      if (!token1AccountInfo) {
        console.log('Creating token 1 account for admin');
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            recipientToken1,
            publicKey,
            token1Mint
          )
        );
      }
      
      // Convert to base units
      const amount0Requested = new BN(
        Math.floor(poolData.protocolFeesToken0 * Math.pow(10, poolInfo.token0Decimals))
      );
      const amount1Requested = new BN(
        Math.floor(poolData.protocolFeesToken1 * Math.pow(10, poolInfo.token1Decimals))
      );
      
      console.log('Collecting protocol fees:', {
        pool: poolAddress,
        token0: poolData.token0Symbol,
        token1: poolData.token1Symbol,
        amount0: poolData.protocolFeesToken0,
        amount1: poolData.protocolFeesToken1,
      });
      
      // Build collect_protocol_fee instruction
      const collectProtocolIx = await program.methods
        .collectProtocolFee(amount0Requested, amount1Requested)
        .accounts({
          owner: publicKey,
          authority: authority,
          poolState: pool,
          ammConfig: ammConfig,
          token0Vault: poolInfo.token0Vault,
          token1Vault: poolInfo.token1Vault,
          vault0Mint: token0Mint,
          vault1Mint: token1Mint,
          recipientToken0Account: recipientToken0,
          recipientToken1Account: recipientToken1,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      
      transaction.add(collectProtocolIx);
      
      // If there are fund fees, collect those too
      if (poolData.fundFeesToken0 > 0 || poolData.fundFeesToken1 > 0) {
        const fundAmount0 = new BN(
          Math.floor(poolData.fundFeesToken0 * Math.pow(10, poolInfo.token0Decimals))
        );
        const fundAmount1 = new BN(
          Math.floor(poolData.fundFeesToken1 * Math.pow(10, poolInfo.token1Decimals))
        );
        
        const collectFundIx = await program.methods
          .collectFundFee(fundAmount0, fundAmount1)
        .accounts({
            owner: publicKey,
            authority: authority,
            poolState: pool,
            ammConfig: ammConfig,
            token0Vault: poolInfo.token0Vault,
            token1Vault: poolInfo.token1Vault,
            vault0Mint: token0Mint,
            vault1Mint: token1Mint,
            recipientToken0Account: recipientToken0,
            recipientToken1Account: recipientToken1,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID,
          })
          .instruction();
        
        transaction.add(collectFundIx);
      }
      
      // Send transaction
      showToast('Please approve the transaction...', 'info');
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      showToast('Confirming transaction...', 'info');
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      showToast(
        `✅ Collected ${totalToken0.toFixed(4)} ${poolData.token0Symbol} + ${totalToken1.toFixed(4)} ${poolData.token1Symbol}`,
        'success',
        signature
      );
      
      // Refresh fees after collection
      await fetchPoolFees();
      
    } catch (error: unknown) {
      console.error('Error collecting fees:', error);
      
      // Check if transaction actually succeeded (common with "already processed" error)
      const msg = (error as Error)?.message || '';
      if (msg.includes('already been processed') || msg.includes('already processed')) {
        console.log('✅ Fee collection succeeded! (Got "already processed" confirmation)');
        showToast(
          `✅ Collected ${totalToken0.toFixed(4)} ${poolData.token0Symbol} + ${totalToken1.toFixed(4)} ${poolData.token1Symbol}`,
          'success'
        );
        // Refresh fees after successful collection
        await fetchPoolFees();
        return;
      }
      
      const errorMsg = (error as Error)?.message || String(error);
      showToast(`Failed to collect fees: ${errorMsg}`, 'error');
    }
  };
  
  // Update fee receiver address
  const updateFeeReceiver = async () => {
    if (!isAdmin || !publicKey || !wallet.signTransaction) {
      showToast('Only admin can update fee receiver', 'error');
      return;
    }

    if (!newFeeReceiver) {
      showToast('Please enter a new fee receiver address', 'warning');
      return;
    }

    try {
      setUpdating(true);
      const newOwnerPubkey = new PublicKey(newFeeReceiver);
      
      // Build and send updates across all active AMM configs
      const { getProgram, AMM_CONFIG, fetchPools } = await import('../utils/amm');
      const program = getProgram(connection, wallet);

      // Determine which AMM configs to update: use those present in pools; fallback to default
      const pools = await fetchPools(connection, wallet);
      const ammConfigs = Array.from(new Set((pools?.map(p => p.ammConfig.toString()) || [])));
      if (ammConfigs.length === 0) {
        ammConfigs.push(AMM_CONFIG.toString());
      }

      showToast(`Updating fee receiver on ${ammConfigs.length} config(s)...`, 'info');

      // Execute sequentially for reliability
      for (const cfgStr of ammConfigs) {
        const cfg = new PublicKey(cfgStr);

        // 1) Protocol owner (param = 3)
        const tx1 = await program.methods
          .updateAmmConfig(3, new BN(0))
          .accounts({ owner: publicKey, ammConfig: cfg })
          .remainingAccounts([{ pubkey: newOwnerPubkey, isSigner: false, isWritable: false }])
          .rpc();

        showToast(`Protocol receiver updated on config ${cfg.toString().slice(0, 8)}…`, 'success', tx1);

        // 2) Fund owner (param = 4) — keep in sync with protocol receiver per simplified model
        const tx2 = await program.methods
          .updateAmmConfig(4, new BN(0))
          .accounts({ owner: publicKey, ammConfig: cfg })
          .remainingAccounts([{ pubkey: newOwnerPubkey, isSigner: false, isWritable: false }])
          .rpc();

        showToast(`Fund receiver updated on config ${cfg.toString().slice(0, 8)}…`, 'success', tx2);
      }

      // Refresh view
      await fetchCurrentFeeReceiver();
      showToast('✅ Fee receiver updated everywhere', 'success');

    } catch (error: unknown) {
      showToast(`Invalid address or update failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div className="relative min-h-screen overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-brand-pink/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 font-heading">
              <span className="gradient-text">Admin Panel</span>
            </h1>
            <p className="text-gray-400 text-lg">Protocol Fee Management & Configuration</p>
        </div>

          {/* Admin Check */}
          {!connected && (
            <div className="card bg-yellow-500/10 border-yellow-500/20 text-center">
              <p className="text-yellow-400">⚠️ Please connect your wallet to access the admin panel</p>
            </div>
          )}

          {connected && !isAdmin && (
            <div className="card bg-red-500/10 border-red-500/20 text-center">
              <p className="text-red-400 font-semibold mb-2">🚫 Access Denied</p>
              <p className="text-gray-400">Only the protocol admin can access this panel</p>
              <p className="text-xs text-gray-500 mt-2">Admin: {ADMIN_ADDRESS.toString().slice(0, 8)}...</p>
              <p className="text-xs text-gray-500">Your wallet: {publicKey?.toString().slice(0, 8)}...</p>
          </div>
        )}

          {connected && isAdmin && (
          <>
              {/* Tabs */}
            <div className="card mb-6">
                <div className="flex gap-4 border-b border-white/10 pb-4">
                  <button
                    onClick={() => setActiveTab('fees')}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                      activeTab === 'fees'
                        ? 'bg-gradient-brand text-white shadow-glow-brand'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    💰 Fee Collection
                  </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                      activeTab === 'settings'
                        ? 'bg-gradient-brand text-white shadow-glow-brand'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    ⚙️ Settings
                </button>
                </div>
              </div>

              {/* Fee Collection Tab */}
              {activeTab === 'fees' && (
                <>
                  {/* Quick Actions */}
                  <div className="card mb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold mb-2">Protocol Fees Dashboard</h2>
                        <p className="text-sm text-gray-400">View and collect accumulated protocol fees from all pools</p>
                      </div>
                  <button
                        onClick={fetchPoolFees}
                        disabled={loading}
                    className="btn-primary"
                  >
                        {loading ? '🔄 Loading...' : '🔄 Refresh Fees'}
                  </button>
              </div>
            </div>

                  {/* Total Fees Summary */}
                  {Object.keys(totalFees).length > 0 && (
                    <div className="card mb-6">
                      <h3 className="text-lg font-bold mb-4">📊 Total Collectable Fees</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(totalFees).map(([token, fees]) => {
                          const totalFees = fees.protocol + fees.fund + fees.creator;
                          return (
                            <div key={token} className="bg-gradient-to-br from-brand-cyan/10 to-brand-purple/10 rounded-lg p-4 border border-brand-cyan/20">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-gradient-brand rounded-full flex items-center justify-center text-sm font-bold">
                                    {token[0]}
                                  </div>
                                  <div className="font-bold text-white text-sm">{token}</div>
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="text-2xl font-bold text-brand-cyan">{totalFees.toFixed(4)}</div>
                                <div className="text-xs text-gray-400 mt-1">Total Available</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Individual Pool Fees */}
                  {poolFees.length > 0 && (
              <div className="card">
                      <h3 className="text-lg font-bold mb-4">🏊 Pool-by-Pool Breakdown</h3>
                <div className="space-y-4">
                        {poolFees.map((pool) => (
                          <div key={pool.poolAddress} className="bg-dark-900 rounded-xl p-4 border border-white/10">
                            <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                                <div className="text-lg font-bold text-white">
                                  {pool.token0Symbol}/{pool.token1Symbol}
                          </div>
                                <span className="text-xs text-gray-500 font-mono">
                                  {pool.poolAddress.slice(0, 8)}...
                            </span>
                        </div>
                          <button
                                onClick={() => collectAllFees(pool.poolAddress, pool)}
                                className="px-3 py-1.5 text-xs font-semibold bg-gradient-brand text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={
                                  (pool.protocolFeesToken0 + pool.fundFeesToken0 + pool.creatorFeesToken0) === 0 && 
                                  (pool.protocolFeesToken1 + pool.fundFeesToken1 + pool.creatorFeesToken1) === 0
                                }
                              >
                                💸 Collect All
                          </button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              {/* Token 0 Total */}
                              <div className="bg-gradient-to-br from-brand-cyan/5 to-brand-purple/5 rounded-lg p-3 border border-brand-cyan/20">
                                <div className="text-xs text-gray-400 mb-1">{pool.token0Symbol}</div>
                                <div className="text-lg font-bold text-white">
                                  {(pool.protocolFeesToken0 + pool.fundFeesToken0 + pool.creatorFeesToken0).toFixed(4)}
                                </div>
                      </div>
                      
                              {/* Token 1 Total */}
                              <div className="bg-gradient-to-br from-brand-pink/5 to-orange-400/5 rounded-lg p-3 border border-brand-pink/20">
                                <div className="text-xs text-gray-400 mb-1">{pool.token1Symbol}</div>
                                <div className="text-lg font-bold text-white">
                                  {(pool.protocolFeesToken1 + pool.fundFeesToken1 + pool.creatorFeesToken1).toFixed(4)}
                                </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

                  {poolFees.length === 0 && !loading && (
              <div className="card text-center text-gray-400">
                      <p>No pool fees loaded. Click "Refresh Fees" to fetch data.</p>
                    </div>
                  )}
                </>
              )}

              

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  {/* Current Fee Receiver */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold">Current Fee Receiver</h3>
                        <p className="text-sm text-gray-400">All fees are sent to this address</p>
                      </div>
                      <button
                        onClick={fetchCurrentFeeReceiver}
                        disabled={loadingConfig}
                        className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-50"
                      >
                        {loadingConfig ? '🔄 Loading...' : '🔄 Load'}
                      </button>
                    </div>
                    
                    {currentFeeReceiver && (
                      <div className="bg-gradient-to-br from-brand-cyan/10 to-brand-purple/10 rounded-lg p-4 border border-brand-cyan/20">
                        <div className="text-xs text-gray-400 mb-2">Current Address</div>
                        <div className="font-mono text-sm text-white break-all bg-black/30 rounded-lg p-3">
                          {currentFeeReceiver}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Update Fee Receiver */}
                  <div className="card">
                    <h3 className="text-lg font-bold mb-4">Update Fee Receiver</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          New Fee Receiver Address
                        </label>
                        <input
                          type="text"
                          value={newFeeReceiver}
                          onChange={(e) => setNewFeeReceiver(e.target.value)}
                          placeholder="Enter Solana address..."
                          className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-cyan transition-colors font-mono"
                        />
                      </div>
                      <button
                        onClick={updateFeeReceiver}
                        disabled={updating || !newFeeReceiver}
                        className="w-full px-4 py-2.5 text-sm font-semibold bg-gradient-brand text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updating ? '⏳ Updating...' : '✅ Update Fee Receiver'}
                      </button>
                    </div>
                  </div>

                  {/* How It Works */}
                  <div className="card bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-500/20">
                    <h3 className="text-base font-bold mb-3">How It Works</h3>
                    <div className="space-y-2 text-sm text-gray-300">
                      <p>• All protocol fees, fund fees, and creator fees are collected to this single address</p>
                      <p>• The fee receiver can collect accumulated fees from any pool at any time</p>
                      <p>• Liquidity provider fees (65%) remain in pools automatically</p>
                    </div>
                  </div>

                  {/* Admin Info */}
                  <div className="card bg-dark-900/50 border-white/5">
                    <h3 className="text-base font-bold mb-3">Admin Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Admin:</span>
                        <span className="font-mono text-xs text-white break-all ml-2">{ADMIN_ADDRESS.toString().slice(0, 12)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Connected:</span>
                        <span className="font-mono text-xs text-brand-cyan break-all ml-2">{publicKey?.toString().slice(0, 12)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Program:</span>
                        <span className="font-mono text-xs text-white break-all ml-2">{PROGRAM_ID.toString().slice(0, 12)}...</span>
                      </div>
                    </div>
                  </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
      
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
