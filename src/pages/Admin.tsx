import { useState, useEffect, useMemo } from 'react';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { fetchPools, PROGRAM_ID } from '../utils/amm';
import { ToastContainer, ToastType } from '../components/Toast';
import { useConfig } from '../contexts/ConfigContext';
import { isAdditionalAdminWallet } from '../config/adminAccess';
import {
  deriveKedolikStakingPoolAddresses,
  fetchKedolikStakingAdminPools,
  fetchKedolikStakeLockAdminConfig,
  fetchKedolikWalletTokenBalance,
  fundKedolikStakingRewards,
  initializeKedolikStakingPool,
  KedolikStakeLockAdminConfig,
  KedolikStakingAdminPool,
  KedolikStoredStakingPool,
  setKedolikStakingRewardRate,
  transferKedolikStakingAdmin,
} from '../services/kedolikStaking';

// NOTE: Admin is fetched dynamically from blockchain via ConfigContext

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

const formatAddress = (address: string | null | undefined) =>
  address ? `${address.slice(0, 6)}...${address.slice(-6)}` : 'Unavailable';

const formatRawTokenAmount = (rawValue: string | null | undefined, decimals: number | null | undefined) => {
  if (rawValue === null || rawValue === undefined) {
    return 'Loading...';
  }

  if (decimals === null || decimals === undefined) {
    return rawValue;
  }

  try {
    const raw = BigInt(rawValue);
    const scale = 10n ** BigInt(decimals);
    const whole = raw / scale;
    const fraction = raw % scale;

    if (fraction === 0n) {
      return whole.toLocaleString('en-US');
    }

    const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6);
    return `${whole.toLocaleString('en-US')}.${fractionText}`;
  } catch {
    return rawValue;
  }
};

const parseUiTokenAmount = (value: string, decimals: number) => {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Amount must be a positive number.');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');

  if (fractionPart.length > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimal places for this mint.`);
  }

  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart) * scale;
  const fraction = BigInt((fractionPart || '0').padEnd(decimals, '0'));
  const raw = whole + fraction;

  if (raw <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }

  return raw;
};

const formatDuration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return 'Unavailable';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const getNextStakingPoolId = (pools: KedolikStakingAdminPool[]) => {
  const maxPoolId = pools.reduce((max, pool) => {
    try {
      const current = BigInt(pool.poolId || '0');
      return current > max ? current : max;
    } catch {
      return max;
    }
  }, 0n);

  return (maxPoolId > 0n ? maxPoolId + 1n : BigInt(Date.now())).toString();
};

const getPoolStatusClasses = (status: KedolikStakingAdminPool['status']) => {
  switch (status) {
    case 'active':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'low_rewards':
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
    case 'unfunded':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
    case 'rewards_stopped':
      return 'border-gray-500/30 bg-gray-500/10 text-gray-300';
    default:
      return 'border-red-500/30 bg-red-500/10 text-red-300';
  }
};

export default function Admin() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  const { adminAddress: currentAdmin, refreshConfig } = useConfig();
  
  const [loading, setLoading] = useState(false);
  const [poolFees, setPoolFees] = useState<PoolFees[]>([]);
  const [totalFees, setTotalFees] = useState<TotalFees>({});
  const [activeTab, setActiveTab] = useState<'fees' | 'settings' | 'staking'>('fees');
  
  // Settings state
  const [newFeeReceiver, setNewFeeReceiver] = useState('');
  const [updating, setUpdating] = useState(false);
  const [currentFeeReceiver, setCurrentFeeReceiver] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // Admin change state
  const [newAdmin, setNewAdmin] = useState('');
  const [updatingAdmin, setUpdatingAdmin] = useState(false);
  const [stakingPoolForm, setStakingPoolForm] = useState({
    stakeMint: '',
    rewardMint: '',
    poolId: '',
    rewardAmount: '',
    rewardDistributionSeconds: '2592000',
    rewardAmountRaw: '',
    rewardDurationSeconds: '2592000',
  });
  const [creatingStakingPool, setCreatingStakingPool] = useState(false);
  const [stakingAdminConfig, setStakingAdminConfig] = useState<KedolikStakeLockAdminConfig | null>(null);
  const [loadingStakingAdminConfig, setLoadingStakingAdminConfig] = useState(false);
  const [stakingPools, setStakingPools] = useState<KedolikStakingAdminPool[]>([]);
  const [loadingStakingPools, setLoadingStakingPools] = useState(false);
  const [stakingPoolActionForms, setStakingPoolActionForms] = useState<
    Record<string, { fundAmount: string; rateAmount: string; rateDistributionSeconds: string }>
  >({});
  const [stakingPoolActionLoading, setStakingPoolActionLoading] = useState<string | null>(null);
  const [fundingRecoveryPool, setFundingRecoveryPool] = useState<KedolikStoredStakingPool | null>(null);
  const [newStakingAdmin, setNewStakingAdmin] = useState('');
  const [transferringStakingAdmin, setTransferringStakingAdmin] = useState(false);
  
  // Check if connected wallet is admin or fee receiver
  const connectedWalletAddress = publicKey?.toString() ?? null;
  const isOnChainAdmin = Boolean(
    connectedWalletAddress && currentAdmin && connectedWalletAddress === currentAdmin
  );
  const isFrontendAdmin = isAdditionalAdminWallet(connectedWalletAddress);
  const isStakingAdmin = Boolean(
    connectedWalletAddress && stakingAdminConfig?.authority === connectedWalletAddress
  );
  const isAdmin = isOnChainAdmin || isFrontendAdmin;
  const isFeeReceiver = publicKey && currentFeeReceiver ? publicKey.toString() === currentFeeReceiver : false;
  const canAccessAdmin = isAdmin || isFeeReceiver || isStakingAdmin;
  
  // In the new contract model:
  // - Admin can ONLY change admin and fee receiver (cannot claim fees)
  // - Fee receiver can ONLY claim fees (cannot change settings)
  const canClaimFees = isFeeReceiver;
  const canChangeSettings = isAdmin;
  const canViewStakingInstance = isAdmin || isStakingAdmin;
  const canCreateStakingInstance = isStakingAdmin;
  const stakingDashboardSummary = useMemo(() => ({
    totalPools: stakingPools.length,
    activePools: stakingPools.filter((pool) => pool.status === 'active' || pool.status === 'low_rewards').length,
    unfundedPools: stakingPools.filter((pool) => pool.status === 'unfunded').length,
    rewardsStoppedPools: stakingPools.filter((pool) => pool.status === 'rewards_stopped').length,
  }), [stakingPools]);
  const createPoolAddresses = useMemo(() => {
    if (!stakingPoolForm.stakeMint.trim() || !stakingPoolForm.rewardMint.trim() || !stakingPoolForm.poolId.trim()) {
      return null;
    }

    try {
      return deriveKedolikStakingPoolAddresses(
        stakingPoolForm.stakeMint.trim(),
        stakingPoolForm.rewardMint.trim(),
        stakingPoolForm.poolId.trim()
      );
    } catch {
      return null;
    }
  }, [stakingPoolForm.poolId, stakingPoolForm.rewardMint, stakingPoolForm.stakeMint]);
  
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

  const fetchStakingAdminConfig = async () => {
    setLoadingStakingAdminConfig(true);
    try {
      const config = await fetchKedolikStakeLockAdminConfig(connection);
      setStakingAdminConfig(config);
    } catch (error) {
      console.error('Error fetching staking admin config:', error);
      setStakingAdminConfig(null);
    } finally {
      setLoadingStakingAdminConfig(false);
    }
  };

  const refreshStakingPools = async () => {
    setLoadingStakingPools(true);
    try {
      const pools = await fetchKedolikStakingAdminPools(connection);
      setStakingPools(pools);
      setStakingPoolForm((current) => ({
        ...current,
        poolId: current.poolId || getNextStakingPoolId(pools),
      }));
    } catch (error) {
      console.error('Error fetching staking pools:', error);
      showToast(`Failed to load staking pools: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setLoadingStakingPools(false);
    }
  };

  // Auto-fetch fee receiver on load
  useEffect(() => {
    if (connected && wallet) {
      fetchCurrentFeeReceiver();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    void fetchStakingAdminConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  useEffect(() => {
    if (connected && canViewStakingInstance) {
      void refreshStakingPools();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, canViewStakingInstance, connection]);

  useEffect(() => {
    if (!connected || !canAccessAdmin) {
      return;
    }

    if (activeTab === 'fees' && !canClaimFees) {
      setActiveTab(canViewStakingInstance ? 'staking' : 'settings');
    } else if (activeTab === 'settings' && !canChangeSettings) {
      setActiveTab(canViewStakingInstance ? 'staking' : 'fees');
    }
  }, [activeTab, canAccessAdmin, canChangeSettings, canClaimFees, canViewStakingInstance, connected]);
  
  // Fetch current fee receiver from AMM config
  const fetchCurrentFeeReceiver = async () => {
    if (!connected || !wallet) return;
    
    setLoadingConfig(true);
    try {
      const { getProgram, AMM_CONFIG } = await import('../utils/amm');
      const program = getProgram(connection, wallet);
      
      type AmmCfg = { feeReceiver?: { toString(): string }; fundOwner?: { toString(): string } };
      type AmmProgramAcc = { ammConfig: { fetch: (p: unknown) => Promise<AmmCfg> } };
      const ammConfigData = await (program.account as unknown as AmmProgramAcc).ammConfig.fetch(AMM_CONFIG);
      
      // NEW: Unified fee_receiver field (try new field first, fallback to old for compatibility)
      const receiver = ammConfigData.feeReceiver?.toString() || ammConfigData.fundOwner?.toString();
      if (receiver) {
        setCurrentFeeReceiver(receiver);
        console.log('✅ Unified fee receiver loaded:', receiver);
      }
      
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
      
      // Log fee data for debugging
      console.log('💰 Admin: Fetched fees for', fees.length, 'pools:');
      fees.forEach(f => {
        const hasAnyFees = f.protocolFeesToken0 > 0 || f.protocolFeesToken1 > 0 || 
                          f.fundFeesToken0 > 0 || f.fundFeesToken1 > 0 ||
                          f.creatorFeesToken0 > 0 || f.creatorFeesToken1 > 0;
        if (hasAnyFees) {
          console.log(`  ${f.token0Symbol}/${f.token1Symbol} (${f.poolAddress.slice(0, 8)}...):`, {
            protocol: `${f.protocolFeesToken0} ${f.token0Symbol} / ${f.protocolFeesToken1} ${f.token1Symbol}`,
            fund: `${f.fundFeesToken0} ${f.token0Symbol} / ${f.fundFeesToken1} ${f.token1Symbol}`,
            creator: `${f.creatorFeesToken0} ${f.token0Symbol} / ${f.creatorFeesToken1} ${f.token1Symbol}`,
          });
        }
      });
      
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
    if (!canClaimFees || !publicKey || !wallet.signTransaction) {
      showToast('Only the fee receiver can collect fees', 'error');
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
      // NOTE: owner must be the fee receiver (fund_owner) in the new contract model
      const collectProtocolIx = await program.methods
        .collectProtocolFee(amount0Requested, amount1Requested)
        .accounts({
          owner: publicKey, // Must be the fee receiver wallet
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
            owner: publicKey, // Must be the fee receiver wallet
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
      
      const { confirmTransactionWithBlockhash } = await import('../utils/transactionConfirmation');
      const confirmation = await confirmTransactionWithBlockhash(connection, {
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value && confirmation.value.err) {
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
      const newReceiverPubkey = new PublicKey(newFeeReceiver);
      
      // Build and send updates across all active AMM configs
      const { getProgram, AMM_CONFIG, fetchPools } = await import('../utils/amm');
      const program = getProgram(connection, wallet);

      // Determine which AMM configs to update: use those present in pools; fallback to default
      const pools = await fetchPools(connection, wallet);
      const ammConfigs = Array.from(new Set((pools?.map(p => p.ammConfig.toString()) || [])));
      if (ammConfigs.length === 0) {
        ammConfigs.push(AMM_CONFIG.toString());
      }

      showToast(`Updating unified fee receiver on ${ammConfigs.length} config(s)...`, 'info');

      // Execute sequentially for reliability
      for (const cfgStr of ammConfigs) {
        const cfg = new PublicKey(cfgStr);

        showToast(`Updating fee receiver on config ${cfg.toString().slice(0, 8)}…`, 'info');
        
        // NEW: Update unified fee_receiver (param=4)
        // This single update now controls ALL fee destinations:
        // - Pool creation fees (1 SOL)
        // - Protocol fees (from swaps)
        // - Fund fees (from swaps)
        // - KEDOLOG discount fees
        const tx = await program.methods
          .updateAmmConfig(4, new BN(0)) // param 4 = unified fee_receiver
          .accounts({ owner: publicKey, ammConfig: cfg })
          .remainingAccounts([{ pubkey: newReceiverPubkey, isSigner: false, isWritable: false }])
          .rpc();

        // Wait for confirmation before proceeding (using polling for Alchemy RPC compatibility)
        const { smartConfirmTransaction } = await import('../utils/transactionConfirmation');
        await smartConfirmTransaction(connection, tx, 'confirmed');
        showToast(`✅ Unified fee receiver updated on ${cfg.toString().slice(0, 8)}…`, 'success', tx);
        
        // Add small delay to avoid RPC rate limiting before next config
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Refresh view
      await fetchCurrentFeeReceiver();
      showToast('✅ Unified fee receiver updated everywhere!', 'success');
      setNewFeeReceiver('');

    } catch (error: unknown) {
      console.error('Update fee receiver error:', error);
      showToast(`Update failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Update admin owner
  const updateAdmin = async () => {
    if (!isAdmin || !publicKey || !wallet.signTransaction) {
      showToast('Only current admin can change admin', 'error');
      return;
    }

    if (!newAdmin) {
      showToast('Please enter a new admin address', 'warning');
      return;
    }

    try {
      setUpdatingAdmin(true);
      const newAdminPubkey = new PublicKey(newAdmin);
      
      // Build and send updates across all active AMM configs
      const { getProgram, AMM_CONFIG, fetchPools } = await import('../utils/amm');
      const program = getProgram(connection, wallet);

      // Determine which AMM configs to update
      const pools = await fetchPools(connection, wallet);
      const ammConfigs = Array.from(new Set((pools?.map(p => p.ammConfig.toString()) || [])));
      if (ammConfigs.length === 0) {
        ammConfigs.push(AMM_CONFIG.toString());
      }

      showToast(`Updating admin on ${ammConfigs.length} config(s)...`, 'info');

      // Execute sequentially for reliability
      for (const cfgStr of ammConfigs) {
        const cfg = new PublicKey(cfgStr);

        // Update owner (param = 3)
        showToast(`Updating admin on config ${cfg.toString().slice(0, 8)}…`, 'info');
        const tx = await program.methods
          .updateAmmConfig(3, new BN(0))
          .accounts({ owner: publicKey, ammConfig: cfg })
          .remainingAccounts([{ pubkey: newAdminPubkey, isSigner: false, isWritable: false }])
          .rpc();

        // Wait for confirmation before proceeding (using polling for Alchemy RPC compatibility)
        const { smartConfirmTransaction } = await import('../utils/transactionConfirmation');
        await smartConfirmTransaction(connection, tx, 'confirmed');
        showToast(`✅ Admin updated on config ${cfg.toString().slice(0, 8)}…`, 'success', tx);
        
        // Add delay before next config (if any)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Refresh admin status from blockchain
      await refreshConfig();
      
      showToast('✅ Admin updated successfully! Please reconnect with the new admin wallet.', 'success');
      showToast('⚠️ You will lose admin access after this transaction confirms.', 'warning');
      
      // Clear input field
      setNewAdmin('');

    } catch (error: unknown) {
      console.error('Update admin error:', error);
      showToast(`Update failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setUpdatingAdmin(false);
    }
  };

  const getPoolActionForm = (poolAddress: string) =>
    stakingPoolActionForms[poolAddress] ?? {
      fundAmount: '',
      rateAmount: '',
      rateDistributionSeconds: '2592000',
    };

  const setPoolActionFormValue = (
    poolAddress: string,
    field: 'fundAmount' | 'rateAmount' | 'rateDistributionSeconds',
    value: string
  ) => {
    setStakingPoolActionForms((current) => ({
      ...current,
      [poolAddress]: {
        ...getPoolActionForm(poolAddress),
        [field]: value,
      },
    }));
  };

  const createStakingInstance = async () => {
    if (!anchorWallet) {
      showToast('Connect the staking admin wallet before creating a staking instance', 'error');
      return;
    }

    if (!canCreateStakingInstance) {
      showToast(
        `Only the current staking admin can create staking instances: ${stakingAdminConfig?.authority ?? 'loading'}`,
        'error'
      );
      return;
    }

    if (
      !stakingPoolForm.stakeMint.trim() ||
      !stakingPoolForm.rewardMint.trim() ||
      !stakingPoolForm.rewardAmount.trim() ||
      !stakingPoolForm.rewardDistributionSeconds.trim()
    ) {
      showToast('Fill all staking instance fields', 'warning');
      return;
    }

    const poolId = stakingPoolForm.poolId || getNextStakingPoolId(stakingPools);
    const duration = Number(stakingPoolForm.rewardDistributionSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      showToast('Reward distribution seconds must be greater than zero', 'warning');
      return;
    }

    let initializedPool: KedolikStoredStakingPool | null = null;

    try {
      setCreatingStakingPool(true);
      const rewardBalance = await fetchKedolikWalletTokenBalance(
        connection,
        anchorWallet.publicKey,
        stakingPoolForm.rewardMint.trim()
      );
      const rewardAmountRaw = parseUiTokenAmount(stakingPoolForm.rewardAmount, rewardBalance.decimals);

      if (BigInt(rewardBalance.balanceRaw) < rewardAmountRaw) {
        showToast('Admin reward token balance is lower than the configured reward amount', 'error');
        return;
      }

      const rewardRatePerSecond = rewardAmountRaw / BigInt(Math.floor(duration));

      if (rewardRatePerSecond <= 0n) {
        showToast('Reward amount is too small for the selected distribution seconds', 'error');
        return;
      }

      deriveKedolikStakingPoolAddresses(
        stakingPoolForm.stakeMint.trim(),
        stakingPoolForm.rewardMint.trim(),
        poolId
      );

      showToast('Initializing Stake Lock V1 staking pool...', 'info');
      const initialized = await initializeKedolikStakingPool(connection, anchorWallet, {
        stakeMint: stakingPoolForm.stakeMint.trim(),
        rewardMint: stakingPoolForm.rewardMint.trim(),
        poolId,
        rewardAmountRaw: rewardAmountRaw.toString(),
        rewardDurationSeconds: Math.floor(duration),
      });
      initializedPool = initialized.pool;
      setFundingRecoveryPool(initialized.pool);
      await refreshStakingPools();

      try {
        showToast('Funding staking reward vault...', 'info');
        const fundSignature = await fundKedolikStakingRewards(
          connection,
          anchorWallet,
          initialized.pool.pool,
          rewardAmountRaw.toString()
        );

        showToast(`Staking pool funded: ${formatAddress(initialized.pool.pool)}`, 'success', fundSignature);
        setFundingRecoveryPool(null);
      } catch (fundError: unknown) {
        showToast('Pool was created, but rewards are not funded yet', 'warning');
        showToast(`Funding failed: ${(fundError as Error)?.message || String(fundError)}`, 'error');
        setFundingRecoveryPool(initialized.pool);
        return;
      }

      showToast(`Staking instance created: ${formatAddress(initialized.pool.pool)}`, 'success', initialized.signature);
      showToast('The new staking pool is now discoverable from the Staking page.', 'success');
      setStakingPoolForm((current) => ({
        ...current,
        poolId: '',
        rewardAmount: '',
      }));
      await refreshStakingPools();
    } catch (error: unknown) {
      if (initializedPool) {
        setFundingRecoveryPool(initializedPool);
      }
      showToast(`Failed to create staking instance: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setCreatingStakingPool(false);
    }
  };

  const fundStakingPool = async (pool: KedolikStakingAdminPool, amountUi: string) => {
    if (!anchorWallet) {
      showToast('Connect the staking admin wallet before funding rewards', 'error');
      return;
    }

    if (!canCreateStakingInstance) {
      showToast('Only the current staking admin can fund rewards from this panel', 'error');
      return;
    }

    try {
      setStakingPoolActionLoading(`fund:${pool.pool}`);
      const rewardBalance = await fetchKedolikWalletTokenBalance(connection, anchorWallet.publicKey, pool.rewardMint);
      const amountRaw = parseUiTokenAmount(amountUi, rewardBalance.decimals);

      if (BigInt(rewardBalance.balanceRaw) < amountRaw) {
        showToast('Admin reward token balance is lower than the funding amount', 'error');
        return;
      }

      const signature = await fundKedolikStakingRewards(connection, anchorWallet, pool.pool, amountRaw.toString());
      showToast(`Funded rewards for pool ${formatAddress(pool.pool)}`, 'success', signature);
      setFundingRecoveryPool((current) => current?.pool === pool.pool ? null : current);
      setPoolActionFormValue(pool.pool, 'fundAmount', '');
      await refreshStakingPools();
    } catch (error: unknown) {
      showToast(`Funding failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setStakingPoolActionLoading(null);
    }
  };

  const updateStakingPoolRewardRate = async (pool: KedolikStakingAdminPool) => {
    if (!anchorWallet) {
      showToast('Connect the staking admin wallet before changing rewards', 'error');
      return;
    }

    if (!canCreateStakingInstance) {
      showToast('Only the current staking admin can change reward rates', 'error');
      return;
    }

    const form = getPoolActionForm(pool.pool);
    const duration = Number(form.rateDistributionSeconds);

    if (!Number.isFinite(duration) || duration <= 0) {
      showToast('Distribution seconds must be greater than zero', 'warning');
      return;
    }

    try {
      setStakingPoolActionLoading(`rate:${pool.pool}`);
      const decimals = pool.rewardTokenDecimals ?? (
        await fetchKedolikWalletTokenBalance(connection, anchorWallet.publicKey, pool.rewardMint)
      ).decimals;
      const amountRaw = parseUiTokenAmount(form.rateAmount, decimals);
      const rewardVaultBalance = BigInt(pool.rewardVaultBalance ?? '0');

      if (rewardVaultBalance < amountRaw) {
        showToast('Reward vault balance is lower than the amount selected for distribution', 'error');
        return;
      }

      const nextRate = amountRaw / BigInt(Math.floor(duration));

      if (nextRate <= 0n) {
        showToast('Reward amount is too small for the selected distribution seconds', 'error');
        return;
      }

      const signature = await setKedolikStakingRewardRate(
        connection,
        anchorWallet,
        pool.pool,
        nextRate.toString()
      );

      showToast(`Reward rate updated for pool ${formatAddress(pool.pool)}`, 'success', signature);
      setPoolActionFormValue(pool.pool, 'rateAmount', '');
      await refreshStakingPools();
    } catch (error: unknown) {
      showToast(`Reward rate update failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setStakingPoolActionLoading(null);
    }
  };

  const stopStakingPoolRewards = async (pool: KedolikStakingAdminPool) => {
    if (!anchorWallet) {
      showToast('Connect the staking admin wallet before stopping rewards', 'error');
      return;
    }

    if (!canCreateStakingInstance) {
      showToast('Only the current staking admin can stop rewards', 'error');
      return;
    }

    try {
      setStakingPoolActionLoading(`stop:${pool.pool}`);
      const signature = await setKedolikStakingRewardRate(connection, anchorWallet, pool.pool, '0');
      showToast(`Rewards stopped for pool ${formatAddress(pool.pool)}`, 'success', signature);
      await refreshStakingPools();
    } catch (error: unknown) {
      showToast(`Stop rewards failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setStakingPoolActionLoading(null);
    }
  };

  const transferStakingAdminAuthority = async () => {
    if (!anchorWallet) {
      showToast('Connect the staking admin wallet before transferring authority', 'error');
      return;
    }

    if (!canCreateStakingInstance) {
      showToast('Only the current staking admin can transfer staking authority', 'error');
      return;
    }

    if (!newStakingAdmin.trim()) {
      showToast('Enter the new staking admin wallet address', 'warning');
      return;
    }

    const confirmed = window.confirm(
      'Transfer Stake Lock admin authority? After this confirms, only the new wallet can create pools and update rewards.'
    );

    if (!confirmed) {
      return;
    }

    try {
      setTransferringStakingAdmin(true);
      const signature = await transferKedolikStakingAdmin(connection, anchorWallet, newStakingAdmin.trim());
      showToast('Stake Lock admin authority transferred', 'success', signature);
      setNewStakingAdmin('');
      await fetchStakingAdminConfig();
    } catch (error: unknown) {
      showToast(`Transfer failed: ${(error as Error)?.message || String(error)}`, 'error');
    } finally {
      setTransferringStakingAdmin(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950">
        {/* Subtle Background Effects */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-cyan/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-pink/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="gradient-text">Admin Panel</span>
            </h1>
            <p className="text-gray-400 text-sm sm:text-base">Manage protocol fees and configuration</p>
          </div>

          {/* Admin Check */}
          {!connected && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-yellow-400 font-medium">Please connect your wallet to access the admin panel</p>
            </div>
          )}

          {connected && !canAccessAdmin && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">🚫</div>
              <p className="text-red-400 font-semibold mb-2">Access Denied</p>
              <p className="text-gray-400 mb-4">
                Only the protocol admin, staking admin, or fee receiver can access this panel
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                {currentAdmin ? (
                  <p>Current Admin: <span className="font-mono">{currentAdmin.slice(0, 12)}...{currentAdmin.slice(-8)}</span></p>
                ) : (
                  <p>Loading admin from blockchain...</p>
                )}
                {currentFeeReceiver && (
                  <p>Current Fee Receiver: <span className="font-mono">{currentFeeReceiver.slice(0, 12)}...{currentFeeReceiver.slice(-8)}</span></p>
                )}
                {stakingAdminConfig?.authority && (
                  <p>Current Staking Admin: <span className="font-mono">{stakingAdminConfig.authority.slice(0, 12)}...{stakingAdminConfig.authority.slice(-8)}</span></p>
                )}
                <p>Your wallet: <span className="font-mono">{publicKey?.toString().slice(0, 12)}...{publicKey?.toString().slice(-8)}</span></p>
                <button
                  onClick={() => {
                    refreshConfig();
                    fetchCurrentFeeReceiver();
                    fetchStakingAdminConfig();
                  }}
                  className="mt-2 text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                >
                  🔄 Refresh Status
                </button>
              </div>
            </div>
          )}

          {connected && canAccessAdmin && (
            <>
              {/* Role Badge */}
              <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-400 mb-1">Your Role</h3>
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <span className="px-3 py-1 bg-brand-purple/20 text-brand-purple rounded-full text-xs font-semibold border border-brand-purple/30">
                          Admin {isOnChainAdmin ? '(Can change settings)' : '(Frontend access)'}
                        </span>
                      )}
                      {isStakingAdmin && (
                        <span className="px-3 py-1 bg-brand-cyan/20 text-brand-cyan rounded-full text-xs font-semibold border border-brand-cyan/30">
                          Staking Admin (Can create pools)
                        </span>
                      )}
                      {isFeeReceiver && (
                        <span className="px-3 py-1 bg-brand-cyan/20 text-brand-cyan rounded-full text-xs font-semibold border border-brand-cyan/30">
                          💰 Fee Receiver (Can claim fees)
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      refreshConfig();
                      fetchCurrentFeeReceiver();
                      fetchStakingAdminConfig();
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 rounded-lg transition-all whitespace-nowrap"
                  >
                    🔄 Refresh Status
                  </button>
                </div>
                {isFrontendAdmin && !isOnChainAdmin && (
                  <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                    This wallet has frontend admin-page access. On-chain settings transactions may
                    still require the wallet stored as protocol admin in the AMM config. Staking
                    pool creation requires the current Stake Lock admin.
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-2 mb-6">
                <div className="flex gap-2">
                  {canClaimFees && (
                    <button
                      onClick={() => setActiveTab('fees')}
                      className={`flex-1 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        activeTab === 'fees'
                          ? 'bg-gradient-brand text-white shadow-lg'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="mr-2">💰</span>
                      Fee Collection
                    </button>
                  )}
                  {canChangeSettings && (
                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`flex-1 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        activeTab === 'settings'
                          ? 'bg-gradient-brand text-white shadow-lg'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="mr-2">⚙️</span>
                      Settings
                    </button>
                  )}
                  {canViewStakingInstance && (
                    <button
                      onClick={() => setActiveTab('staking')}
                      className={`flex-1 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        activeTab === 'staking'
                          ? 'bg-gradient-brand text-white shadow-lg'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="mr-2">⚡</span>
                      Staking Instance
                    </button>
                  )}
                </div>
              </div>

              {/* Fee Collection Tab */}
              {activeTab === 'fees' && (
                <>
                  {!canClaimFees && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 text-center">
                      <div className="text-4xl mb-3">⚠️</div>
                      <p className="text-yellow-400 font-semibold mb-2">Fee Collection Not Available</p>
                      <p className="text-gray-400 mb-2">Only the fee receiver wallet can claim fees.</p>
                      <p className="text-xs text-gray-500">You are the admin and can change the fee receiver in Settings.</p>
                    </div>
                  )}

                  {canClaimFees && (
                    <>
                      {/* Header Action */}
                      <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div>
                            <h2 className="text-lg sm:text-xl font-bold mb-1">Protocol Fees Dashboard</h2>
                            <p className="text-xs sm:text-sm text-gray-400">View and collect accumulated fees from all pools</p>
                          </div>
                          <button
                            onClick={fetchPoolFees}
                            disabled={loading}
                            className="btn-primary whitespace-nowrap"
                          >
                            {loading ? '🔄 Loading...' : '🔄 Refresh'}
                          </button>
                        </div>
                      </div>

                  {/* Total Fees Summary */}
                  {Object.keys(totalFees).length > 0 && (
                    <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6 mb-6">
                      <h3 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2">
                        <span>📊</span>
                        <span>Total Collectable Fees</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Object.entries(totalFees).map(([token, fees]) => {
                          const totalFees = fees.protocol + fees.fund + fees.creator;
                          return (
                            <div key={token} className="bg-gradient-to-br from-brand-cyan/10 to-brand-purple/10 rounded-lg p-4 border border-white/10">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 bg-gradient-brand rounded-full flex items-center justify-center text-xs font-bold">
                                  {token[0]}
                                </div>
                                <div className="font-bold text-white text-sm truncate">{token}</div>
                              </div>
                              <div className="text-xl font-bold text-brand-cyan mb-1">
                                {totalFees < 0.0001 && totalFees > 0 
                                  ? totalFees.toExponential(2) 
                                  : totalFees.toFixed(Math.min(9, Math.max(4, -Math.floor(Math.log10(totalFees || 1)))))}
                              </div>
                              <div className="text-xs text-gray-400">Total Available</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Individual Pool Fees */}
                  {poolFees.length > 0 && (
                    <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                      <h3 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2">
                        <span>🏊</span>
                        <span>Pool-by-Pool Breakdown</span>
                      </h3>
                      <div className="space-y-3">
                        {poolFees.map((pool) => (
                          <div key={pool.poolAddress} className="bg-dark-900/80 rounded-lg p-4 border border-white/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2">
                                <div className="text-base font-bold text-white">
                                  {pool.token0Symbol}/{pool.token1Symbol}
                                </div>
                                <span className="text-xs text-gray-500 font-mono">
                                  {pool.poolAddress.slice(0, 8)}...
                                </span>
                              </div>
                              <button
                                onClick={() => collectAllFees(pool.poolAddress, pool)}
                                className="px-3 py-1.5 text-xs font-semibold bg-gradient-brand text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                disabled={
                                  (pool.protocolFeesToken0 + pool.fundFeesToken0 + pool.creatorFeesToken0) === 0 && 
                                  (pool.protocolFeesToken1 + pool.fundFeesToken1 + pool.creatorFeesToken1) === 0
                                }
                              >
                                💸 Collect All
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-brand-cyan/5 rounded-lg p-3 border border-brand-cyan/20">
                                <div className="text-xs text-gray-400 mb-1 truncate">{pool.token0Symbol}</div>
                                <div className="text-base font-bold text-white break-all">
                                  {(() => {
                                    const total = pool.protocolFeesToken0 + pool.fundFeesToken0 + pool.creatorFeesToken0;
                                    return total < 0.0001 && total > 0 
                                      ? total.toExponential(2) 
                                      : total.toFixed(Math.min(9, Math.max(4, -Math.floor(Math.log10(total || 1)))));
                                  })()}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1 space-y-0.5">
                                  {pool.protocolFeesToken0 > 0 && <div>Protocol: {pool.protocolFeesToken0.toExponential(2)}</div>}
                                  {pool.fundFeesToken0 > 0 && <div>Fund: {pool.fundFeesToken0.toExponential(2)}</div>}
                                  {pool.creatorFeesToken0 > 0 && <div>Creator: {pool.creatorFeesToken0.toExponential(2)}</div>}
                                </div>
                              </div>
                              
                              <div className="bg-brand-pink/5 rounded-lg p-3 border border-brand-pink/20">
                                <div className="text-xs text-gray-400 mb-1 truncate">{pool.token1Symbol}</div>
                                <div className="text-base font-bold text-white break-all">
                                  {(() => {
                                    const total = pool.protocolFeesToken1 + pool.fundFeesToken1 + pool.creatorFeesToken1;
                                    return total < 0.0001 && total > 0 
                                      ? total.toExponential(2) 
                                      : total.toFixed(Math.min(9, Math.max(4, -Math.floor(Math.log10(total || 1)))));
                                  })()}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1 space-y-0.5">
                                  {pool.protocolFeesToken1 > 0 && <div>Protocol: {pool.protocolFeesToken1.toExponential(2)}</div>}
                                  {pool.fundFeesToken1 > 0 && <div>Fund: {pool.fundFeesToken1.toExponential(2)}</div>}
                                  {pool.creatorFeesToken1 > 0 && <div>Creator: {pool.creatorFeesToken1.toExponential(2)}</div>}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                      {poolFees.length === 0 && !loading && (
                        <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-8 text-center text-gray-400">
                          <div className="text-4xl mb-3">📭</div>
                          <p>No pool fees loaded yet.</p>
                          <p className="text-sm mt-1">Click "Refresh" to fetch data</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Stake Lock V1 Dashboard */}
              {activeTab === 'staking' && (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Total Pools', value: stakingDashboardSummary.totalPools },
                      { label: 'Active Pools', value: stakingDashboardSummary.activePools },
                      { label: 'Unfunded Pools', value: stakingDashboardSummary.unfundedPools },
                      { label: 'Rewards Stopped', value: stakingDashboardSummary.rewardsStoppedPools },
                    ].map((card) => (
                      <div key={card.label} className="rounded-xl border border-white/10 bg-dark-800/50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {card.label}
                        </div>
                        <div className="mt-2 text-2xl font-bold text-white">{card.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-dark-800/50 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-white">Kedolik Stake Lock V1</h2>
                        <p className="mt-1 text-sm text-gray-400">
                          Create staking pools, fund reward vaults, and manage reward emissions from the combined program.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void fetchStakingAdminConfig();
                          void refreshStakingPools();
                        }}
                        disabled={loadingStakingAdminConfig || loadingStakingPools}
                        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                      >
                        {loadingStakingPools ? 'Refreshing...' : 'Refresh staking'}
                      </button>
                    </div>
                    <div className="mt-4 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 p-3 text-sm text-brand-cyan">
                      <div className="font-semibold text-white">Reward rate meaning</div>
                      <p className="mt-1">
                        Reward rate is the total reward tokens emitted by the whole pool per second.
                        It is not per user. Each staker earns a share based on their stake divided by total staked.
                      </p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Program ID</div>
                        <div className="break-all font-mono text-xs text-white">6M6TzGRSRqYxYmAihrXgF6MrmrCJno4RK9mEDdtkanCW</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Admin Config</div>
                        <div className="break-all font-mono text-xs text-white">6zJinApyxvq5FK84oQjvuwj4i1xnoLNbD28WEmmyDQPR</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Current Staking Admin</div>
                        <div className="break-all font-mono text-xs text-white">
                          {loadingStakingAdminConfig ? 'Loading...' : stakingAdminConfig?.authority ?? 'Unavailable'}
                        </div>
                      </div>
                    </div>
                    {!canCreateStakingInstance && (
                      <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                        Staking actions are hidden because the connected wallet does not match adminConfig.authority.
                        Existing pools are shown read-only.
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-dark-800/50 p-4 sm:p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-white">Technical Section</h3>
                      <p className="mt-1 text-sm text-gray-400">
                        Contract details used by the admin panel for pool creation, funding, and reward updates.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Token Program</div>
                        <div className="break-all font-mono text-xs text-white">
                          TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Pool PDA Seeds</div>
                        <div className="break-all font-mono text-xs text-white">
                          staking_pool, adminConfig, stakeMint, rewardMint, poolIdLeU64
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Vault PDA Seeds</div>
                        <div className="break-all font-mono text-xs text-white">
                          stake_vault + pool, reward_vault + pool
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Create Flow</div>
                        <div className="text-xs text-white">
                          initializeStakingPool, then fundRewards.
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Reward Rate Formula</div>
                        <div className="break-all font-mono text-xs text-white">
                          rewardAmountRaw / distributionSeconds
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                        <div className="mb-1 text-xs text-gray-400">Not Supported</div>
                        <div className="text-xs text-white">
                          Delete pool, withdraw unused rewards, change mints, or hard pause staking.
                        </div>
                      </div>
                    </div>
                  </div>

                  {fundingRecoveryPool && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="font-bold text-orange-200">Created, not funded</h3>
                          <p className="mt-1 text-sm text-orange-100">
                            Rewards are not funded yet for pool {formatAddress(fundingRecoveryPool.pool)}.
                          </p>
                          <div className="mt-2 grid gap-2 text-xs text-orange-100 md:grid-cols-2">
                            <span className="break-all font-mono">Pool: {fundingRecoveryPool.pool}</span>
                            <span className="break-all font-mono">Reward vault: {fundingRecoveryPool.rewardVault}</span>
                          </div>
                        </div>
                        {(() => {
                          const recoveryPool = stakingPools.find((pool) => pool.pool === fundingRecoveryPool.pool);
                          const form = getPoolActionForm(fundingRecoveryPool.pool);

                          return recoveryPool && canCreateStakingInstance ? (
                            <div className="flex min-w-[260px] flex-col gap-2">
                              <input
                                value={form.fundAmount}
                                onChange={(event) => setPoolActionFormValue(fundingRecoveryPool.pool, 'fundAmount', event.target.value)}
                                placeholder="Reward amount"
                                className="rounded-lg border border-orange-500/30 bg-dark-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-300"
                              />
                              <button
                                type="button"
                                onClick={() => void fundStakingPool(recoveryPool, form.fundAmount)}
                                disabled={!form.fundAmount.trim() || stakingPoolActionLoading !== null}
                                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                              >
                                Fund rewards
                              </button>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
                    <div className="rounded-xl border border-white/10 bg-dark-800/50 p-4 sm:p-6">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-white">Existing Staking Pools</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            Pool state is read from staking accounts and token vault balances.
                          </p>
                        </div>
                      </div>

                      {loadingStakingPools && (
                        <div className="rounded-lg border border-white/10 bg-dark-900 p-4 text-sm text-gray-300">
                          Loading staking pools...
                        </div>
                      )}

                      {!loadingStakingPools && stakingPools.length === 0 && (
                        <div className="rounded-lg border border-white/10 bg-dark-900 p-6 text-center text-sm text-gray-400">
                          No staking pools found yet.
                        </div>
                      )}

                      <div className="space-y-4">
                        {stakingPools.map((pool) => {
                          const actionForm = getPoolActionForm(pool.pool);
                          const rewardVaultBalanceRaw = BigInt(pool.rewardVaultBalance ?? '0');
                          const rewardRateRaw = BigInt(pool.rewardRatePerSecond || '0');
                          const rateActionLabel = pool.status === 'rewards_stopped' ? 'Resume Rewards' : 'Change Reward Rate';

                          return (
                            <div key={pool.pool} className="rounded-xl border border-white/10 bg-dark-900/80 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-white">Stake Lock Pool #{pool.poolId}</h4>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPoolStatusClasses(pool.status)}`}>
                                      {pool.statusLabel}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-gray-400">{pool.statusMessage}</p>
                                </div>
                                <div className="text-xs text-gray-400">
                                  Rewards remaining: {formatDuration(pool.secondsOfRewardsRemaining)}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Pool Address</div>
                                  <div className="mt-1 break-all font-mono text-xs text-white">{pool.pool}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Stake Mint</div>
                                  <div className="mt-1 break-all font-mono text-xs text-white">{pool.stakeMint}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Reward Mint</div>
                                  <div className="mt-1 break-all font-mono text-xs text-white">{pool.rewardMint}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Total Staked</div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {formatRawTokenAmount(pool.totalStaked, pool.stakeTokenDecimals)}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Reward Rate / Second</div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {formatRawTokenAmount(pool.rewardRatePerSecond, pool.rewardTokenDecimals)}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Reward Vault Balance</div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {formatRawTokenAmount(pool.rewardVaultBalance, pool.rewardTokenDecimals)}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="text-xs text-gray-400">Stake Vault Balance</div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {formatRawTokenAmount(pool.stakeVaultBalance, pool.stakeTokenDecimals)}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 md:col-span-2">
                                  <div className="text-xs text-gray-400">Vaults</div>
                                  <div className="mt-1 break-all font-mono text-xs text-white">Stake: {pool.stakeVault}</div>
                                  <div className="mt-1 break-all font-mono text-xs text-white">Reward: {pool.rewardVault}</div>
                                </div>
                              </div>

                              {(rewardVaultBalanceRaw === 0n || rewardRateRaw === 0n) && (
                                <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                                  User-facing staking should warn before new stakes because
                                  {rewardVaultBalanceRaw === 0n ? ' the reward vault is empty.' : ' the reward rate is zero.'}
                                </div>
                              )}

                              {canCreateStakingInstance && (
                                <details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                                  <summary className="cursor-pointer text-sm font-semibold text-white">
                                    Pool actions
                                  </summary>
                                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                                    <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                                      <h5 className="text-sm font-semibold text-white">Add More Rewards</h5>
                                      <p className="mt-2 text-xs text-gray-400">
                                        Transfers more reward tokens into this pool reward vault. This does not change
                                        the reward rate by itself.
                                      </p>
                                      <input
                                        value={actionForm.fundAmount}
                                        onChange={(event) => setPoolActionFormValue(pool.pool, 'fundAmount', event.target.value)}
                                        placeholder="Reward amount"
                                        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-cyan"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void fundStakingPool(pool, actionForm.fundAmount)}
                                        disabled={!actionForm.fundAmount.trim() || stakingPoolActionLoading !== null}
                                        className="mt-3 w-full rounded-lg bg-brand-cyan/20 px-4 py-2 text-sm font-semibold text-brand-cyan transition-colors hover:bg-brand-cyan/30 disabled:opacity-50"
                                      >
                                        {stakingPoolActionLoading === `fund:${pool.pool}` ? 'Funding...' : 'Fund rewards'}
                                      </button>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                                      <h5 className="text-sm font-semibold text-white">{rateActionLabel}</h5>
                                      <p className="mt-2 text-xs text-gray-400">
                                        Calculates a new total pool emission rate from reward amount divided by
                                        distribution seconds, then calls setRewardRate.
                                      </p>
                                      <input
                                        value={actionForm.rateAmount}
                                        onChange={(event) => setPoolActionFormValue(pool.pool, 'rateAmount', event.target.value)}
                                        placeholder="Reward amount in vault"
                                        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-cyan"
                                      />
                                      <input
                                        value={actionForm.rateDistributionSeconds}
                                        onChange={(event) => setPoolActionFormValue(pool.pool, 'rateDistributionSeconds', event.target.value)}
                                        placeholder="Distribution seconds"
                                        className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-cyan"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void updateStakingPoolRewardRate(pool)}
                                        disabled={
                                          !actionForm.rateAmount.trim() ||
                                          !actionForm.rateDistributionSeconds.trim() ||
                                          rewardVaultBalanceRaw === 0n ||
                                          stakingPoolActionLoading !== null
                                        }
                                        className="mt-3 w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                                      >
                                        {stakingPoolActionLoading === `rate:${pool.pool}` ? 'Updating...' : rateActionLabel}
                                      </button>
                                    </div>

                                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                      <h5 className="text-sm font-semibold text-red-200">Stop Rewards</h5>
                                      <p className="mt-2 text-xs text-red-100">
                                        This does work: it sets rewardRatePerSecond to 0, so no future rewards accrue.
                                        Users can still unstake and claim rewards already accrued by the contract.
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => void stopStakingPoolRewards(pool)}
                                        disabled={rewardRateRaw === 0n || stakingPoolActionLoading !== null}
                                        className="mt-3 w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                                      >
                                        {stakingPoolActionLoading === `stop:${pool.pool}` ? 'Stopping...' : 'Stop rewards'}
                                      </button>
                                    </div>
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-xl border border-white/10 bg-dark-800/50 p-4 sm:p-6">
                        <div className="mb-5 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-white">Create Staking Pool</h3>
                            <p className="mt-1 text-sm text-gray-400">
                              Pool ID is generated automatically from existing pools.
                            </p>
                          </div>
                          <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs font-semibold text-brand-cyan">
                            Devnet
                          </span>
                        </div>

                        {!canCreateStakingInstance ? (
                          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                            Connect the wallet stored in adminConfig.authority to create and fund staking pools.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <label className="block rounded-lg border border-white/10 bg-dark-900 p-3">
                              <div className="mb-2 text-xs text-gray-400">Stake token mint</div>
                              <input
                                value={stakingPoolForm.stakeMint}
                                onChange={(event) => setStakingPoolForm((current) => ({ ...current, stakeMint: event.target.value }))}
                                placeholder="Stake mint address"
                                className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder-gray-500"
                              />
                            </label>
                            <label className="block rounded-lg border border-white/10 bg-dark-900 p-3">
                              <div className="mb-2 text-xs text-gray-400">Reward token mint</div>
                              <input
                                value={stakingPoolForm.rewardMint}
                                onChange={(event) => setStakingPoolForm((current) => ({ ...current, rewardMint: event.target.value }))}
                                placeholder="Reward mint address"
                                className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder-gray-500"
                              />
                            </label>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block rounded-lg border border-white/10 bg-dark-900 p-3">
                                <div className="mb-2 text-xs text-gray-400">Reward amount</div>
                                <input
                                  value={stakingPoolForm.rewardAmount}
                                  onChange={(event) => setStakingPoolForm((current) => ({ ...current, rewardAmount: event.target.value }))}
                                  placeholder="1000"
                                  className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-500"
                                />
                              </label>
                              <label className="block rounded-lg border border-white/10 bg-dark-900 p-3">
                                <div className="mb-2 text-xs text-gray-400">Distribution seconds</div>
                                <input
                                  value={stakingPoolForm.rewardDistributionSeconds}
                                  onChange={(event) => setStakingPoolForm((current) => ({
                                    ...current,
                                    rewardDistributionSeconds: event.target.value,
                                  }))}
                                  placeholder="2592000"
                                  className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-500"
                                />
                              </label>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-gray-300">
                              The panel fetches reward mint decimals, converts reward amount to raw units, then sets:
                              <span className="mt-1 block font-mono text-brand-cyan">
                                rewardRatePerSecond = rewardAmountRaw / distributionSeconds
                              </span>
                              That rate is shared across all stakers by stake percentage.
                            </div>
                            <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                              <div className="mb-1 text-xs text-gray-400">Auto-generated pool ID</div>
                              <div className="font-mono text-sm text-white">
                                {stakingPoolForm.poolId || getNextStakingPoolId(stakingPools)}
                              </div>
                            </div>

                            {createPoolAddresses && (
                              <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 p-3 text-xs text-brand-cyan">
                                <div className="font-semibold text-white">Derived addresses</div>
                                <div className="mt-2 break-all font-mono">Pool: {createPoolAddresses.pool}</div>
                                <div className="mt-1 break-all font-mono">Stake vault: {createPoolAddresses.stakeVault}</div>
                                <div className="mt-1 break-all font-mono">Reward vault: {createPoolAddresses.rewardVault}</div>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={createStakingInstance}
                              disabled={creatingStakingPool}
                              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {creatingStakingPool ? 'Creating...' : 'Create and fund pool'}
                            </button>
                          </div>
                        )}
                      </div>

                      {canCreateStakingInstance && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:p-6">
                          <h3 className="text-lg font-bold text-red-200">Transfer Admin Authority</h3>
                          <p className="mt-2 text-sm text-red-100">
                            After transfer, only the new wallet can create pools, fund rewards from this panel,
                            or change reward rates.
                          </p>
                          <input
                            value={newStakingAdmin}
                            onChange={(event) => setNewStakingAdmin(event.target.value)}
                            placeholder="New admin wallet"
                            className="mt-4 w-full rounded-lg border border-red-500/30 bg-dark-900 px-3 py-2 text-sm text-white outline-none placeholder-gray-500 focus:border-red-300"
                          />
                          <button
                            type="button"
                            onClick={() => void transferStakingAdminAuthority()}
                            disabled={!newStakingAdmin.trim() || transferringStakingAdmin}
                            className="mt-3 w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                          >
                            {transferringStakingAdmin ? 'Transferring...' : 'Transfer admin authority'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Staking Instance Tab */}
              {false && activeTab === 'staking' && (
                <>
                  {!canCreateStakingInstance && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 text-center">
                      <div className="text-4xl mb-3">⚠️</div>
                      <p className="text-yellow-400 font-semibold mb-2">Staking Admin Not Available</p>
                      <p className="text-gray-400 mb-2">
                        Only the wallet stored in the Stake Lock admin config can create staking instances.
                      </p>
                      <div className="mt-4 grid gap-3 text-left md:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                          <div className="mb-1 text-xs text-gray-400">Current Staking Admin</div>
                          <div className="break-all font-mono text-xs text-white">
                            {loadingStakingAdminConfig
                              ? 'Loading...'
                              : stakingAdminConfig?.authority ?? 'Unavailable'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-dark-900 p-3">
                          <div className="mb-1 text-xs text-gray-400">Connected Wallet</div>
                          <div className="break-all font-mono text-xs text-white">
                            {connectedWalletAddress ?? 'Connect wallet'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {canCreateStakingInstance && (
                    <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                        <div>
                          <h2 className="text-lg sm:text-xl font-bold mb-1">Create Staking Instance</h2>
                          <p className="text-xs sm:text-sm text-gray-400">
                            Initializes a Stake Lock V1 pool and funds its reward vault.
                          </p>
                        </div>
                        <div className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs font-semibold text-brand-cyan">
                          Devnet
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="bg-dark-900 border border-white/10 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-2">Stake Token CA</div>
                          <input
                            value={stakingPoolForm.stakeMint}
                            onChange={(event) =>
                              setStakingPoolForm((current) => ({ ...current, stakeMint: event.target.value }))
                            }
                            placeholder="Stake mint address"
                            className="w-full bg-transparent text-sm font-mono text-white placeholder-gray-500 outline-none"
                          />
                        </label>

                        <label className="bg-dark-900 border border-white/10 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-2">Reward Token CA</div>
                          <input
                            value={stakingPoolForm.rewardMint}
                            onChange={(event) =>
                              setStakingPoolForm((current) => ({ ...current, rewardMint: event.target.value }))
                            }
                            placeholder="Reward mint address"
                            className="w-full bg-transparent text-sm font-mono text-white placeholder-gray-500 outline-none"
                          />
                        </label>

                        <label className="bg-dark-900 border border-white/10 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-2">Pool ID</div>
                          <input
                            value={stakingPoolForm.poolId}
                            onChange={(event) =>
                              setStakingPoolForm((current) => ({ ...current, poolId: event.target.value }))
                            }
                            placeholder="1"
                            className="w-full bg-transparent text-sm font-mono text-white placeholder-gray-500 outline-none"
                          />
                        </label>

                        <label className="bg-dark-900 border border-white/10 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-2">Reward Duration Seconds</div>
                          <input
                            value={stakingPoolForm.rewardDurationSeconds}
                            onChange={(event) =>
                              setStakingPoolForm((current) => ({
                                ...current,
                                rewardDurationSeconds: event.target.value,
                              }))
                            }
                            placeholder="2592000"
                            className="w-full bg-transparent text-sm font-mono text-white placeholder-gray-500 outline-none"
                          />
                        </label>
                      </div>

                      <label className="mt-3 block bg-dark-900 border border-white/10 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-2">Reward Amount Raw Units</div>
                        <input
                          value={stakingPoolForm.rewardAmountRaw}
                          onChange={(event) =>
                            setStakingPoolForm((current) => ({
                              ...current,
                              rewardAmountRaw: event.target.value,
                            }))
                          }
                          placeholder="Raw token amount, e.g. 1000000000 for 1 token with 9 decimals"
                          className="w-full bg-transparent text-sm font-mono text-white placeholder-gray-500 outline-none"
                        />
                      </label>

                      <button
                        onClick={createStakingInstance}
                        disabled={creatingStakingPool}
                        className="btn-primary mt-5 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingStakingPool ? 'Creating...' : 'Create Staking Instance'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <>
                  {!canChangeSettings && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 text-center">
                      <div className="text-4xl mb-3">⚠️</div>
                      <p className="text-yellow-400 font-semibold mb-2">Settings Not Available</p>
                      <p className="text-gray-400 mb-2">Only the admin wallet can change settings.</p>
                      <p className="text-xs text-gray-500">You are the fee receiver and can claim fees instead.</p>
                    </div>
                  )}

                  {canChangeSettings && (
                    <div className="space-y-4">
                  {/* Current Receiver */}
                  <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold mb-1">Current Fee Receiver</h3>
                        <p className="text-xs text-gray-400">Address that receives protocol fees</p>
                      </div>
                      <button
                        onClick={fetchCurrentFeeReceiver}
                        disabled={loadingConfig}
                        className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                      >
                        {loadingConfig ? '⏳ Loading…' : '🔄 Load Current'}
                      </button>
                    </div>
                    {currentFeeReceiver && (
                      <div className="bg-black/30 rounded-lg p-3">
                        <div className="font-mono text-xs text-white break-all">
                          {currentFeeReceiver}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Update Receiver */}
                  <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                    <h3 className="text-base font-bold mb-1">Update Fee Receiver</h3>
                    <p className="text-xs text-gray-400 mb-4">Set a new address to receive protocol fees</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                      <input
                        type="text"
                        value={newFeeReceiver}
                        onChange={(e) => setNewFeeReceiver(e.target.value)}
                        placeholder="Enter new fee receiver public key"
                        className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan"
                      />
                      <button
                        onClick={updateFeeReceiver}
                        disabled={updating || !newFeeReceiver}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-brand text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {updating ? '⏳ Updating…' : '✅ Update'}
                      </button>
                    </div>
                    
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-xs text-blue-300 font-semibold mb-2">
                        ✨ Unified Fee Receiver (One address for ALL fees)
                      </p>
                      <p className="text-xs text-blue-200">
                        This single address receives:
                      </p>
                      <ul className="text-xs text-blue-200 mt-1 ml-4 space-y-0.5">
                        <li>• Pool creation fees (1 SOL per pool)</li>
                        <li>• Protocol swap fees (0.05% of each trade)</li>
                        <li>• Fund fees (from swaps)</li>
                        <li>• KEDOLOG discount fees (25% reduced fees)</li>
                      </ul>
                      <p className="text-xs text-blue-300 mt-2">
                        ℹ️ Update once, applies to all fee types!
                      </p>
                    </div>
                  </div>

                  {/* Change Admin */}
                  <div className="bg-dark-800/50 backdrop-blur-sm border border-red-500/20 rounded-xl p-4 sm:p-6">
                    <h3 className="text-base font-bold mb-1 text-red-400">⚠️ Change Admin</h3>
                    <p className="text-xs text-gray-400 mb-4">Transfer admin rights to a new wallet address</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                      <input
                        type="text"
                        value={newAdmin}
                        onChange={(e) => setNewAdmin(e.target.value)}
                        placeholder="Enter new admin public key"
                        className="flex-1 bg-dark-900 border border-red-500/30 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                      />
                      <button
                        onClick={updateAdmin}
                        disabled={updatingAdmin || !newAdmin}
                        className="px-5 py-2.5 text-sm font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {updatingAdmin ? '⏳ Updating…' : '🔄 Change Admin'}
                      </button>
                    </div>
                    
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                      <p className="text-xs text-red-300 font-semibold mb-1">
                        ⚠️ DANGER: This action is irreversible!
                      </p>
                      <p className="text-xs text-red-300">
                        Once you transfer admin rights, you will immediately lose all admin access. Make sure you have access to the new admin wallet before proceeding.
                      </p>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-400">Current Admin (On-Chain)</div>
                        <button
                          onClick={refreshConfig}
                          className="text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                        >
                          🔄 Refresh
                        </button>
                      </div>
                      <div className="font-mono text-xs text-white break-all">
                        {currentAdmin || 'Loading from blockchain...'}
                      </div>
                      {currentAdmin && isOnChainAdmin && (
                        <div className="mt-2 text-xs text-green-400">✅ You are the current admin</div>
                      )}
                      {currentAdmin && !isOnChainAdmin && isFrontendAdmin && (
                        <div className="mt-2 text-xs text-yellow-400">
                          Frontend admin-page access granted
                        </div>
                      )}
                      {currentAdmin && !isOnChainAdmin && !isFrontendAdmin && (
                        <div className="mt-2 text-xs text-red-400">❌ You are NOT the admin</div>
                      )}
                      {!currentAdmin && (
                        <div className="mt-2 text-xs text-yellow-400">⏳ Fetching admin from blockchain...</div>
                      )}
                    </div>
                  </div>

                  {/* System Info */}
                  <div className="bg-dark-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                    <h3 className="text-base font-bold mb-4">System Information</h3>
                    <div className="space-y-3">
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Admin Address</div>
                        <div className="font-mono text-xs text-white break-all">{currentAdmin}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Connected Wallet</div>
                        <div className="font-mono text-xs text-white break-all">{publicKey?.toString() || '—'}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Program ID</div>
                        <div className="font-mono text-xs text-white break-all">{PROGRAM_ID.toString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
                  )}
                </>
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


