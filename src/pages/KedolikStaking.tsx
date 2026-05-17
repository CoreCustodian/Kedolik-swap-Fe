import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useKedolikProgramStatus } from '../hooks/useKedolikProgramStatus';
import { useKedolikStaking } from '../hooks/useKedolikStaking';
import { useRemoteTokens } from '../hooks/useRemoteTokens';
import type { TokenInfo } from '../config/tokens';
import { KEDOLIK_STAKE_LOCK_V1 } from '../config/kedolikStakeLockV1';
import { KEDOLIK_NO_STAKING_POOL_INSTANCE_MESSAGE } from '../services/kedolikStaking';
import {
  KedolikPageFrame,
  KedolikProgramStatusBadge,
  formatKedolikAddress,
  formatKedolikUnixTime,
  formatKedolikTokenAmount,
} from '../components/kedolik/KedolikShared';

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

const SECONDS_PER_DAY = 24 * 60 * 60;

const formatStakingDuration = (seconds: number | null) => {
  if (seconds === null) {
    return 'Not set';
  }

  if (seconds >= SECONDS_PER_DAY) {
    const days = seconds / SECONDS_PER_DAY;
    const formattedDays = Number.isInteger(days)
      ? days.toLocaleString('en-US')
      : days.toLocaleString('en-US', { maximumFractionDigits: 1 });

    return `${formattedDays} days`;
  }

  if (seconds >= 60 * 60) {
    const hours = Math.ceil(seconds / (60 * 60));
    return `${hours.toLocaleString('en-US')} hours`;
  }

  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes.toLocaleString('en-US')} minutes`;
};

const formatStakingEndsAt = (timestamp: number | null) =>
  timestamp ? formatKedolikUnixTime(timestamp) : 'Not set';

const formatStakingTimeRemaining = (secondsRemaining: number | null, isExpired: boolean) => {
  if (isExpired) {
    return 'Expired';
  }

  if (secondsRemaining === null) {
    return 'Not set';
  }

  if (secondsRemaining >= SECONDS_PER_DAY) {
    const days = Math.ceil(secondsRemaining / SECONDS_PER_DAY);
    return `${days.toLocaleString('en-US')} days left`;
  }

  if (secondsRemaining >= 60 * 60) {
    const hours = Math.ceil(secondsRemaining / (60 * 60));
    return `${hours.toLocaleString('en-US')} hours left`;
  }

  return 'Less than 1 hour';
};

const getLivePoolTiming = (
  stakingEndsAt: number | null | undefined,
  fallbackSecondsRemaining: number | null | undefined,
  fallbackExpired: boolean,
  nowSeconds: number
) => {
  if (stakingEndsAt) {
    return {
      isExpired: nowSeconds >= stakingEndsAt,
      secondsRemaining: Math.max(0, stakingEndsAt - nowSeconds),
    };
  }

  return {
    isExpired: fallbackExpired,
    secondsRemaining: fallbackSecondsRemaining ?? null,
  };
};

const formatPoolCardLabel = (index: number, totalPools: number) =>
  totalPools > 1 ? `Pool ${index + 1} of ${totalPools}` : 'Pool 1';

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
  valueClassName = '',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-3">
    <div className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-500 sm:text-[10px]">
      {label}
    </div>
    <div className={`mt-1.5 min-w-0 text-sm font-semibold text-white break-words ${valueClassName}`}>
      {value}
    </div>
  </div>
);

const ExpiredTag = ({ label = 'Expired' }: { label?: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.12)]">
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-400/20 text-[10px] font-bold text-red-100">
      !
    </span>
    {label}
  </span>
);

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

export default function KedolikStaking() {
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const { programs, isLoading: isLoadingPrograms, refresh: refreshProgramStatus } = useKedolikProgramStatus();
  const { quarries, isLoading, error, refresh, stakingService } = useKedolikStaking();
  const { getTokenByMint } = useRemoteTokens();
  const [amount, setAmount] = useState('');
  const [amountMode, setAmountMode] = useState<'stake' | 'unstake'>('stake');
  const [actionLoading, setActionLoading] = useState<'stake' | 'unstake' | 'claim' | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

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
  const activeStakeSymbol = activeStakeToken?.symbol ?? 'Unknown';
  const activeRewardSymbol = activeRewardToken?.symbol ?? 'Unknown';
  const activePoolName = 'Stake & Earn';
  const activePoolDisplayName = activePool
    ? `${activeStakeSymbol} -> ${activeRewardSymbol}`
    : 'No pool selected';
  const hasMultiplePools = quarries.length > 1;
  const stakeLockProgramStatus = programs.kedolikStakeLock;
  const connectedWalletAddress = publicKey?.toString() ?? null;
  const isStakingAdminWallet = Boolean(
    connectedWalletAddress &&
      (connectedWalletAddress === KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin ||
        quarries.some((pool) => pool.poolCreator === connectedWalletAddress))
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (quarries.length === 0) {
      setSelectedPoolId(null);
      return;
    }

    if (!selectedPoolId || !quarries.some((pool) => pool.id === selectedPoolId)) {
      setSelectedPoolId(quarries[0].id);
    }
  }, [quarries, selectedPoolId]);

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
  const activePoolTiming = getLivePoolTiming(
    activePool?.stakingEndsAt,
    activePool?.stakingSecondsRemaining,
    Boolean(activePool?.isExpired),
    nowSeconds
  );
  const stakingDuration = formatStakingDuration(activePool?.rewardDurationSeconds ?? null);
  const stakingEndsAt = formatStakingEndsAt(activePool?.stakingEndsAt ?? null);
  const stakingTimeRemaining = formatStakingTimeRemaining(
    activePoolTiming.secondsRemaining,
    activePoolTiming.isExpired
  );

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
    activePool && (rewardVaultBalanceRaw === 0n || rewardRatePerSecondRaw === 0n || !activePool.isFullyFunded)
  );
  const stakingDisabledReason = activePoolTiming.isExpired
    ? 'This staking period has expired. Existing users can still unstake and claim available rewards.'
    : stakingRewardsUnavailable
      ? 'This pool is not currently fully funded for new staking rewards. You can still view the pool, but staking is disabled until rewards are funded and the reward rate is greater than zero.'
      : null;
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
    : activePoolTiming.isExpired
      ? 'Expired'
      : hasStakedTokens
      ? 'Staked'
      : activePool?.hasMiner
        ? 'Position open'
        : 'No stake yet';
  const activePoolStatusClass = activePoolTiming.isExpired
    ? 'border-red-400/30 bg-red-400/10 text-red-200'
    : activePool?.status === 'live'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      : activePool?.status === 'awaiting_rewards'
        ? 'border-orange-400/30 bg-orange-400/10 text-orange-200'
      : 'border-white/10 bg-white/5 text-gray-300';
  const amountActionDisabled =
    !connected ||
    !activePool ||
    !hasValidAmount ||
    !hasPositiveAmount ||
    actionLoading !== null ||
    (amountMode === 'stake'
      ? exceedsWalletBalance || Boolean(stakingDisabledReason)
      : !activePool.hasMiner || !hasStakedTokens || exceedsStakeBalance);
  const heroStats = [
    { label: 'Wallet Balance', value: stakeWalletBalance },
    { label: 'Staked', value: userStake },
    { label: 'Rewards', value: claimableRewards },
    { label: 'APY', value: poolApy },
    {
      label: 'Ends',
      value: stakingTimeRemaining,
      valueClassName: activePoolTiming.isExpired ? 'text-red-200' : '',
    },
  ];
  const positionStats = [
    { label: 'Wallet Balance', value: stakeWalletBalance },
    { label: 'Currently Staked', value: userStake },
    { label: 'Claimable Rewards', value: claimableRewards },
  ];
  const poolStats = [
    {
      label: 'Total Staked',
      value: activePool
        ? formatMetricAmount(activePool.totalStaked, activePool.stakeTokenDecimals, 'Loading...')
        : 'Loading...',
    },
    { label: 'APY', value: poolApy },
    { label: 'Reward Rate', value: rewardRate },
    { label: 'Rewards / Second', value: rewardsPerSecond },
    { label: 'Duration', value: stakingDuration },
    {
      label: 'Ends On',
      value: activePoolTiming.isExpired ? `Expired ${stakingEndsAt}` : stakingEndsAt,
      valueClassName: activePoolTiming.isExpired ? 'text-red-200' : '',
    },
    {
      label: 'Pool Creator',
      value: activePool?.poolCreator ? formatKedolikAddress(activePool.poolCreator) : 'Unknown',
    },
    {
      label: 'Reserved Rewards',
      value: activePool
        ? formatMetricAmount(activePool.reservedRewards, activePool.rewardTokenDecimals, 'Loading...')
        : 'Loading...',
    },
    {
      label: 'Reclaimable',
      value: activePool
        ? formatMetricAmount(activePool.reclaimableRewards, activePool.rewardTokenDecimals, '0')
        : 'Loading...',
    },
    {
      label: 'Funding',
      value: activePool?.isFullyFunded ? 'Funded' : 'Not fully funded',
      valueClassName: activePool?.isFullyFunded ? '' : 'text-orange-200',
    },
    { label: 'Reward Wallet', value: rewardWalletBalance },
  ];

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

    if (stakingDisabledReason) {
      toast.error(stakingDisabledReason);
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

  return (
    <KedolikPageFrame>
      <div className="mx-auto max-w-6xl">
        <section className="card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-2xl">
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
                {activePoolTiming.isExpired && (
                  <ExpiredTag />
                )}
              </div>

              <h1 className="text-2xl font-bold font-heading sm:text-4xl">{activePoolName}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                Kedolik Staking is now live. Stake your tokens, unstake anytime, and seamlessly
                claim rewards through the selected Stake V1 pool.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:w-[520px] lg:shrink-0 lg:grid-cols-3">
              {heroStats.map((stat) => (
                <FieldCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  valueClassName={stat.valueClassName}
                />
              ))}
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

            <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              {isLoading ? (
                <div className="card p-6 text-sm text-gray-300 xl:col-span-2">
                  Loading live pool data...
                </div>
              ) : !activePool ? (
                <div className="card p-6 text-sm text-gray-300 xl:col-span-2">
                  {KEDOLIK_NO_STAKING_POOL_INSTANCE_MESSAGE}
                </div>
              ) : (
                <>
                  <div className="card min-w-0 p-4 sm:p-5">
                    <div className="mb-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold font-heading text-white">Staking Pools</h2>
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300">
                          {quarries.length} {quarries.length === 1 ? 'pool' : 'pools'}
                        </span>
                      </div>
                      <div className={`grid max-h-[360px] gap-2 overflow-y-auto pr-1 ${hasMultiplePools ? 'lg:grid-cols-2' : ''}`}>
                        {quarries.map((pool, poolIndex) => {
                          const selected = activePool?.id === pool.id;
                          const stakeToken = getTokenInfo(pool.stakeTokenMint);
                          const rewardToken = getTokenInfo(pool.rewardTokenMint);
                          const stakeSymbol = stakeToken?.symbol ?? 'Unknown';
                          const rewardSymbol = rewardToken?.symbol ?? 'Unknown';
                          const poolName = `${stakeSymbol} -> ${rewardSymbol}`;
                          const poolLabel = formatPoolCardLabel(poolIndex, quarries.length);
                          const poolTiming = getLivePoolTiming(
                            pool.stakingEndsAt,
                            pool.stakingSecondsRemaining,
                            pool.isExpired,
                            nowSeconds
                          );
                          const poolStatusLabel = poolTiming.isExpired
                            ? 'Expired'
                            : pool.status === 'live'
                              ? 'Live'
                              : pool.status === 'awaiting_rewards'
                                ? 'Funding'
                              : 'Pending';
                          const poolStatusClass = poolTiming.isExpired
                            ? 'border-red-400/30 bg-red-400/10 text-red-200'
                            : pool.status === 'live'
                              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                              : pool.status === 'awaiting_rewards'
                                ? 'border-orange-400/30 bg-orange-400/10 text-orange-200'
                              : 'border-white/10 text-gray-300';
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
                              }}
                              className={`rounded-lg border p-3 text-left transition-colors ${
                                selected
                                  ? 'border-brand-cyan/50 bg-brand-cyan/10'
                                  : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                              }`}
                            >
                              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
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
                                {poolTiming.isExpired ? (
                                  <ExpiredTag />
                                ) : (
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${poolStatusClass}`}>
                                    {poolStatusLabel}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`mt-2 grid-cols-1 gap-2 text-[11px] text-gray-400 min-[420px]:grid-cols-2 xl:grid-cols-4 ${
                                  isStakingAdminWallet ? 'grid' : 'hidden md:grid'
                                }`}
                              >
                                <span className="min-w-0 truncate">Total: {formatMetricAmount(pool.totalStaked, pool.stakeTokenDecimals, '0')}</span>
                                <span className="min-w-0 truncate">Reward/s: {formatKedolikTokenAmount(pool.rewardsPerSecondEstimate ?? '0', pool.rewardTokenDecimals)}/s</span>
                                <span className="min-w-0 truncate">APY: {apy}</span>
                                <span className="min-w-0 truncate">Ends: {formatStakingTimeRemaining(poolTiming.secondsRemaining, poolTiming.isExpired)}</span>
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
                          Selected pool: {activePoolDisplayName}
                        </p>
                      </div>
                      {activePoolTiming.isExpired ? (
                        <ExpiredTag />
                      ) : (
                        <span className={`w-fit rounded-full border px-4 py-1 text-xs font-semibold ${activePoolStatusClass}`}>
                          {positionStatusLabel}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {positionStats.map((stat) => (
                        <FieldCard key={stat.label} label={stat.label} value={stat.value} />
                      ))}
                    </div>

                    <div
                      className={`mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4 ${
                        isStakingAdminWallet ? '' : 'hidden md:block'
                      }`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Pool Stats
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {poolStats.map((stat) => (
                          <FieldCard
                            key={stat.label}
                            label={stat.label}
                            value={stat.value}
                            valueClassName={stat.valueClassName}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-white/10 bg-dark-900/60 p-4">
                      <div className="text-sm font-semibold text-gray-200">Token addresses</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <FieldCard label="Stake Mint CA" value={formatKedolikAddress(activePool.stakeTokenMint)} />
                        <FieldCard label="Reward Mint CA" value={formatKedolikAddress(activePool.rewardTokenMint)} />
                        <div className={isStakingAdminWallet ? '' : 'hidden md:block'}>
                          <FieldCard label="Pool Admin PDA" value={formatKedolikAddress(activePool.poolAdminAddress)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="card min-w-0 p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
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

                    {amountMode === 'stake' && stakingDisabledReason && (
                      <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                        activePoolTiming.isExpired
                          ? 'border-red-400/30 bg-red-400/10 text-red-100'
                          : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100'
                      }`}>
                        {stakingDisabledReason}
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
                        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
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
                            className="w-full shrink-0 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 min-[420px]:w-auto"
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

            {/* Admin-only staking controls moved to the Admin page.
              <>
            <section className="card mt-6 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-heading text-white">Staking Pool Admin</h2>
                  <p className="mt-2 max-w-2xl text-sm text-gray-300">
                    Admin controls are available to the Stake Lock V1 admin. Reclaim is available
                    only to the selected pool creator after expiry.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                  {isLoadingAdminConfig ? 'Loading admin' : isStakeAdmin ? 'Admin wallet' : 'Pool creator'}
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
                        label="Stake Mint CA"
                        value={adminForm.stakeMint}
                        onChange={(value) => setAdminForm((current) => ({ ...current, stakeMint: value }))}
                        placeholder="Stake mint address"
                      />
                      <AdminInput
                        label="Reward Mint CA"
                        value={adminForm.rewardMint}
                        onChange={(value) => setAdminForm((current) => ({ ...current, rewardMint: value }))}
                        placeholder="Reward mint address"
                      />
                      <AdminInput
                        label="Pool ID (optional)"
                        value={adminForm.poolId}
                        onChange={(value) => setAdminForm((current) => ({ ...current, poolId: value }))}
                        placeholder="Date.now() if empty"
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
                    <div className="mt-3 rounded-lg border border-white/10 bg-dark-900/60 px-4 py-3 text-sm text-gray-300">
                      Duration preview:{' '}
                      <span className="font-semibold text-white">{adminRewardDurationPreview}</span>
                    </div>

                    {activePoolTiming.isExpired && activePool && (
                      <div className="mt-3 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">Start a new period</div>
                            <p className="mt-1 text-xs text-gray-300">
                              Replay copies the expired pool mints and duration into this form, then uses a fresh Date.now pool ID.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleReplayActivePool}
                            className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-2 text-xs font-semibold text-brand-cyan transition-colors hover:bg-brand-cyan/20"
                          >
                            Replay expired pool
                          </button>
                        </div>
                      </div>
                    )}

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

                    <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-100">
                      Creator reclaim becomes available after staking expiry. The button only
                      withdraws unreserved leftover rewards; user-earned rewards stay reserved.
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-gray-200">
                        Reclaimable:{' '}
                        <span className="font-semibold text-white">
                          {activePool
                            ? formatMetricAmount(activePool.reclaimableRewards, activePool.rewardTokenDecimals, '0')
                            : 'No pool selected'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleReclaimRewards()}
                        disabled={reclaimActionDisabled}
                        className="mt-3 w-full rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {adminActionLoading === 'reclaimRewards' ? 'Reclaiming...' : 'Reclaim Leftover Rewards'}
                      </button>
                    </div>

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
                  <div>Your connected wallet is not the staking admin, so create/update controls are hidden.</div>
                  {isPoolCreator && (
                    <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                      <div className="font-semibold text-white">Creator reclaim</div>
                      <div className="mt-2 text-xs leading-relaxed">
                        Reclaim is available after expiry for unreserved leftover rewards only.
                      </div>
                      <div className="mt-3 text-xs">
                        Reclaimable:{' '}
                        <span className="font-semibold text-white">
                          {activePool
                            ? formatMetricAmount(activePool.reclaimableRewards, activePool.rewardTokenDecimals, '0')
                            : 'No pool selected'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleReclaimRewards()}
                        disabled={reclaimActionDisabled}
                        className="mt-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {adminActionLoading === 'reclaimRewards' ? 'Reclaiming...' : 'Reclaim Leftover Rewards'}
                      </button>
                    </div>
                  )}
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
                  label="Pool Admin PDA"
                  value={activePool?.poolAdminAddress ?? 'No pool admin loaded'}
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
            */}
          </>
        )}
      </div>
    </KedolikPageFrame>
  );
}
