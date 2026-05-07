import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  KEDOLIK_DEVNET_CONFIG,
  KEDOLIK_DEVNET_LIVE_MESSAGES,
  getKedolikExplorerAccountUrl,
} from '../config/kedolikDevnet';
import { KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS } from '../config/kedolikStakeLockV1';
import { KEDOLIK_DEVNET_README_NOTES } from '../features/kedolikDevnetNotes';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useKedolikProgramStatus } from '../hooks/useKedolikProgramStatus';
import { useKedolikStaking } from '../hooks/useKedolikStaking';
import { useRemoteTokens } from '../hooks/useRemoteTokens';
import type { TokenInfo } from '../config/tokens';
import {
  createKedolikStakingPool,
  fetchKedolikStakeLockAdminConfig,
  KedolikStakeLockAdminConfig,
  setKedolikStakingRewardRate,
  transferKedolikStakingAdmin,
} from '../services/kedolikStaking';
import {
  KedolikInfoRow,
  KedolikPageFrame,
  KedolikProgramStatusBadge,
  formatKedolikAddress,
  formatKedolikUnixTime,
  formatKedolikTokenAmount,
} from '../components/kedolik/KedolikShared';

const DEFAULT_ADMIN_FORM = {
  stakeMint: '',
  rewardMint: '',
  poolId: '1',
  rewardAmount: '',
  rewardDurationSeconds: '2592000',
};

const formatMetricAmount = (
  rawValue: string | null,
  decimals: number | null,
  fallback: string
) => (rawValue === null ? fallback : formatKedolikTokenAmount(rawValue, decimals));

const formatInputAmount = (rawValue: string | null, decimals: number | null) =>
  rawValue === null ? '' : formatKedolikTokenAmount(rawValue, decimals);

const formatPercentHundredths = (value: bigint) => {
  const compactUnits = [
    { divisor: 1_000_000_000_000n, suffix: 'T' },
    { divisor: 1_000_000_000n, suffix: 'B' },
    { divisor: 1_000_000n, suffix: 'M' },
    { divisor: 1_000n, suffix: 'K' },
  ];

  for (const unit of compactUnits) {
    if (value >= unit.divisor * 100n) {
      const scaledHundredths = value / unit.divisor;
      const whole = scaledHundredths / 100n;
      const fraction = (scaledHundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');

      return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}${unit.suffix}%`;
    }
  }

  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');

  return `${whole.toLocaleString('en-US')}.${fraction}%`;
};

const formatStakingApy = (
  annualRewardRaw: string | null,
  totalStakedRaw: string | null,
  stakeDecimals: number | null,
  rewardDecimals: number | null
) => {
  if (stakeDecimals === null || rewardDecimals === null || totalStakedRaw === null) {
    return 'Loading...';
  }

  try {
    const annualReward = BigInt(annualRewardRaw ?? '0');
    const totalStaked = BigInt(totalStakedRaw);

    if (annualReward <= 0n || totalStaked <= 0n) {
      return '0.00%';
    }

    const stakeScale = 10n ** BigInt(stakeDecimals);
    const rewardScale = 10n ** BigInt(rewardDecimals);
    const percentHundredths = (annualReward * stakeScale * 10000n) / (totalStaked * rewardScale);

    return formatPercentHundredths(percentHundredths);
  } catch {
    return 'Unavailable';
  }
};

const formatPoolCardLabel = (title: string) => {
  const poolId = title.match(/#(.+)$/)?.[1];

  return poolId ? `Pool #${poolId.slice(-6)}` : 'Stake Lock V1';
};

const parseAmountToRaw = (value: string, decimals: number | null) => {
  if (decimals === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) {
    return null;
  }

  const [wholePart = '0', fractionPart = ''] = trimmed.split('.');
  const normalizedFraction = fractionPart.slice(0, decimals).padEnd(decimals, '0');
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, '') || '0';

  return BigInt(`${normalizedWhole}${normalizedFraction}`);
};

const FieldCard = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
    <div className="mt-1.5 text-sm font-semibold text-white break-words">{value}</div>
  </div>
);

const TokenPill = ({ token, fallback }: { token?: TokenInfo; fallback: string }) => {
  const symbol = token?.symbol ?? fallback;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      {token?.logoURI ? (
        <img
          src={token.logoURI}
          alt={symbol}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
      ) : null}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white ${
          token?.logoURI ? 'hidden' : ''
        }`}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{symbol}</div>
        <div className="truncate text-[11px] text-gray-400">{token?.name ?? 'Unknown token'}</div>
      </div>
    </div>
  );
};

const TokenAvatar = ({
  token,
  fallback,
  className = '',
}: {
  token?: TokenInfo;
  fallback: string;
  className?: string;
}) => {
  const symbol = token?.symbol ?? fallback;

  if (token?.logoURI) {
    return (
      <>
        <img
          src={token.logoURI}
          alt={symbol}
          className={`h-8 w-8 rounded-full object-cover ${className}`}
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        <div
          className={`hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-[10px] font-bold text-white ${className}`}
        >
          {symbol.slice(0, 2).toUpperCase()}
        </div>
      </>
    );
  }

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-[10px] font-bold text-white ${className}`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
};

const AdminInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <label className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
      {label}
    </span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-3 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-gray-500"
    />
  </label>
);

export default function KedolikStaking() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const { programs, isLoading: isLoadingPrograms, refresh: refreshProgramStatus } = useKedolikProgramStatus();
  const { quarries, isLoading, error, refresh, stakingService } = useKedolikStaking();
  const { getTokenByMint } = useRemoteTokens();
  const [amount, setAmount] = useState('');
  const [amountMode, setAmountMode] = useState<'stake' | 'unstake'>('stake');
  const [actionLoading, setActionLoading] = useState<'stake' | 'unstake' | 'claim' | null>(null);
  const [adminConfig, setAdminConfig] = useState<KedolikStakeLockAdminConfig | null>(null);
  const [isLoadingAdminConfig, setIsLoadingAdminConfig] = useState(false);
  const [adminForm, setAdminForm] = useState(DEFAULT_ADMIN_FORM);
  const [adminRewardDecimals, setAdminRewardDecimals] = useState<number | null>(null);
  const [adminActionLoading, setAdminActionLoading] = useState<'createPool' | 'setRewardRate' | 'transferAdmin' | null>(null);
  const [newAdminAuthority, setNewAdminAuthority] = useState('');
  const [rewardRateRaw, setRewardRateRaw] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const activePool = useMemo(
    () => quarries.find((pool) => pool.id === selectedPoolId) ?? quarries[0] ?? null,
    [quarries, selectedPoolId]
  );
  const getTokenInfo = (mintAddress?: string | null) => {
    if (!mintAddress) {
      return undefined;
    }

    try {
      return getTokenByMint(new PublicKey(mintAddress));
    } catch {
      return undefined;
    }
  };
  const activeStakeToken = getTokenInfo(activePool?.stakeTokenMint);
  const activeRewardToken = getTokenInfo(activePool?.rewardTokenMint);
  const activeStakeSymbol = activeStakeToken?.symbol ?? 'Stake Token';
  const activeRewardSymbol = activeRewardToken?.symbol ?? 'Reward Token';
  const activePoolName = activePool
    ? `Earn ${activeRewardSymbol} by staking ${activeStakeSymbol}`
    : 'Kedolik Staking';
  const hasMultiplePools = quarries.length > 1;
  const stakeLockProgramStatus = programs.kedolikStakeLock;
  const connectedWalletAddress = publicKey?.toString() ?? null;
  const isStakeAdmin = Boolean(
    connectedWalletAddress && adminConfig?.authority === connectedWalletAddress
  );

  useEffect(() => {
    if (quarries.length === 0) {
      setSelectedPoolId(null);
      return;
    }

    if (!selectedPoolId || !quarries.some((pool) => pool.id === selectedPoolId)) {
      setSelectedPoolId(quarries[0].id);
    }
  }, [quarries, selectedPoolId]);

  useEffect(() => {
    let cancelled = false;

    const loadAdminConfig = async () => {
      setIsLoadingAdminConfig(true);

      try {
        const nextAdminConfig = await fetchKedolikStakeLockAdminConfig(connection);

        if (!cancelled) {
          setAdminConfig(nextAdminConfig);
        }
      } catch (adminError) {
        if (!cancelled) {
          setAdminConfig(null);
          toast.error(
            adminError instanceof Error ? adminError.message : 'Unable to load staking admin config.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAdminConfig(false);
        }
      }
    };

    void loadAdminConfig();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  useEffect(() => {
    let cancelled = false;

    const loadRewardDecimals = async () => {
      const rewardMint = adminForm.rewardMint.trim();

      if (!rewardMint) {
        setAdminRewardDecimals(null);
        return;
      }

      try {
        const mintInfo = await getMint(connection, new PublicKey(rewardMint), 'confirmed');

        if (!cancelled) {
          setAdminRewardDecimals(mintInfo.decimals);
        }
      } catch {
        if (!cancelled) {
          setAdminRewardDecimals(null);
        }
      }
    };

    void loadRewardDecimals();

    return () => {
      cancelled = true;
    };
  }, [adminForm.rewardMint, connection]);

  const rewardRate = useMemo(() => {
    if (!activePool?.rewardRate) {
      return 'No configured emissions';
    }

    return `${formatKedolikTokenAmount(activePool.rewardRate, activePool.rewardTokenDecimals)} / year`;
  }, [activePool]);

  const rewardsPerSecond = useMemo(() => {
    if (!activePool?.rewardsPerSecondEstimate) {
      return 'No configured emissions';
    }

    return `${formatKedolikTokenAmount(
      activePool.rewardsPerSecondEstimate,
      activePool.rewardTokenDecimals
    )} / second`;
  }, [activePool]);

  const poolApy = useMemo(
    () =>
      formatStakingApy(
        activePool?.rewardRate ?? null,
        activePool?.totalStaked ?? null,
        activePool?.stakeTokenDecimals ?? null,
        activePool?.rewardTokenDecimals ?? null
      ),
    [activePool]
  );

  const userStake = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    return formatMetricAmount(activePool?.userStake ?? null, activePool?.stakeTokenDecimals ?? null, 'No stake yet');
  }, [activePool, connected]);

  const claimableRewards = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    return formatMetricAmount(
      activePool?.claimableRewards ?? null,
      activePool?.rewardTokenDecimals ?? null,
      'No rewards yet'
    );
  }, [activePool, connected]);

  const stakeWalletBalance = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    return formatMetricAmount(
      activePool?.userWalletBalance ?? null,
      activePool?.stakeTokenDecimals ?? null,
      'Loading...'
    );
  }, [activePool, connected]);

  const rewardWalletBalance = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    return formatMetricAmount(
      activePool?.userRewardWalletBalance ?? null,
      activePool?.rewardTokenDecimals ?? null,
      'Loading...'
    );
  }, [activePool, connected]);

  const handleMax = () => {
    if (!activePool) {
      return;
    }

    setAmount(
      formatInputAmount(
        amountMode === 'stake' ? activePool.userWalletBalance : activePool.userStake,
        activePool.stakeTokenDecimals
      )
    );
  };

  const handleAmountModeChange = (nextMode: 'stake' | 'unstake') => {
    setAmountMode(nextMode);
    setAmount('');
  };

  const parsedAmountRaw =
    activePool !== null ? parseAmountToRaw(amount, activePool.stakeTokenDecimals) : null;
  const walletBalanceRaw = activePool?.userWalletBalance ? BigInt(activePool.userWalletBalance) : null;
  const userStakeRaw = activePool?.userStake ? BigInt(activePool.userStake) : null;
  const claimableRewardsRaw = activePool?.claimableRewards ? BigInt(activePool.claimableRewards) : 0n;
  const rewardVaultBalanceRaw = activePool?.sampleRewardWalletBalance
    ? BigInt(activePool.sampleRewardWalletBalance)
    : 0n;
  const rewardRatePerSecondRaw = activePool?.rewardsPerSecondEstimate
    ? BigInt(activePool.rewardsPerSecondEstimate)
    : 0n;
  const hasValidAmount = parsedAmountRaw !== null;
  const hasPositiveAmount = parsedAmountRaw !== null && parsedAmountRaw > 0n;
  const hasStakedTokens = Boolean(userStakeRaw && userStakeRaw > 0n);
  const stakingRewardsUnavailable = Boolean(
    activePool && (rewardVaultBalanceRaw === 0n || rewardRatePerSecondRaw === 0n)
  );
  const exceedsWalletBalance = Boolean(
    connected && parsedAmountRaw !== null && walletBalanceRaw !== null && parsedAmountRaw > walletBalanceRaw
  );
  const exceedsStakeBalance = Boolean(
    connected && parsedAmountRaw !== null && userStakeRaw !== null && parsedAmountRaw > userStakeRaw
  );
  const hasClaimableRewards = claimableRewardsRaw > 0n;
  const exceedsSelectedBalance = amountMode === 'stake' ? exceedsWalletBalance : exceedsStakeBalance;
  const primaryActionLabel = amountMode === 'stake' ? 'Stake' : 'Unstake';
  const positionStatusLabel = !connected
    ? 'Connect wallet'
    : hasStakedTokens
      ? 'Staked'
      : activePool?.hasMiner
        ? 'Position open'
        : 'No stake yet';
  const amountActionDisabled =
    !connected ||
    !activePool ||
    !hasValidAmount ||
    !hasPositiveAmount ||
    actionLoading !== null ||
    (amountMode === 'stake'
      ? exceedsWalletBalance || stakingRewardsUnavailable
      : !activePool.hasMiner || !hasStakedTokens || exceedsStakeBalance);
  const rewardAmountRaw = parseAmountToRaw(adminForm.rewardAmount, adminRewardDecimals);
  const rewardDurationSeconds = Number(adminForm.rewardDurationSeconds);
  const computedAdminRewardRate =
    rewardAmountRaw !== null && Number.isFinite(rewardDurationSeconds) && rewardDurationSeconds > 0
      ? rewardAmountRaw / BigInt(Math.floor(rewardDurationSeconds))
      : null;

  useEffect(() => {
    if (amountMode === 'unstake' && activePool && activePool.userStake === '0') {
      setAmountMode('stake');
      setAmount('');
    }
  }, [activePool, amountMode]);

  const connectWalletIfNeeded = () => {
    if (!connected) {
      setWalletModalVisible(true);
      return true;
    }

    return false;
  };

  const getActionErrorMessage = (actionError: unknown) =>
    actionError instanceof Error ? actionError.message : 'Kedolik Staking transaction failed.';

  const handleStake = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (parsedAmountRaw === null) {
      toast.error('Enter a valid amount to stake.');
      return;
    }

    if (parsedAmountRaw <= 0n) {
      toast.error('Enter an amount greater than zero.');
      return;
    }

    if (exceedsWalletBalance) {
      toast.error('Stake amount exceeds your wallet balance.');
      return;
    }

    if (stakingRewardsUnavailable) {
      toast.error('This pool is not currently funded for new staking rewards.');
      return;
    }

    if (!activePool) {
      toast.error('Select a staking pool first.');
      return;
    }

    setActionLoading('stake');

    try {
      await stakingService.stake(parsedAmountRaw.toString(), activePool.id);
      toast.success('Stake transaction submitted.');
      setAmount('');
      await refresh();
      await refreshProgramStatus();
    } catch (actionError) {
      toast.error(getActionErrorMessage(actionError));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnstake = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (parsedAmountRaw === null) {
      toast.error('Enter a valid amount to unstake.');
      return;
    }

    if (parsedAmountRaw <= 0n) {
      toast.error('Enter an amount greater than zero.');
      return;
    }

    if (!hasStakedTokens) {
      toast.error('No staked tokens in the selected pool.');
      return;
    }

    if (exceedsStakeBalance) {
      toast.error('Unstake amount exceeds your current stake.');
      return;
    }

    if (!activePool) {
      toast.error('Select a staking pool first.');
      return;
    }

    setActionLoading('unstake');

    try {
      await stakingService.unstake(parsedAmountRaw.toString(), activePool.id);
      toast.success('Unstake transaction submitted.');
      setAmount('');
      await refresh();
      await refreshProgramStatus();
    } catch (actionError) {
      toast.error(getActionErrorMessage(actionError));
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimRewards = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (!activePool) {
      toast.error('Select a staking pool first.');
      return;
    }

    setActionLoading('claim');

    try {
      await stakingService.claimRewards(activePool?.id);
      toast.success('Claim transaction submitted.');
      await refresh();
      await refreshProgramStatus();
    } catch (actionError) {
      toast.error(getActionErrorMessage(actionError));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreatePool = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (!anchorWallet) {
      toast.error('Connect a wallet before creating a staking pool.');
      return;
    }

    if (!isStakeAdmin) {
      toast.error('Only the current staking admin can create a pool.');
      return;
    }

    if (rewardAmountRaw === null || rewardAmountRaw <= 0n) {
      toast.error('Enter a valid reward amount.');
      return;
    }

    if (!Number.isFinite(rewardDurationSeconds) || rewardDurationSeconds <= 0) {
      toast.error('Enter a valid reward duration.');
      return;
    }

    setAdminActionLoading('createPool');

    try {
      const result = await createKedolikStakingPool(connection, anchorWallet, {
        stakeMint: adminForm.stakeMint.trim(),
        rewardMint: adminForm.rewardMint.trim(),
        poolId: adminForm.poolId.trim(),
        rewardAmountRaw: rewardAmountRaw.toString(),
        rewardDurationSeconds: Math.floor(rewardDurationSeconds),
      });

      toast.success(`Staking pool created: ${formatKedolikAddress(result.pool.pool)}`);
      setAdminForm((current) => ({
        ...current,
        rewardAmount: '',
      }));
      await refresh();
      await refreshProgramStatus();
    } catch (adminError) {
      toast.error(getActionErrorMessage(adminError));
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleTransferAdmin = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (!anchorWallet) {
      toast.error('Connect a wallet before transferring admin authority.');
      return;
    }

    if (!isStakeAdmin) {
      toast.error('Only the current staking admin can transfer authority.');
      return;
    }

    setAdminActionLoading('transferAdmin');

    try {
      await transferKedolikStakingAdmin(connection, anchorWallet, newAdminAuthority.trim());
      toast.success('Staking admin transfer submitted.');
      setNewAdminAuthority('');
      const nextAdminConfig = await fetchKedolikStakeLockAdminConfig(connection);
      setAdminConfig(nextAdminConfig);
      await refreshProgramStatus();
    } catch (adminError) {
      toast.error(getActionErrorMessage(adminError));
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleSetRewardRate = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (!anchorWallet) {
      toast.error('Connect a wallet before updating the reward rate.');
      return;
    }

    if (!isStakeAdmin) {
      toast.error('Only the current staking admin can update the reward rate.');
      return;
    }

    if (!activePool) {
      toast.error('Create a staking pool before updating its reward rate.');
      return;
    }

    if (!/^\d+$/.test(rewardRateRaw.trim())) {
      toast.error('Reward rate must be raw token units per second.');
      return;
    }

    setAdminActionLoading('setRewardRate');

    try {
      await setKedolikStakingRewardRate(connection, anchorWallet, activePool.id, rewardRateRaw.trim());
      toast.success('Reward rate update submitted.');
      setRewardRateRaw('');
      await refresh();
      await refreshProgramStatus();
    } catch (adminError) {
      toast.error(getActionErrorMessage(adminError));
    } finally {
      setAdminActionLoading(null);
    }
  };

  return (
    <KedolikPageFrame>
      <div className="mx-auto max-w-6xl">
        <section className="card p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
                  Devnet
                </span>
                {!isLoadingPrograms && (
                  <KedolikProgramStatusBadge
                    live={stakeLockProgramStatus.live}
                    executable={stakeLockProgramStatus.executable}
                  />
                )}
              </div>

              <h1 className="text-3xl font-bold font-heading sm:text-4xl">{activePoolName}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                {KEDOLIK_DEVNET_LIVE_MESSAGES.staking} Stake, unstake, and claim rewards from a
                selected Stake Lock V1 pool.
              </p>
              {activePool && (
                <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
                  <TokenPill token={activeStakeToken} fallback="Stake Token" />
                  <TokenPill token={activeRewardToken} fallback="Reward Token" />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[560px] lg:grid-cols-4">
              <FieldCard label="Wallet Balance" value={stakeWalletBalance} />
              <FieldCard label="Staked" value={userStake} />
              <FieldCard label="Rewards" value={claimableRewards} />
              <FieldCard label="APY" value={poolApy} />
            </div>
          </div>
        </section>

        {!kedolikDevnetEnabled ? (
          <div className="card mt-6 p-8">
            <h2 className="text-2xl font-bold font-heading">Kedolik Staking Disabled</h2>
            <p className="mt-3 text-gray-300">
              The `kedolikDevnetEnabled` feature flag is off, so staking is hidden from the main
              navigation even though the route still exists.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 px-6 py-4 text-sm text-amber-100">
                {error}
              </div>
            )}

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              {isLoading ? (
                <div className="card p-6 text-sm text-gray-300 xl:col-span-2">
                  Loading live pool data...
                </div>
              ) : !activePool ? (
                <div className="card p-6 text-sm text-gray-300 xl:col-span-2">
                  No staking pool instance has been created yet. The connected staking admin can
                  create one below, or the admin can run `setup-devnet-lean-staking.js` once per
                  staking instance.
                </div>
              ) : (
                <>
                  <div className="card p-4 sm:p-5">
                    <div className="mb-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold font-heading text-white">Staking Pools</h2>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300">
                          {quarries.length} live
                        </span>
                      </div>
                      <div className={`grid max-h-[320px] gap-2 overflow-y-auto pr-1 ${hasMultiplePools ? 'md:grid-cols-2' : ''}`}>
                        {quarries.map((pool) => {
                          const selected = activePool?.id === pool.id;
                          const stakeToken = getTokenInfo(pool.stakeTokenMint);
                          const rewardToken = getTokenInfo(pool.rewardTokenMint);
                          const stakeSymbol = stakeToken?.symbol ?? 'Stake Token';
                          const rewardSymbol = rewardToken?.symbol ?? 'Reward Token';
                          const poolName = `${stakeSymbol} -> ${rewardSymbol}`;
                          const poolLabel = formatPoolCardLabel(pool.title);
                          const apy = formatStakingApy(
                            pool.rewardRate,
                            pool.totalStaked,
                            pool.stakeTokenDecimals,
                            pool.rewardTokenDecimals
                          );

                          return (
                            <button
                              key={pool.id}
                              type="button"
                              onClick={() => {
                                setSelectedPoolId(pool.id);
                                setAmount('');
                                setRewardRateRaw('');
                              }}
                              className={`rounded-lg border p-3 text-left transition-colors ${
                                selected
                                  ? 'border-brand-cyan/50 bg-brand-cyan/10'
                                  : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex shrink-0 -space-x-2">
                                    <TokenAvatar token={rewardToken} fallback="RW" className="ring-2 ring-dark-900" />
                                    <TokenAvatar token={stakeToken} fallback="ST" className="ring-2 ring-dark-900" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold leading-snug text-white">{poolName}</div>
                                    <div className="text-[11px] text-gray-400">{poolLabel}</div>
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-gray-300">
                                  {pool.status === 'live' ? 'Live' : 'Pending'}
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                                <span className="min-w-0">Total: {formatMetricAmount(pool.totalStaked, pool.stakeTokenDecimals, '0')}</span>
                                <span className="min-w-0">Reward/s: {formatKedolikTokenAmount(pool.rewardsPerSecondEstimate ?? '0', pool.rewardTokenDecimals)}/s</span>
                                <span className="min-w-0">APY: {apy}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-xl font-bold font-heading text-white">Your Position</h2>
                        <p className="mt-1 text-xs text-gray-400">
                          Selected pool: {activePoolName}
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                        {positionStatusLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <FieldCard label="Wallet Balance" value={stakeWalletBalance} />
                      <FieldCard label="Currently Staked" value={userStake} />
                      <FieldCard label="Claimable Rewards" value={claimableRewards} />
                    </div>

                    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Pool Stats
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <FieldCard
                          label="Total Staked"
                          value={formatMetricAmount(
                            activePool.totalStaked,
                            activePool.stakeTokenDecimals,
                            'Loading...'
                          )}
                        />
                        <FieldCard label="APY" value={poolApy} />
                        <FieldCard label="Reward Rate" value={rewardRate} />
                        <FieldCard label="Rewards / Second" value={rewardsPerSecond} />
                        <FieldCard label="Reward Wallet" value={rewardWalletBalance} />
                      </div>
                    </div>

                    <details className="mt-4 rounded-lg border border-white/10 bg-dark-900/60 p-4">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-gray-200">
                        Token addresses
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <FieldCard label="Stake Token CA" value={formatKedolikAddress(activePool.stakeTokenMint)} />
                        <FieldCard label="Reward Token CA" value={formatKedolikAddress(activePool.rewardTokenMint)} />
                      </div>
                    </details>
                  </div>

                  <aside className="card p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
                    <div>
                      <h2 className="text-xl font-bold font-heading text-white">
                        {amountMode === 'stake' ? 'Stake Tokens' : 'Unstake Tokens'}
                      </h2>
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                          Available
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {amountMode === 'stake' ? stakeWalletBalance : userStake}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-dark-800/80 p-1 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleAmountModeChange('stake')}
                        className={`rounded-md px-4 py-2 transition-all ${
                          amountMode === 'stake'
                            ? 'bg-brand-cyan/20 text-brand-cyan'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Stake
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAmountModeChange('unstake')}
                        className={`rounded-md px-4 py-2 transition-all ${
                          amountMode === 'unstake'
                            ? 'bg-brand-cyan/20 text-brand-cyan'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Unstake
                      </button>
                    </div>

                    <label className="mt-4 block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Amount
                        </span>
                        <button
                          type="button"
                          onClick={handleMax}
                          className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10"
                        >
                          Max
                        </button>
                      </div>
                      <input
                        id="kedolik-staking-amount"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="0.00"
                        className="mt-3 min-h-[52px] w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-gray-500"
                      />
                    </label>

                    {amountMode === 'stake' && stakingRewardsUnavailable && (
                      <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                        This pool is not currently funded for new staking rewards. You can still
                        view the pool, but staking is disabled until rewards are funded and the
                        reward rate is greater than zero.
                      </div>
                    )}

                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() =>
                          void (amountMode === 'stake' ? handleStake() : handleUnstake())
                        }
                        disabled={amountActionDisabled}
                        className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                      >
                        {actionLoading === amountMode
                          ? amountMode === 'stake'
                            ? 'Staking...'
                            : 'Unstaking...'
                          : primaryActionLabel}
                      </button>
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Claimable
                            </div>
                            <div className="mt-1 text-sm font-semibold text-white">{claimableRewards}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleClaimRewards()}
                            disabled={
                              !connected || !activePool.hasMiner || !hasClaimableRewards || actionLoading !== null
                            }
                            className="shrink-0 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading === 'claim' ? 'Claiming...' : 'Claim'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {!connected && (
                      <button
                        type="button"
                        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10"
                        onClick={() => setWalletModalVisible(true)}
                      >
                        Connect Wallet
                      </button>
                    )}

                    {(exceedsSelectedBalance ||
                      (connected && amountMode === 'unstake' && !activePool.hasMiner)) && (
                      <div className="mt-4 rounded-lg border border-white/10 bg-dark-800/70 px-4 py-3 text-sm text-gray-200">
                        {exceedsSelectedBalance
                          ? amountMode === 'stake'
                            ? 'Amount exceeds your wallet balance.'
                            : 'Amount exceeds your current stake.'
                          : 'You have no staked tokens to unstake.'}
                      </div>
                    )}
                  </aside>
                </>
              )}
            </section>

            {connected && isStakeAdmin && (
              <>
            <section className="card mt-6 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-heading text-white">Staking Pool Admin</h2>
                  <p className="mt-2 max-w-2xl text-sm text-gray-300">
                    Admin controls are only available to the wallet stored in the Stake Lock V1
                    admin config account.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                  {isLoadingAdminConfig ? 'Loading admin' : isStakeAdmin ? 'Admin wallet' : 'Read only'}
                </span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <FieldCard
                  label="Admin Config PDA"
                  value={adminConfig?.address ?? KEDOLIK_DEVNET_CONFIG.adminConfigPda}
                />
                <FieldCard
                  label="Current Staking Admin"
                  value={adminConfig?.authority ?? KEDOLIK_DEVNET_CONFIG.currentStakingAdmin}
                />
                <FieldCard
                  label="Connected Wallet"
                  value={connectedWalletAddress ?? 'Connect wallet'}
                />
              </div>

              {connected && isStakeAdmin && (
                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-white">Create Staking Instance</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      The frontend derives the pool, stake vault, and reward vault from the V1 seeds,
                      then sends initializeStakingPool and fundRewards.
                    </p>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <AdminInput
                        label="Stake Token CA"
                        value={adminForm.stakeMint}
                        onChange={(value) => setAdminForm((current) => ({ ...current, stakeMint: value }))}
                        placeholder="Stake mint address"
                      />
                      <AdminInput
                        label="Reward Token CA"
                        value={adminForm.rewardMint}
                        onChange={(value) => setAdminForm((current) => ({ ...current, rewardMint: value }))}
                        placeholder="Reward mint address"
                      />
                      <AdminInput
                        label="Pool ID"
                        value={adminForm.poolId}
                        onChange={(value) => setAdminForm((current) => ({ ...current, poolId: value }))}
                        placeholder="1"
                      />
                      <AdminInput
                        label="Reward Duration Seconds"
                        value={adminForm.rewardDurationSeconds}
                        onChange={(value) =>
                          setAdminForm((current) => ({ ...current, rewardDurationSeconds: value }))
                        }
                        placeholder="2592000"
                      />
                    </div>

                    <label className="mt-3 block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Reward Amount
                      </span>
                      <input
                        value={adminForm.rewardAmount}
                        onChange={(event) =>
                          setAdminForm((current) => ({ ...current, rewardAmount: event.target.value }))
                        }
                        placeholder="0.00"
                        className="mt-3 w-full bg-transparent text-xl font-semibold text-white outline-none placeholder:text-gray-500"
                      />
                    </label>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-dark-900/60 p-4 text-sm text-gray-300">
                      Computed reward rate:{' '}
                      <span className="font-semibold text-white">
                        {computedAdminRewardRate === null
                          ? 'Enter reward mint, amount, and duration'
                          : `${computedAdminRewardRate.toString()} raw units / second`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCreatePool()}
                      disabled={adminActionLoading !== null}
                      className="btn-primary mt-5 w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {adminActionLoading === 'createPool' ? 'Creating Pool...' : 'Create And Fund Pool'}
                    </button>
                  </div>

                  <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-white">Update Reward Rate</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      Sets the selected pool emission rate in raw reward token units per second.
                    </p>
                    <AdminInput
                      label="Reward Rate / Second"
                      value={rewardRateRaw}
                      onChange={setRewardRateRaw}
                      placeholder={activePool?.rewardsPerSecondEstimate ?? '0'}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSetRewardRate()}
                      disabled={!activePool || !rewardRateRaw.trim() || adminActionLoading !== null}
                      className="mt-4 w-full rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-5 py-3 text-sm font-semibold text-brand-cyan transition-colors hover:bg-brand-cyan/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {adminActionLoading === 'setRewardRate' ? 'Updating...' : 'Update Reward Rate'}
                    </button>

                    <div className="my-5 h-px bg-white/10" />

                    <h3 className="text-lg font-bold text-white">Transfer Staking Admin</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      After transfer, only the new authority can create pools or update staking settings.
                    </p>
                    <AdminInput
                      label="New Authority"
                      value={newAdminAuthority}
                      onChange={setNewAdminAuthority}
                      placeholder="New admin wallet"
                    />
                    <button
                      type="button"
                      onClick={() => void handleTransferAdmin()}
                      disabled={!newAdminAuthority.trim() || adminActionLoading !== null}
                      className="mt-4 w-full rounded-full border border-red-400/30 bg-red-400/10 px-5 py-3 text-sm font-semibold text-red-100 transition-colors hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {adminActionLoading === 'transferAdmin' ? 'Transferring...' : 'Transfer Admin'}
                    </button>
                  </aside>
                </div>
              )}

              {connected && !isStakeAdmin && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-dark-900/60 p-5 text-sm text-gray-300">
                  Your connected wallet is not the staking admin, so create/update controls are hidden.
                </div>
              )}

              {!connected && (
                <button
                  type="button"
                  className="mt-6 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10"
                  onClick={() => setWalletModalVisible(true)}
                >
                  Connect Wallet
                </button>
              )}
            </section>

            <details className="card mt-6 p-6">
              <summary className="cursor-pointer list-none text-lg font-semibold text-white">
                Advanced / Deployment Details
              </summary>

              <div className="mt-5 grid gap-3">
                <KedolikInfoRow label="Stake Lock V1 Program" value={KEDOLIK_DEVNET_CONFIG.stakeLockProgramId} />
                <KedolikInfoRow label="ProgramData" value={KEDOLIK_DEVNET_CONFIG.programData} />
                <KedolikInfoRow label="Admin Config PDA" value={KEDOLIK_DEVNET_CONFIG.adminConfigPda} />
                <KedolikInfoRow
                  label="Selected Pool"
                  value={activePool?.quarryAddress ?? 'No staking pool configured yet'}
                />
                <KedolikInfoRow
                  label="Position PDA"
                  value={activePool?.derivedUserMinerAddress ?? 'Connect wallet after pool creation'}
                />
                <KedolikInfoRow
                  label="Last Loaded"
                  value={
                    activePool?.lastCheckpointTs
                      ? formatKedolikUnixTime(activePool.lastCheckpointTs)
                      : 'No pool loaded'
                  }
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <FieldCard
                  label="Fresh Program Deploy Estimate"
                  value={`${KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS.observedDevnetProgramDeploySol} SOL`}
                />
                <FieldCard
                  label="Create Staking Pool Rent"
                  value={`${KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS.createStakingPoolRentOnlySol} SOL`}
                />
                <FieldCard
                  label="User Stake Position Rent"
                  value={`${KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS.userStakePositionRentSol} SOL`}
                />
                <FieldCard
                  label="Create Lock Rent"
                  value={`${KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS.createLockRentOnlySol} SOL`}
                />
              </div>

              <div className="mt-5 space-y-3 text-sm text-gray-300">
                {KEDOLIK_DEVNET_README_NOTES.map((note) => (
                  <p key={note} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                    {note}
                  </p>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => {
                    void refresh();
                    void refreshProgramStatus();
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                >
                  Refresh
                </button>

                <a
                  href={getKedolikExplorerAccountUrl(KEDOLIK_DEVNET_CONFIG.stakeLockProgramId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                >
                  Open Explorer
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h4m0 0v4m0-4l-8 8" />
                  </svg>
                </a>
              </div>
            </details>
              </>
            )}
          </>
        )}
      </div>
    </KedolikPageFrame>
  );
}
