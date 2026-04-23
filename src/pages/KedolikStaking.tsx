import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  KEDOLIK_DEVNET_CONFIG,
  KEDOLIK_DEVNET_LIVE_MESSAGES,
  KEDOLIK_DEVNET_STAKING_LIVE,
  getKedolikExplorerAccountUrl,
} from '../config/kedolikDevnet';
import { KEDOLIK_DEVNET_README_NOTES } from '../features/kedolikDevnetNotes';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useKedolikProgramStatus } from '../hooks/useKedolikProgramStatus';
import { useKedolikStaking } from '../hooks/useKedolikStaking';
import {
  KedolikInfoRow,
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
  <div className="rounded-3xl border border-white/10 bg-dark-900/60 p-5">
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</div>
    <div className="mt-3 text-lg font-semibold text-white break-words">{value}</div>
  </div>
);

export default function KedolikStaking() {
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const { programs, isLoading: isLoadingPrograms, refresh: refreshProgramStatus } = useKedolikProgramStatus();
  const { quarries, isLoading, error, refresh, stakingService } = useKedolikStaking();
  const [amount, setAmount] = useState('');
  const [actionLoading, setActionLoading] = useState<'stake' | 'unstake' | 'claim' | null>(null);

  const activePool = quarries[0] ?? null;
  const stakingProgramStatus = programs.kedolikStaking;
  const mintWrapperProgramStatus = programs.kedolikMintWrapper;

  const rewardRate = useMemo(() => {
    if (!activePool?.rewardRate) {
      return 'Loading live pool data...';
    }

    return `${formatKedolikTokenAmount(activePool.rewardRate, activePool.rewardTokenDecimals)} / year`;
  }, [activePool]);

  const rewardsPerSecond = useMemo(() => {
    if (!activePool?.rewardsPerSecondEstimate) {
      return 'Loading live pool data...';
    }

    return `${formatKedolikTokenAmount(
      activePool.rewardsPerSecondEstimate,
      activePool.rewardTokenDecimals
    )} estimate`;
  }, [activePool]);

  const userStake = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    if (!activePool?.hasMiner) {
      return 'No stake yet';
    }

    return formatMetricAmount(activePool.userStake, activePool.stakeTokenDecimals, 'Loading...');
  }, [activePool, connected]);

  const claimableRewards = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    if (!activePool?.hasMiner) {
      return 'No stake yet';
    }

    return formatMetricAmount(
      activePool.claimableRewards,
      activePool.rewardTokenDecimals,
      'Loading live pool data...'
    );
  }, [activePool, connected]);

  const rewardWalletBalance = useMemo(() => {
    if (!connected) {
      return 'Connect wallet';
    }

    return formatMetricAmount(
      activePool?.userRewardWalletBalance ?? null,
      activePool?.rewardTokenDecimals ?? null,
      'Loading live pool data...'
    );
  }, [activePool, connected]);

  const handleMax = () => {
    if (!activePool) {
      return;
    }

    setAmount(formatInputAmount(activePool.userWalletBalance, activePool.stakeTokenDecimals));
  };

  const parsedAmountRaw =
    activePool !== null ? parseAmountToRaw(amount, activePool.stakeTokenDecimals) : null;
  const walletBalanceRaw = activePool?.userWalletBalance ? BigInt(activePool.userWalletBalance) : null;
  const userStakeRaw = activePool?.userStake ? BigInt(activePool.userStake) : null;
  const claimableRewardsRaw = activePool?.claimableRewards ? BigInt(activePool.claimableRewards) : 0n;
  const hasValidAmount = parsedAmountRaw !== null;
  const exceedsWalletBalance = Boolean(
    connected && parsedAmountRaw !== null && walletBalanceRaw !== null && parsedAmountRaw > walletBalanceRaw
  );
  const exceedsStakeBalance = Boolean(
    connected && parsedAmountRaw !== null && userStakeRaw !== null && parsedAmountRaw > userStakeRaw
  );
  const hasClaimableRewards = claimableRewardsRaw > 0n;

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

    if (exceedsWalletBalance) {
      toast.error('Stake amount exceeds your wallet balance.');
      return;
    }

    setActionLoading('stake');

    try {
      await stakingService.stake(parsedAmountRaw.toString());
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

    if (exceedsStakeBalance) {
      toast.error('Unstake amount exceeds your current stake.');
      return;
    }

    setActionLoading('unstake');

    try {
      await stakingService.unstake(parsedAmountRaw.toString());
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

    setActionLoading('claim');

    try {
      await stakingService.claimRewards();
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
      <div className="mx-auto max-w-5xl">
        <section className="card p-8 sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
                  Devnet
                </span>
                {!isLoadingPrograms && (
                  <KedolikProgramStatusBadge
                    live={stakingProgramStatus.live && mintWrapperProgramStatus.live}
                    executable={stakingProgramStatus.executable && mintWrapperProgramStatus.executable}
                  />
                )}
              </div>

              <h1 className="text-4xl font-bold font-heading sm:text-5xl">Kedolik Staking</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-300 sm:text-lg">
                {KEDOLIK_DEVNET_LIVE_MESSAGES.staking} Stake token, check your balance, enter an
                amount, and use the three actions below.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-dark-900/70 p-5 lg:max-w-xs">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                Wallet
              </div>
              <div className="mt-3 text-lg font-semibold text-white">
                {connected && publicKey ? formatKedolikAddress(publicKey.toString()) : 'Not connected'}
              </div>
              <p className="mt-2 text-sm text-gray-400">
                {connected
                  ? activePool?.hasMiner
                    ? 'Your stake position is loaded.'
                    : 'No stake yet.'
                  : 'Connect wallet to see your balance and stake.'}
              </p>
              {!connected && (
                <button
                  type="button"
                  className="btn-primary mt-4 w-full text-sm"
                  onClick={() => setWalletModalVisible(true)}
                >
                  Connect Wallet
                </button>
              )}
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

            <section className="card mt-6 p-6 sm:p-8">
              {isLoading || !activePool ? (
                <div className="text-sm text-gray-300">
                  {isLoading
                    ? 'Loading live pool data...'
                    : 'Live pool data could not be read from the current RPC endpoint.'}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <FieldCard label="Stake Token" value={formatKedolikAddress(activePool.stakeTokenMint)} />
                    <FieldCard label="Reward Token" value={formatKedolikAddress(activePool.rewardTokenMint)} />
                    <FieldCard
                      label="Total Staked"
                      value={formatMetricAmount(
                        activePool.totalStaked,
                        activePool.stakeTokenDecimals,
                        'Loading live pool data...'
                      )}
                    />
                    <FieldCard label="Stakers" value={activePool.stakers ?? 'Loading live pool data...'} />
                    <FieldCard label="Reward Rate" value={rewardRate} />
                    <FieldCard
                      label="Your Stake Token Balance"
                      value={formatMetricAmount(
                        activePool.userWalletBalance,
                        activePool.stakeTokenDecimals,
                        connected ? 'Loading live pool data...' : 'Connect wallet'
                      )}
                    />
                    <FieldCard label="Your Reward Token Balance" value={rewardWalletBalance} />
                    <FieldCard label="Your Stake" value={userStake} />
                    <FieldCard label="Claimable Rewards" value={claimableRewards} />
                  </div>

                  <div className="mt-6 rounded-[32px] border border-white/10 bg-dark-900/60 p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                      <div className="flex-1">
                        <label
                          className="block text-sm font-semibold text-white"
                          htmlFor="kedolik-staking-amount"
                        >
                          Amount
                        </label>
                        <div className="mt-3 flex gap-3">
                          <input
                            id="kedolik-staking-amount"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0.00"
                            className="min-h-[56px] flex-1 rounded-2xl border border-white/10 bg-dark-800/80 px-4 text-lg text-white outline-none transition-all duration-300 placeholder:text-gray-500 focus:border-brand-cyan/50"
                          />
                          <button
                            type="button"
                            onClick={handleMax}
                            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                          >
                            Max
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-300">
                          <span>
                            Stake token balance:{' '}
                            {formatMetricAmount(
                              activePool.userWalletBalance,
                              activePool.stakeTokenDecimals,
                              connected ? 'Loading...' : 'Connect wallet'
                            )}
                          </span>
                          <span>Reward token balance: {rewardWalletBalance}</span>
                          <span>Your stake: {userStake}</span>
                        </div>
                      </div>

                      {!connected && (
                        <button
                          type="button"
                          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                          onClick={() => setWalletModalVisible(true)}
                        >
                          Connect Wallet
                        </button>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => void handleStake()}
                        disabled={!connected || !hasValidAmount || exceedsWalletBalance || actionLoading !== null}
                        className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === 'stake' ? 'Staking...' : 'Stake'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUnstake()}
                        disabled={
                          !connected ||
                          !hasValidAmount ||
                          !activePool?.hasMiner ||
                          exceedsStakeBalance ||
                          actionLoading !== null
                        }
                        className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === 'unstake' ? 'Unstaking...' : 'Unstake'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClaimRewards()}
                        disabled={
                          !connected || !activePool?.hasMiner || !hasClaimableRewards || actionLoading !== null
                        }
                        className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === 'claim' ? 'Claiming...' : 'Claim Rewards'}
                      </button>
                    </div>

                    {(exceedsWalletBalance ||
                      exceedsStakeBalance ||
                      (connected && !activePool?.hasMiner) ||
                      (connected && activePool?.hasMiner && !hasClaimableRewards)) && (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-dark-800/70 px-4 py-4 text-sm text-gray-200">
                        {exceedsWalletBalance
                          ? 'Amount exceeds your wallet balance.'
                          : exceedsStakeBalance
                            ? 'Amount exceeds your current stake.'
                            : !activePool?.hasMiner
                              ? 'Your first stake will create your staking position automatically.'
                              : 'No rewards to claim yet.'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <details className="card mt-6 p-6">
              <summary className="cursor-pointer list-none text-lg font-semibold text-white">
                Advanced / Debug
              </summary>

              <div className="mt-5 grid gap-3">
                <KedolikInfoRow label="Kedolik Staking Program" value={KEDOLIK_DEVNET_CONFIG.kedolikStakingProgramId} />
                <KedolikInfoRow label="Kedolik Mint Wrapper" value={KEDOLIK_DEVNET_CONFIG.kedolikMintWrapperProgramId} />
                <KedolikInfoRow label="Quarry" value={KEDOLIK_DEVNET_STAKING_LIVE.quarry} />
                <KedolikInfoRow label="Rewarder" value={KEDOLIK_DEVNET_STAKING_LIVE.rewarder} />
                <KedolikInfoRow label="Minter" value={KEDOLIK_DEVNET_STAKING_LIVE.minter} />
                <KedolikInfoRow label="Mint Wrapper" value={KEDOLIK_DEVNET_STAKING_LIVE.mintWrapper} />
                <KedolikInfoRow label="Stake Token Mint" value={KEDOLIK_DEVNET_STAKING_LIVE.stakeTokenMint} />
                <KedolikInfoRow label="Reward Token Mint" value={KEDOLIK_DEVNET_STAKING_LIVE.rewardTokenMint} />
                <KedolikInfoRow
                  label="Derived Miner PDA"
                  value={activePool?.derivedUserMinerAddress ?? 'Connect wallet'}
                />
                <KedolikInfoRow
                  label="Rewards / second"
                  value={rewardsPerSecond}
                />
                <KedolikInfoRow
                  label="Last Checkpoint"
                  value={
                    activePool?.lastCheckpointTs
                      ? formatKedolikUnixTime(activePool.lastCheckpointTs)
                      : 'Loading live pool data...'
                  }
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
                  href={getKedolikExplorerAccountUrl(KEDOLIK_DEVNET_STAKING_LIVE.quarry)}
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
      </div>
    </KedolikPageFrame>
  );
}
