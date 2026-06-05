import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import toast from 'react-hot-toast';
import {
  KEDOLIK_DEVNET_LOCKER_LIVE,
} from '../config/kedolikDevnet';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useKedolikLocker } from '../hooks/useKedolikLocker';
import { useKedolikProgramStatus } from '../hooks/useKedolikProgramStatus';
import { useRemoteTokens } from '../hooks/useRemoteTokens';
import type { TokenInfo } from '../config/tokens';
import { fetchAllLockerEscrows, LockerEscrowSummary } from '../services/kedolikLocker';
import {
  KedolikPageFrame,
  KedolikProgramStatusBadge,
  formatKedolikAddress,
  formatKedolikTokenAmount,
  formatKedolikUnixTime,
} from '../components/kedolik/KedolikShared';

type LockerAction = 'create' | 'lookup' | 'claim' | 'cancel' | 'close' | null;
type LockListSort = 'newest' | 'unlockLatest' | 'unlockSoon' | 'amountHigh' | 'amountLow';
type SimpleLockForm = {
  recipient: string;
  tokenMint: string;
  amount: string;
  unlockAt: string;
  lockId: string;
};

type CreatedLockNotice = {
  escrowAddress: string;
  lockId: string;
  tokenMint: string;
  amount: string;
  unlockAt: number;
} | null;

const LEADERBOARD_PAGE_SIZE = 10;

const DEFAULT_SIMPLE_LOCK_FORM: SimpleLockForm = {
  recipient: '',
  tokenMint: KEDOLIK_DEVNET_LOCKER_LIVE.tokenMint,
  amount: '',
  unlockAt: '',
  lockId: '',
};

const toUnixTimestamp = (value: string) => {
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : 0;
};

const toBigInt = (value: string) => BigInt(value || '0');

const formatDateTimeLocalValue = (timestamp: number) => {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const parseTokenAmountToRaw = (value: string, decimals: number | null) => {
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

const modeAllows = (mode: number, actor: 'creator' | 'recipient') =>
  actor === 'creator' ? (mode & 1) !== 0 : (mode & 2) !== 0;

const isOneTimeLock = (escrow: LockerEscrowSummary) => toBigInt(escrow.amountPerPeriod) === 0n;

const formatLockHolder = (address: string) => formatKedolikAddress(address);

const formatLockDuration = (seconds: number) => {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  const totalDays = Math.floor(normalizedSeconds / 86400);
  const years = Math.floor(totalDays / 365);
  const weeks = Math.floor((totalDays % 365) / 7);
  const days = totalDays % 7;
  const hours = Math.floor((normalizedSeconds % 86400) / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  }

  if (weeks > 0) {
    parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
  }

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }

  if (parts.length > 0) {
    return parts.join(' ');
  }

  if (minutes >= 1) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  return normalizedSeconds > 0 ? 'Less than 1 minute' : 'Expired';
};

const getLockTimingDetails = (escrow: LockerEscrowSummary) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntilUnlock = escrow.cliffTime - nowSeconds;
  const isExpired = secondsUntilUnlock <= 0;
  const hasStoredDuration = escrow.vestingStartTime > 0 && escrow.cliffTime > escrow.vestingStartTime;
  const storedDurationSeconds = hasStoredDuration ? escrow.cliffTime - escrow.vestingStartTime : 0;

  return {
    isExpired,
    durationLabel: hasStoredDuration
      ? formatLockDuration(storedDurationSeconds)
      : isExpired
        ? 'Completed'
        : formatLockDuration(secondsUntilUnlock),
    timeLeftLabel: isExpired ? 'Expired' : `${formatLockDuration(secondsUntilUnlock)} left`,
  };
};

const getLockHeadline = (escrow: LockerEscrowSummary) => {
  if (escrow.isCancelled) {
    return `This lock was cancelled on ${formatKedolikUnixTime(escrow.cancelledAt)}.`;
  }

  if (toBigInt(escrow.claimableAmount) > 0n) {
    return 'Tokens are available to claim now.';
  }

  if (isOneTimeLock(escrow)) {
    return `Token unlock date ${formatKedolikUnixTime(escrow.cliffTime)}.`;
  }

  return `This lock releases over time every ${escrow.frequency} seconds after ${formatKedolikUnixTime(
    escrow.cliffTime
  )}.`;
};

const FieldCard = ({
  label,
  value,
  valueClassName = '',
}: {
  label: string;
  value: ReactNode;
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

const PreviewRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
    <span className="text-sm text-gray-400">{label}</span>
    <div className="min-w-0 max-w-[62%] text-right text-sm font-semibold text-white break-words">{value}</div>
  </div>
);

const FullAddressValue = ({
  address,
  align = 'right',
}: {
  address: string;
  align?: 'left' | 'right';
}) => (
  <div className={`flex min-w-0 flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
    <span
      className={`min-w-0 break-all font-mono text-xs font-semibold text-white ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      title={address}
    >
      {address}
    </span>
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(address)}
      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-brand-cyan transition-colors hover:border-brand-cyan/40 hover:bg-brand-cyan/10"
    >
      Copy
    </button>
  </div>
);

const LockMetric = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'active' | 'expired';
}) => (
  <div
    className={`rounded-xl border px-3 py-2 ${
      tone === 'active'
        ? 'border-emerald-400/20 bg-emerald-400/10'
        : tone === 'expired'
          ? 'border-amber-400/20 bg-amber-400/10'
          : 'border-white/10 bg-dark-900/50'
    }`}
  >
    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</div>
    <div className="mt-1 min-w-0 text-sm font-semibold text-white break-words">{value}</div>
  </div>
);

const TokenIdentity = ({ token, fallback }: { token?: TokenInfo; fallback: string }) => {
  const symbol = token?.symbol ?? fallback;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {token?.logoURI ? (
        <img
          src={token.logoURI}
          alt={symbol}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
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
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white ${
          token?.logoURI ? 'hidden' : ''
        }`}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{symbol}</div>
        <div className="truncate text-xs text-gray-400">{token?.name ?? 'Unknown token'}</div>
      </div>
    </div>
  );
};

const getTokenDisplayName = (token?: TokenInfo, mintAddress?: string | null) =>
  token?.symbol?.trim() ||
  token?.name?.trim() ||
  (mintAddress ? formatKedolikAddress(mintAddress) : 'Unknown');

const TokenAmountDisplay = ({
  rawAmount,
  decimals,
  token,
  mintAddress,
  size = 'sm',
}: {
  rawAmount: string;
  decimals: number | null;
  token?: TokenInfo;
  mintAddress?: string | null;
  size?: 'sm' | 'lg';
}) => {
  const symbol = getTokenDisplayName(token, mintAddress);
  const iconClassName = size === 'lg' ? 'h-7 w-7 text-[10px]' : 'h-5 w-5 text-[8px]';

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2 align-middle">
      <span>{formatKedolikTokenAmount(rawAmount, decimals)}</span>
      {token?.logoURI ? (
        <img
          src={token.logoURI}
          alt={symbol}
          className={`${iconClassName} shrink-0 rounded-full object-cover`}
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'inline-flex';
            }
          }}
        />
      ) : null}
      <span
        className={`${iconClassName} ${
          token?.logoURI ? 'hidden' : 'inline-flex'
        } shrink-0 items-center justify-center rounded-full bg-gradient-brand font-bold text-white`}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
      <span>{symbol}</span>
    </span>
  );
};

const getLockProgressPercent = (escrow: LockerEscrowSummary) => {
  const total = toBigInt(escrow.scheduledTotalAmount);

  if (total <= 0n) {
    return 0;
  }

  const unlocked = toBigInt(escrow.unlockedAmount);
  const basisPoints = (unlocked * 10000n) / total;
  return Math.min(100, Number(basisPoints) / 100);
};

const scaleLockAmountForSort = (escrow: LockerEscrowSummary) => {
  const decimals = escrow.tokenDecimals ?? 0;
  return {
    amount: toBigInt(escrow.scheduledTotalAmount),
    decimals,
  };
};

const compareLockAmount = (
  left: LockerEscrowSummary,
  right: LockerEscrowSummary,
  direction: 'asc' | 'desc'
) => {
  const leftAmount = scaleLockAmountForSort(left);
  const rightAmount = scaleLockAmountForSort(right);
  const maxDecimals = Math.max(leftAmount.decimals, rightAmount.decimals);
  const leftScaled = leftAmount.amount * 10n ** BigInt(maxDecimals - leftAmount.decimals);
  const rightScaled = rightAmount.amount * 10n ** BigInt(maxDecimals - rightAmount.decimals);

  if (leftScaled === rightScaled) {
    return right.vestingStartTime - left.vestingStartTime;
  }

  if (direction === 'desc') {
    return leftScaled > rightScaled ? -1 : 1;
  }

  return leftScaled > rightScaled ? 1 : -1;
};

const getLockStatusLabel = (escrow: LockerEscrowSummary) => {
  if (escrow.isCancelled) {
    return 'Cancelled';
  }

  if (toBigInt(escrow.claimableAmount) > 0n) {
    return 'Claimable';
  }

  return 'Locked';
};

const getLockStatusClass = (escrow: LockerEscrowSummary) => {
  if (escrow.isCancelled) {
    return 'border-red-400/30 bg-red-400/10 text-red-200';
  }

  if (toBigInt(escrow.claimableAmount) > 0n) {
    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  }

  return 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan';
};

const LockListItem = ({
  escrow,
  index,
  token,
}: {
  escrow: LockerEscrowSummary;
  index: number;
  token?: TokenInfo;
}) => {
  const timing = getLockTimingDetails(escrow);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition-colors hover:border-brand-cyan/25">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dark-900/80 text-sm font-bold text-white">
          #{index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <TokenIdentity token={token} fallback={formatKedolikAddress(escrow.tokenMint)} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getLockStatusClass(escrow)}`}>
                  {getLockStatusLabel(escrow)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    timing.isExpired
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                  }`}
                >
                  {timing.timeLeftLabel}
                </span>
              </div>
            </div>

            <div className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-3 md:min-w-[520px]">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Amount</div>
                <div className="mt-0.5 min-w-0 font-semibold text-white">
                  <TokenAmountDisplay
                    rawAmount={escrow.scheduledTotalAmount}
                    decimals={escrow.tokenDecimals}
                    token={token}
                    mintAddress={escrow.tokenMint}
                  />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Duration</div>
                <div className="mt-0.5 font-semibold text-white">{timing.durationLabel}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Unlock Date</div>
                <div className="mt-0.5 font-semibold text-white">{formatKedolikUnixTime(escrow.cliffTime)}</div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-gray-300 transition-colors hover:border-brand-cyan/30 hover:text-brand-cyan"
          aria-label={isExpanded ? 'Hide lock details' : 'Show lock details'}
          aria-expanded={isExpanded}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
          >
            <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <LockMetric
              label="Time Left"
              value={timing.timeLeftLabel}
              tone={timing.isExpired ? 'expired' : 'active'}
            />
            <LockMetric label="Unlocked" value={`${getLockProgressPercent(escrow).toFixed(0)}%`} />
            <LockMetric label="Token CA" value={<FullAddressValue address={escrow.tokenMint} align="left" />} />
            <LockMetric label="Escrow" value={<FullAddressValue address={escrow.address} align="left" />} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-dark-900/45 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">From Wallet</div>
              <div className="mt-2">
                <FullAddressValue address={escrow.creator} align="left" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-dark-900/45 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Lock Owner</div>
              <div className="mt-2">
                <FullAddressValue address={escrow.recipient} align="left" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ClaimableLockCard = ({
  escrow,
  token,
  onSelect,
  onClaim,
  disabled,
  isClaiming,
}: {
  escrow: LockerEscrowSummary;
  token?: TokenInfo;
  onSelect: () => void;
  onClaim: () => void;
  disabled: boolean;
  isClaiming: boolean;
}) => (
  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          Claimable
        </div>
        <div className="mt-2 text-2xl font-bold text-white">
          <TokenAmountDisplay
            rawAmount={escrow.claimableAmount}
            decimals={escrow.tokenDecimals}
            token={token}
            mintAddress={escrow.tokenMint}
          />
        </div>
        <div className="mt-3">
          <TokenIdentity token={token} fallback={formatKedolikAddress(escrow.tokenMint)} />
        </div>
      </div>
      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
        Ready
      </span>
    </div>

    <div className="mt-4 grid gap-2 text-sm">
      <PreviewRow
        label="Locked"
        value={`${formatKedolikTokenAmount(
          escrow.scheduledTotalAmount,
          escrow.tokenDecimals
        )} ${getTokenDisplayName(token, escrow.tokenMint)}`}
      />
      <PreviewRow label="From" value={formatLockHolder(escrow.creator)} />
      <PreviewRow label="Unlock" value={formatKedolikUnixTime(escrow.cliffTime)} />
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onSelect}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10"
      >
        View
      </button>
      <button
        type="button"
        onClick={onClaim}
        disabled={disabled}
        className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-bold text-dark-900 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isClaiming ? 'Claiming...' : 'Claim'}
      </button>
    </div>
  </div>
);

export default function KedolikLocker() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const { programs, isLoading: isLoadingPrograms, refresh: refreshPrograms } = useKedolikProgramStatus();
  const { getTokenByMint } = useRemoteTokens();
  const {
    escrows,
    isLoadingEscrows,
    escrowsError,
    refreshEscrows,
    lookupEscrow,
    create,
    claim,
    cancel,
    close,
    getActionErrorMessage,
  } = useKedolikLocker({ enabled: programs.kedolikLocker.live });

  const [selectedEscrowAddress, setSelectedEscrowAddress] = useState<string | null>(null);
  const [selectedEscrow, setSelectedEscrow] = useState<LockerEscrowSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<LockerAction>(null);
  const [simpleLockForm, setSimpleLockForm] = useState(DEFAULT_SIMPLE_LOCK_FORM);
  const [simpleLockMintDecimals, setSimpleLockMintDecimals] = useState<number | null>(null);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [createdLockNotice, setCreatedLockNotice] = useState<CreatedLockNotice>(null);
  const [recentEscrows, setRecentEscrows] = useState<LockerEscrowSummary[]>([]);
  const [isLoadingRecentEscrows, setIsLoadingRecentEscrows] = useState(false);
  const [recentEscrowsError, setRecentEscrowsError] = useState<string | null>(null);
  const [lockListSort, setLockListSort] = useState<LockListSort>('newest');
  const [leaderboardPage, setLeaderboardPage] = useState(1);

  const lockerProgramStatus = programs.kedolikLocker;
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
  const connectedWalletAddress = publicKey?.toString() ?? null;
  const sampleEscrowAddress = KEDOLIK_DEVNET_LOCKER_LIVE.escrow || null;
  const preferredEscrowAddress =
    connected && escrows.length > 0
      ? escrows[0].address
      : recentEscrows[0]?.address ?? sampleEscrowAddress;
  const walletMatchCount = recentEscrows.filter(
    (escrow) => escrow.creator === connectedWalletAddress || escrow.recipient === connectedWalletAddress
  ).length;
  const walletClaimableEscrows = recentEscrows.filter(
    (escrow) => escrow.recipient === connectedWalletAddress && toBigInt(escrow.claimableAmount) > 0n
  );
  const claimableLockCount = walletClaimableEscrows.length;
  const lockerHeroStats = [
    { label: 'Recent Locks', value: recentEscrows.length.toLocaleString('en-US') },
    { label: 'Your Claimable', value: claimableLockCount.toLocaleString('en-US'), valueClassName: 'text-emerald-300' },
    {
      label: 'Wallet',
      value: connected && publicKey ? formatKedolikAddress(publicKey.toString()) : 'Not connected',
      valueClassName: 'font-mono',
    },
  ];
  const sortedRecentEscrows = [...recentEscrows].sort((left, right) => {
    switch (lockListSort) {
      case 'unlockLatest':
        return right.cliffTime - left.cliffTime;
      case 'unlockSoon':
        return left.cliffTime - right.cliffTime;
      case 'amountHigh':
        return compareLockAmount(left, right, 'desc');
      case 'amountLow':
        return compareLockAmount(left, right, 'asc');
      case 'newest':
      default:
        return right.vestingStartTime - left.vestingStartTime;
    }
  });
  const leaderboardTotalPages = Math.max(1, Math.ceil(sortedRecentEscrows.length / LEADERBOARD_PAGE_SIZE));
  const currentLeaderboardPage = Math.min(leaderboardPage, leaderboardTotalPages);
  const leaderboardStartIndex = (currentLeaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
  const paginatedRecentEscrows = sortedRecentEscrows.slice(
    leaderboardStartIndex,
    leaderboardStartIndex + LEADERBOARD_PAGE_SIZE
  );

  useEffect(() => {
    setSelectedEscrowAddress(null);
    setSelectedEscrow(null);
    setHasManualSelection(false);
  }, [connectedWalletAddress]);

  useEffect(() => {
    setSimpleLockForm({
      recipient: connectedWalletAddress ?? '',
      tokenMint: KEDOLIK_DEVNET_LOCKER_LIVE.tokenMint,
      amount: '',
      unlockAt: '',
      lockId: '',
    });
  }, [connectedWalletAddress]);

  useEffect(() => {
    if (!lockerProgramStatus.live || hasManualSelection) {
      return;
    }

    setSelectedEscrowAddress(preferredEscrowAddress);
  }, [hasManualSelection, lockerProgramStatus.live, preferredEscrowAddress]);

  useEffect(() => {
    if (!lockerProgramStatus.live || !selectedEscrowAddress) {
      return;
    }

    let cancelled = false;

    const loadSelectedEscrow = async () => {
      setActionLoading((current) => current ?? 'lookup');

      try {
        const escrow = await lookupEscrow(selectedEscrowAddress);
        if (!cancelled) {
          setSelectedEscrow(escrow);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedEscrow(null);
          toast.error(getActionErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setActionLoading((current) => (current === 'lookup' ? null : current));
        }
      }
    };

    void loadSelectedEscrow();

    return () => {
      cancelled = true;
    };
  }, [getActionErrorMessage, lockerProgramStatus.live, lookupEscrow, selectedEscrowAddress]);

  const refreshRecentEscrows = async () => {
    if (!lockerProgramStatus.live) {
      setRecentEscrows([]);
      setRecentEscrowsError(null);
      return;
    }

    setIsLoadingRecentEscrows(true);
    setRecentEscrowsError(null);

    try {
      const nextEscrows = await fetchAllLockerEscrows(connection);
      setRecentEscrows(nextEscrows);
    } catch (error) {
      setRecentEscrows([]);
      setRecentEscrowsError(getActionErrorMessage(error));
    } finally {
      setIsLoadingRecentEscrows(false);
    }
  };

  useEffect(() => {
    void refreshRecentEscrows();
  }, [connection, lockerProgramStatus.live]);

  useEffect(() => {
    setLeaderboardPage(1);
  }, [lockListSort, recentEscrows.length]);

  useEffect(() => {
    let cancelled = false;

    const loadMintDecimals = async () => {
      const tokenMint = simpleLockForm.tokenMint.trim();
      if (!tokenMint) {
        setSimpleLockMintDecimals(null);
        return;
      }

      try {
        const mintInfo = await getMint(connection, new PublicKey(tokenMint), 'confirmed');
        if (!cancelled) {
          setSimpleLockMintDecimals(mintInfo.decimals);
        }
      } catch {
        if (!cancelled) {
          setSimpleLockMintDecimals(null);
        }
      }
    };

    void loadMintDecimals();

    return () => {
      cancelled = true;
    };
  }, [connection, simpleLockForm.tokenMint]);

  const selectedEscrowLabel = useMemo(() => {
    if (!selectedEscrow) {
      return 'Loading Lock';
    }

    if (selectedEscrow.walletMatchesCreator || selectedEscrow.walletMatchesRecipient) {
      return 'Wallet Match';
    }

    if (sampleEscrowAddress && selectedEscrow.address === sampleEscrowAddress) {
      return 'Sample Lock';
    }

    return 'Loaded Lock';
  }, [sampleEscrowAddress, selectedEscrow]);

  const noWalletEscrowMessage =
    connected && escrows.length === 0 ? 'No lock found for this wallet yet.' : null;

  const showingSampleEscrowForViewer = Boolean(
    selectedEscrow &&
      sampleEscrowAddress &&
      selectedEscrow.address === sampleEscrowAddress &&
      !selectedEscrow.walletMatchesCreator &&
      !selectedEscrow.walletMatchesRecipient
  );

  const canClaim = Boolean(
    connected &&
      selectedEscrow &&
      selectedEscrow.walletMatchesRecipient &&
      toBigInt(selectedEscrow.claimableAmount) > 0n
  );

  const canCancel = Boolean(
    connected &&
      selectedEscrow &&
      !selectedEscrow.isCancelled &&
      ((selectedEscrow.walletMatchesCreator && modeAllows(selectedEscrow.cancelMode, 'creator')) ||
        (selectedEscrow.walletMatchesRecipient &&
          modeAllows(selectedEscrow.cancelMode, 'recipient')))
  );

  const canClose = Boolean(
    connected &&
      selectedEscrow &&
      selectedEscrow.walletMatchesCreator &&
      !selectedEscrow.isCancelled &&
      toBigInt(selectedEscrow.lockedAmount) === 0n &&
      toBigInt(selectedEscrow.claimableAmount) === 0n
  );

  const simpleLockAmountRaw = parseTokenAmountToRaw(simpleLockForm.amount, simpleLockMintDecimals);
  const canCreateSimpleLock = Boolean(
    connectedWalletAddress &&
      simpleLockForm.tokenMint.trim() &&
      simpleLockForm.unlockAt &&
      simpleLockAmountRaw !== null &&
      simpleLockAmountRaw > 0n
  );

  const createLockToken = getTokenInfo(simpleLockForm.tokenMint.trim());
  const selectedLockToken = getTokenInfo(selectedEscrow?.tokenMint);
  const selectedLockHeadline = selectedEscrow ? getLockHeadline(selectedEscrow) : '';
  const selectedLockTiming = selectedEscrow ? getLockTimingDetails(selectedEscrow) : null;
  const minimumUnlockAt = useMemo(() => formatDateTimeLocalValue(Date.now() + 5 * 60 * 1000), []);
  const unlockPreviewLabel = simpleLockForm.unlockAt
    ? formatKedolikUnixTime(toUnixTimestamp(simpleLockForm.unlockAt))
    : 'Please specify an unlock date to generate the preview.';

  const connectWalletIfNeeded = () => {
    if (!connected) {
      setWalletModalVisible(true);
      return true;
    }

    return false;
  };

  const handleSelectEscrow = (address: string, manual: boolean = true) => {
    setHasManualSelection(manual);
    setSelectedEscrowAddress(address);
  };

  const handleCreateSimpleLock = async () => {
    if (connectWalletIfNeeded()) {
      return;
    }

    if (!connectedWalletAddress) {
      toast.error('Connect your wallet before creating a lock.');
      return;
    }

    if (!simpleLockForm.tokenMint.trim()) {
      toast.error('Token CA is required to create a lock.');
      return;
    }

    if (simpleLockAmountRaw === null || simpleLockAmountRaw <= 0n) {
      toast.error('Enter a valid lock amount.');
      return;
    }

    const unlockTime = toUnixTimestamp(simpleLockForm.unlockAt);
    if (!unlockTime) {
      toast.error('Set a valid unlock date and time.');
      return;
    }

    if (unlockTime <= Math.floor(Date.now() / 1000)) {
      toast.error('Unlock date must be in the future.');
      return;
    }

    setActionLoading('create');

    try {
      const result = await create({
        recipient: connectedWalletAddress,
        tokenMint: simpleLockForm.tokenMint.trim(),
        lockId: simpleLockForm.lockId.trim() || undefined,
        vestingStartTime: unlockTime,
        cliffTime: unlockTime,
        frequency: 1,
        cliffUnlockAmount: simpleLockAmountRaw.toString(),
        amountPerPeriod: '0',
        numberOfPeriod: 1,
        updateRecipientMode: 0,
        cancelMode: 0,
      });

      toast.success('Lock created.');
      setCreatedLockNotice({
        escrowAddress: result.escrowAddress,
        lockId: result.baseAddress,
        tokenMint: simpleLockForm.tokenMint.trim(),
        amount: simpleLockForm.amount,
        unlockAt: unlockTime,
      });
      setSimpleLockForm({
        recipient: connectedWalletAddress ?? '',
        tokenMint: simpleLockForm.tokenMint.trim(),
        amount: '',
        unlockAt: '',
        lockId: '',
      });
      await Promise.all([refreshEscrows(), refreshPrograms(), refreshRecentEscrows()]);
      handleSelectEscrow(result.escrowAddress);
    } catch (error) {
      toast.error(getActionErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  };

  const runLockerAction = async (
    action: Exclude<LockerAction, 'create' | 'lookup' | null>,
    callback: () => Promise<string>,
    successMessage: string,
    clearSelectionAfterSuccess: boolean = false
  ) => {
    if (!selectedEscrow) {
      toast.error('No lock is loaded.');
      return;
    }

    if (connectWalletIfNeeded()) {
      return;
    }

    setActionLoading(action);

    try {
      await callback();
      toast.success(successMessage);
      await Promise.all([refreshEscrows(), refreshPrograms(), refreshRecentEscrows()]);

      if (clearSelectionAfterSuccess) {
        setSelectedEscrow(null);
      } else {
        handleSelectEscrow(selectedEscrow.address, true);
      }
    } catch (error) {
      toast.error(getActionErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimWalletEscrow = async (escrow: LockerEscrowSummary) => {
    if (connectWalletIfNeeded()) {
      return;
    }

    setSelectedEscrow(escrow);
    handleSelectEscrow(escrow.address, true);
    setActionLoading('claim');

    try {
      await claim(escrow.address);
      toast.success('Claim transaction submitted.');
      await Promise.all([refreshEscrows(), refreshPrograms(), refreshRecentEscrows()]);
      handleSelectEscrow(escrow.address, true);
    } catch (error) {
      toast.error(getActionErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <KedolikPageFrame>
      <div className="mx-auto max-w-6xl">
        <section className="card p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
                  Mainnet
                </span>
                {!isLoadingPrograms && (
                  <KedolikProgramStatusBadge
                    live={lockerProgramStatus.live}
                    executable={lockerProgramStatus.executable}
                  />
                )}
              </div>

              <h1 className="text-3xl font-bold font-heading sm:text-4xl">Kedolik Locker</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                Kedolik Locker is now live. You can view locked assets, check what is available for
                claiming, and explore the actions permitted for the selected lock.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[500px] lg:shrink-0">
              {lockerHeroStats.map((stat) => (
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
            <h2 className="text-2xl font-bold font-heading">Kedolik Locker Disabled</h2>
            <p className="mt-3 text-gray-300">
              The Kedolik mainnet feature flag is off, so locker is hidden from the main
              navigation even though the route still exists.
            </p>
          </div>
        ) : (
          <>
            {escrowsError && (
              <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 px-6 py-4 text-sm text-amber-100">
                {escrowsError}
              </div>
            )}

            {noWalletEscrowMessage && (
              <div className="mt-6 rounded-3xl border border-white/10 bg-dark-900/60 px-6 py-4 text-sm text-gray-300">
                {noWalletEscrowMessage} Recent locks are still listed below.
              </div>
            )}

            {!connected && (
              <section className="mt-6 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/10 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">Connect wallet</div>
                    <p className="mt-1 max-w-2xl text-sm text-gray-300">
                      Connect your wallet to create locks, claim unlocked tokens, and see wallet-specific lock actions.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-5 py-3 text-sm font-semibold text-brand-cyan transition-colors hover:bg-brand-cyan/20 sm:w-auto"
                    onClick={() => setWalletModalVisible(true)}
                  >
                    Connect Wallet
                  </button>
                </div>
              </section>
            )}

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="card p-6 sm:p-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold font-heading text-white">Create Lock</h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-300">
                      Specify the token CA, the amount of tokens to lock, and the desired unlock
                      date and time. The connected wallet will be the lock owner automatically.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold text-brand-cyan">
                    Single lock
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Token CA
                    </div>
                    <input
                      value={simpleLockForm.tokenMint}
                      onChange={(event) =>
                        setSimpleLockForm((current) => ({ ...current, tokenMint: event.target.value }))
                      }
                      placeholder="Token contract address"
                      className="mt-3 w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    {simpleLockForm.tokenMint.trim() && (
                      <div className="mt-4 rounded-xl border border-white/10 bg-dark-900/60 p-3">
                        <TokenIdentity
                          token={createLockToken}
                          fallback={formatKedolikAddress(simpleLockForm.tokenMint.trim())}
                        />
                      </div>
                    )}
                  </label>

                  <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Amount To Lock
                    </div>
                    <input
                      value={simpleLockForm.amount}
                      onChange={(event) =>
                        setSimpleLockForm((current) => ({ ...current, amount: event.target.value }))
                      }
                      placeholder="0.00"
                      className="mt-3 w-full bg-transparent text-xl font-semibold text-white outline-none placeholder:text-gray-500"
                    />
                  </label>

                  <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Unlock Date
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Select the token release date for the connected wallet.
                    </div>
                    <input
                      type="datetime-local"
                      value={simpleLockForm.unlockAt}
                      min={minimumUnlockAt}
                      step={60}
                      onChange={(event) =>
                        setSimpleLockForm((current) => ({ ...current, unlockAt: event.target.value }))
                      }
                      className="mt-3 min-h-[42px] w-full rounded-xl border border-white/10 bg-dark-800/85 px-3 text-sm text-white outline-none [color-scheme:dark]"
                    />
                  </label>

                  <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors focus-within:border-brand-cyan/50">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Lock ID
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Optional. Leave blank to generate one automatically.
                    </div>
                    <input
                      value={simpleLockForm.lockId}
                      onChange={(event) =>
                        setSimpleLockForm((current) => ({ ...current, lockId: event.target.value }))
                      }
                      inputMode="numeric"
                      placeholder="Generated automatically"
                      className="mt-3 w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-gray-500"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => void handleCreateSimpleLock()}
                    disabled={!canCreateSimpleLock || actionLoading !== null}
                    className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {actionLoading === 'create' ? 'Creating Lock...' : 'Create Lock'}
                  </button>
                  {!connected && (
                    <button
                      type="button"
                      className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10"
                      onClick={() => setWalletModalVisible(true)}
                    >
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>

              <aside className="card p-6 sm:p-8 xl:sticky xl:top-24 xl:self-start">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-bold font-heading text-white">Unlock Preview</h2>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      canCreateSimpleLock
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/10 bg-white/5 text-gray-300'
                    }`}
                  >
                    {canCreateSimpleLock ? 'Ready' : 'Draft'}
                  </span>
                </div>

                <div className="mt-5">
                  <PreviewRow label="Amount" value={simpleLockForm.amount || '0.00'} />
                  <PreviewRow
                    label="Lock Owner"
                    value={
                      connectedWalletAddress
                        ? formatLockHolder(connectedWalletAddress)
                        : 'Connect wallet'
                    }
                  />
                  <PreviewRow
                    label="Token CA"
                    value={
                      simpleLockForm.tokenMint.trim()
                        ? formatKedolikAddress(simpleLockForm.tokenMint.trim())
                        : 'Not set'
                    }
                  />
                  <PreviewRow label="Unlock" value={unlockPreviewLabel} />
                  <PreviewRow
                    label="Lock ID"
                    value={simpleLockForm.lockId.trim() ? simpleLockForm.lockId.trim() : 'Auto generated'}
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/10 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
                    Claim Window
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-gray-200">
                    Kedolik Locker creates a single on-chain lock based on the specified
                    configuration. Once the unlock time is reached, the connected wallet can claim
                    the released tokens.
                  </div>
                </div>
              </aside>
            </section>

            {createdLockNotice && (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-4 backdrop-blur-sm sm:items-center">
                <div className="w-full max-w-md rounded-2xl border border-emerald-400/25 bg-dark-900 p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                        Lock Created
                      </div>
                      <h2 className="mt-1 text-xl font-bold font-heading text-white">
                        The lock has been created.
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatedLockNotice(null)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-white transition-colors hover:bg-white/10"
                      aria-label="Close lock created popup"
                    >
                      x
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <FieldCard label="Amount" value={createdLockNotice.amount || '0.00'} />
                    <FieldCard label="Lock ID" value={createdLockNotice.lockId} />
                    <FieldCard label="Token CA" value={formatKedolikAddress(createdLockNotice.tokenMint)} />
                    <FieldCard label="Unlock Date" value={formatKedolikUnixTime(createdLockNotice.unlockAt)} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setCreatedLockNotice(null)}
                    className="btn-primary mt-5 w-full text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {connected && (
              <section className="card mt-6 p-6 sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold font-heading text-white">Your Claimable Locks</h2>
                    <p className="mt-2 text-sm text-gray-300">
                      Please select one of your claimable locks from the list below.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-semibold text-emerald-200">
                    {walletClaimableEscrows.length} claimable
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {walletClaimableEscrows.length > 0 ? (
                    walletClaimableEscrows.map((escrow) => (
                      <ClaimableLockCard
                        key={escrow.address}
                        escrow={escrow}
                        token={getTokenInfo(escrow.tokenMint)}
                        onSelect={() => handleSelectEscrow(escrow.address)}
                        onClaim={() => void handleClaimWalletEscrow(escrow)}
                        disabled={actionLoading !== null}
                        isClaiming={actionLoading === 'claim' && selectedEscrow?.address === escrow.address}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-300 md:col-span-2 xl:col-span-3">
                      No claimable locks are available for this wallet yet.
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="card mt-6 p-6 sm:p-8">
              {isLoadingPrograms || (isLoadingEscrows && !selectedEscrow) ? (
                <div className="text-sm text-gray-300">Loading live lock data...</div>
              ) : !selectedEscrow ? (
                <div className="text-sm text-gray-300">
                  No lock records are currently associated with the connected wallet address at this time.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                          {selectedEscrowLabel}
                        </span>
                        <span className={`rounded-full border px-4 py-1 text-xs font-semibold ${getLockStatusClass(selectedEscrow)}`}>
                          {getLockStatusLabel(selectedEscrow)}
                        </span>
                      </div>
                      <h2 className="mt-4 text-3xl font-bold font-heading text-white">Selected Lock</h2>
                      <div className="mt-4 max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <TokenIdentity
                          token={selectedLockToken}
                          fallback={formatKedolikAddress(selectedEscrow.tokenMint)}
                        />
                      </div>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
                        {selectedLockHeadline}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-gray-300">
                      {showingSampleEscrowForViewer
                        ? 'Sample lock loaded. This lock belongs to another wallet.'
                        : 'Live on Mainnet'}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                            Total Locked
                          </div>
                          <div className="mt-2 text-3xl font-bold text-white">
                            <TokenAmountDisplay
                              rawAmount={selectedEscrow.scheduledTotalAmount}
                              decimals={selectedEscrow.tokenDecimals}
                              token={selectedLockToken}
                              mintAddress={selectedEscrow.tokenMint}
                              size="lg"
                            />
                          </div>
                        </div>
                        <div className="text-sm text-gray-300">
                          {getLockProgressPercent(selectedEscrow).toFixed(0)}% unlocked
                        </div>
                      </div>

                      <div className="mt-5 h-3 overflow-hidden rounded-full bg-dark-900">
                        <div
                          className="h-full rounded-full bg-gradient-brand"
                          style={{ width: `${getLockProgressPercent(selectedEscrow)}%` }}
                        />
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <FieldCard
                          label="Still Locked"
                          value={
                            <TokenAmountDisplay
                              rawAmount={selectedEscrow.lockedAmount}
                              decimals={selectedEscrow.tokenDecimals}
                              token={selectedLockToken}
                              mintAddress={selectedEscrow.tokenMint}
                            />
                          }
                        />
                        <FieldCard
                          label="Claimable"
                          value={
                            <TokenAmountDisplay
                              rawAmount={selectedEscrow.claimableAmount}
                              decimals={selectedEscrow.tokenDecimals}
                              token={selectedLockToken}
                              mintAddress={selectedEscrow.tokenMint}
                            />
                          }
                        />
                        <FieldCard
                          label="Time Left"
                          value={selectedLockTiming?.timeLeftLabel ?? 'Unknown'}
                          valueClassName={selectedLockTiming?.isExpired ? 'text-amber-200' : 'text-emerald-200'}
                        />
                        <FieldCard
                          label="Duration"
                          value={selectedLockTiming?.durationLabel ?? 'Unknown'}
                        />
                        <FieldCard
                          label="Unlock Date"
                          value={formatKedolikUnixTime(selectedEscrow.cliffTime)}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Wallets
                      </div>
                      <div className="mt-3">
                        <PreviewRow label="From" value={<FullAddressValue address={selectedEscrow.creator} />} />
                        <PreviewRow
                          label="Lock Owner"
                          value={<FullAddressValue address={selectedEscrow.recipient} />}
                        />
                        <PreviewRow label="Token CA" value={<FullAddressValue address={selectedEscrow.tokenMint} />} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {canClaim && (
                      <button
                        type="button"
                        className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading !== null}
                        onClick={() =>
                          void runLockerAction(
                            'claim',
                            () => claim(selectedEscrow.address),
                            'Claim transaction submitted.'
                          )
                        }
                      >
                        {actionLoading === 'claim' ? 'Claiming...' : 'Claim'}
                      </button>
                    )}

                    {canCancel && (
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading !== null}
                        onClick={() =>
                          void runLockerAction(
                            'cancel',
                            () => cancel(selectedEscrow.address),
                            'Cancel transaction submitted.'
                          )
                        }
                      >
                        {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}

                    {canClose && (
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading !== null}
                        onClick={() =>
                          void runLockerAction(
                            'close',
                            () => close(selectedEscrow.address),
                            'Close transaction submitted.',
                            true
                          )
                        }
                      >
                        {actionLoading === 'close' ? 'Closing...' : 'Close'}
                      </button>
                    )}

                  </div>

                  {!canClaim && !canCancel && !canClose && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-dark-900/60 px-4 py-4 text-sm text-gray-300">
                      {showingSampleEscrowForViewer
                        ? 'This sample lock belongs to another wallet, so no actions are available here.'
                        : 'No actions are available for this lock right now.'}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="card mt-6 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-heading text-white">
                    Recent Locks Leaderboard
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">
                    All locks created on Kedolik Locker. Technical lock IDs are hidden from the
                    standard locker view, allowing users to focus on the lock owner, token amount,
                    unlock date, and claimable status.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                    {recentEscrows.length} total
                  </span>
                  {connected && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                      {walletMatchCount} wallet match{walletMatchCount === 1 ? '' : 'es'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void refreshEscrows();
                      void refreshRecentEscrows();
                      void refreshPrograms();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {([
                    ['newest', 'Newest'],
                    ['unlockLatest', 'Max Time'],
                    ['unlockSoon', 'Unlock Soon'],
                    ['amountHigh', 'Highest Amount'],
                    ['amountLow', 'Lowest Amount'],
                  ] as Array<[LockListSort, string]>).map(([sort, label]) => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => {
                        setLockListSort(sort);
                        setLeaderboardPage(1);
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                        lockListSort === sort
                          ? 'border-brand-cyan/40 bg-brand-cyan/15 text-brand-cyan'
                          : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-400">
                  Showing {sortedRecentEscrows.length === 0 ? 0 : leaderboardStartIndex + 1}-
                  {Math.min(leaderboardStartIndex + LEADERBOARD_PAGE_SIZE, sortedRecentEscrows.length)} of{' '}
                  {sortedRecentEscrows.length}
                </div>
              </div>

              {recentEscrowsError && (
                <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {recentEscrowsError}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {isLoadingRecentEscrows ? (
                  <div className="rounded-2xl border border-white/10 bg-dark-900/60 p-5 text-sm text-gray-300">
                    Loading recent locks...
                  </div>
                ) : paginatedRecentEscrows.length > 0 ? (
                  paginatedRecentEscrows.map((escrow, index) => (
                    <LockListItem
                      key={escrow.address}
                      escrow={escrow}
                      index={leaderboardStartIndex + index}
                      token={getTokenInfo(escrow.tokenMint)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-dark-900/60 p-5 text-sm text-gray-300">
                    No lock records are currently available to display on the leaderboard at this time.
                  </div>
                )}
              </div>

              {sortedRecentEscrows.length > LEADERBOARD_PAGE_SIZE && (
                <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setLeaderboardPage((page) => Math.max(1, page - 1))}
                    disabled={currentLeaderboardPage === 1}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <div className="flex flex-wrap justify-center gap-2">
                    {Array.from({ length: leaderboardTotalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setLeaderboardPage(page)}
                        className={`h-9 min-w-9 rounded-full border px-3 text-sm font-semibold transition-colors ${
                          page === currentLeaderboardPage
                            ? 'border-brand-cyan/40 bg-brand-cyan/15 text-brand-cyan'
                            : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setLeaderboardPage((page) => Math.min(leaderboardTotalPages, page + 1))
                    }
                    disabled={currentLeaderboardPage === leaderboardTotalPages}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </KedolikPageFrame>
  );
}
