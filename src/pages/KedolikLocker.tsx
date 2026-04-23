import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useMemo, useState } from 'react';
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import toast from 'react-hot-toast';
import {
  KEDOLIK_DEVNET_LIVE_MESSAGES,
  KEDOLIK_DEVNET_LOCKER_LIVE,
} from '../config/kedolikDevnet';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useKedolikLocker } from '../hooks/useKedolikLocker';
import { useKedolikProgramStatus } from '../hooks/useKedolikProgramStatus';
import { LockerEscrowSummary } from '../services/kedolikLocker';
import {
  KedolikInfoRow,
  KedolikPageFrame,
  KedolikProgramStatusBadge,
  formatKedolikAddress,
  formatKedolikTokenAmount,
  formatKedolikUnixTime,
} from '../components/kedolik/KedolikShared';

type LockerAction = 'create' | 'lookup' | 'claim' | 'cancel' | 'close' | 'updateRecipient' | null;

const DEFAULT_SIMPLE_LOCK_FORM = {
  recipient: '',
  tokenMint: KEDOLIK_DEVNET_LOCKER_LIVE.tokenMint,
  amount: '',
  unlockAt: '',
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

const formatLockHolder = (address: string, connectedWalletAddress: string | null) =>
  address === connectedWalletAddress ? 'You' : formatKedolikAddress(address);

const getLockHeadline = (escrow: LockerEscrowSummary) => {
  if (escrow.isCancelled) {
    return `This lock was cancelled on ${formatKedolikUnixTime(escrow.cancelledAt)}.`;
  }

  if (toBigInt(escrow.claimableAmount) > 0n) {
    return 'Tokens are available to claim now.';
  }

  if (isOneTimeLock(escrow)) {
    return `Tokens stay locked until ${formatKedolikUnixTime(escrow.cliffTime)}.`;
  }

  return `This lock releases over time every ${escrow.frequency} seconds after ${formatKedolikUnixTime(
    escrow.cliffTime
  )}.`;
};

const getLockScheduleLabel = (escrow: LockerEscrowSummary) =>
  isOneTimeLock(escrow) ? 'One-time unlock' : `Gradual unlock every ${escrow.frequency} seconds`;

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

export default function KedolikLocker() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { kedolikDevnetEnabled } = useFeatureFlags();
  const { programs, isLoading: isLoadingPrograms, refresh: refreshPrograms } = useKedolikProgramStatus();
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
    updateRecipient,
    getActionErrorMessage,
  } = useKedolikLocker({ enabled: programs.kedolikLocker.live });

  const [selectedEscrowAddress, setSelectedEscrowAddress] = useState<string | null>(null);
  const [selectedEscrow, setSelectedEscrow] = useState<LockerEscrowSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<LockerAction>(null);
  const [newRecipient, setNewRecipient] = useState('');
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [simpleLockForm, setSimpleLockForm] = useState(DEFAULT_SIMPLE_LOCK_FORM);
  const [simpleLockMintDecimals, setSimpleLockMintDecimals] = useState<number | null>(null);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [showUpdateRecipientForm, setShowUpdateRecipientForm] = useState(false);

  const lockerProgramStatus = programs.kedolikLocker;
  const connectedWalletAddress = publicKey?.toString() ?? null;
  const sampleEscrowAddress = KEDOLIK_DEVNET_LOCKER_LIVE.escrow;
  const preferredEscrowAddress = connected && escrows.length > 0 ? escrows[0].address : sampleEscrowAddress;

  useEffect(() => {
    setSelectedEscrowAddress(null);
    setSelectedEscrow(null);
    setHasManualSelection(false);
    setShowUpdateRecipientForm(false);
  }, [connectedWalletAddress]);

  useEffect(() => {
    setSimpleLockForm({
      recipient: connectedWalletAddress ?? '',
      tokenMint: KEDOLIK_DEVNET_LOCKER_LIVE.tokenMint,
      amount: '',
      unlockAt: '',
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

  useEffect(() => {
    setShowUpdateRecipientForm(false);
    setNewRecipient('');
    setNewRecipientEmail('');
  }, [selectedEscrow?.address]);

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
      return 'Your Lock';
    }

    if (selectedEscrow.address === sampleEscrowAddress) {
      return 'Sample Lock';
    }

    return 'Loaded Lock';
  }, [sampleEscrowAddress, selectedEscrow]);

  const noWalletEscrowMessage =
    connected && escrows.length === 0 ? 'No lock found for this wallet yet.' : null;

  const showingSampleEscrowForViewer = Boolean(
    selectedEscrow &&
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

  const canUpdateRecipient = Boolean(
    connected &&
      selectedEscrow &&
      !selectedEscrow.isCancelled &&
      ((selectedEscrow.walletMatchesCreator &&
        modeAllows(selectedEscrow.updateRecipientMode, 'creator')) ||
        (selectedEscrow.walletMatchesRecipient &&
          modeAllows(selectedEscrow.updateRecipientMode, 'recipient')))
  );

  const simpleLockAmountRaw = parseTokenAmountToRaw(simpleLockForm.amount, simpleLockMintDecimals);
  const canCreateSimpleLock = Boolean(
    simpleLockForm.recipient.trim() &&
      simpleLockForm.tokenMint.trim() &&
      simpleLockForm.unlockAt &&
      simpleLockAmountRaw !== null &&
      simpleLockAmountRaw > 0n
  );

  const selectedLockHeadline = selectedEscrow ? getLockHeadline(selectedEscrow) : '';
  const selectedLockSchedule = selectedEscrow ? getLockScheduleLabel(selectedEscrow) : '';
  const minimumUnlockAt = useMemo(() => formatDateTimeLocalValue(Date.now() + 5 * 60 * 1000), []);
  const unlockPreviewLabel = simpleLockForm.unlockAt
    ? formatKedolikUnixTime(toUnixTimestamp(simpleLockForm.unlockAt))
    : 'Choose an unlock date';

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

    if (!simpleLockForm.recipient.trim() || !simpleLockForm.tokenMint.trim()) {
      toast.error('Recipient wallet and token mint are required to create a lock.');
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
        recipient: simpleLockForm.recipient.trim(),
        tokenMint: simpleLockForm.tokenMint.trim(),
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
      setSimpleLockForm({
        recipient: connectedWalletAddress ?? '',
        tokenMint: simpleLockForm.tokenMint.trim(),
        amount: '',
        unlockAt: '',
      });
      await Promise.all([refreshEscrows(), refreshPrograms()]);
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
      await Promise.all([refreshEscrows(), refreshPrograms()]);

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

  const handleUpdateRecipient = async () => {
    if (!selectedEscrow) {
      toast.error('No lock is loaded.');
      return;
    }

    if (connectWalletIfNeeded()) {
      return;
    }

    if (!newRecipient.trim()) {
      toast.error('Enter a new recipient wallet address.');
      return;
    }

    setActionLoading('updateRecipient');

    try {
      await updateRecipient(
        selectedEscrow.address,
        newRecipient.trim(),
        newRecipientEmail.trim() || undefined
      );
      toast.success('Recipient updated.');
      await refreshEscrows();
      handleSelectEscrow(selectedEscrow.address, true);
      setShowUpdateRecipientForm(false);
    } catch (error) {
      toast.error(getActionErrorMessage(error));
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
                    live={lockerProgramStatus.live}
                    executable={lockerProgramStatus.executable}
                  />
                )}
              </div>

              <h1 className="text-4xl font-bold font-heading sm:text-5xl">Kedolik Locker</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-300 sm:text-lg">
                {KEDOLIK_DEVNET_LIVE_MESSAGES.locker} See what is locked, what is claimable, and
                which actions are available for the selected lock.
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
                  ? escrows.length > 0
                    ? `Your Locks: ${escrows.length}`
                    : 'No lock found for this wallet yet.'
                  : 'Connect wallet to load your own locks.'}
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
            <h2 className="text-2xl font-bold font-heading">Kedolik Locker Disabled</h2>
            <p className="mt-3 text-gray-300">
              The `kedolikDevnetEnabled` feature flag is off, so locker is hidden from the main
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
                {noWalletEscrowMessage} Showing a sample lock below.
              </div>
            )}

            <section className="card mt-6 p-6 sm:p-8">
              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-brand-cyan/10 via-dark-900/85 to-brand-pink/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold font-heading text-white">Create a Lock</h2>
                      <p className="mt-2 text-sm leading-relaxed text-gray-300">
                        Pick a recipient, amount, and unlock date. Kedolik Locker will create a
                        one-time lock and keep all technical IDs hidden from the main screen.
                      </p>
                    </div>
                    <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold text-brand-cyan">
                      One-time lock
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="rounded-[28px] border border-white/10 bg-dark-900/65 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Recipient
                      </div>
                      <input
                        value={simpleLockForm.recipient}
                        onChange={(event) =>
                          setSimpleLockForm((current) => ({ ...current, recipient: event.target.value }))
                        }
                        placeholder="Recipient wallet"
                        className="mt-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
                      />
                    </label>

                    <label className="rounded-[28px] border border-white/10 bg-dark-900/65 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Token Mint
                      </div>
                      <input
                        value={simpleLockForm.tokenMint}
                        onChange={(event) =>
                          setSimpleLockForm((current) => ({ ...current, tokenMint: event.target.value }))
                        }
                        placeholder="Token mint"
                        className="mt-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
                      />
                    </label>

                    <label className="rounded-[28px] border border-white/10 bg-dark-900/65 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Amount To Lock
                      </div>
                      <input
                        value={simpleLockForm.amount}
                        onChange={(event) =>
                          setSimpleLockForm((current) => ({ ...current, amount: event.target.value }))
                        }
                        placeholder="0.00"
                        className="mt-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
                      />
                    </label>

                    <div className="rounded-[28px] border border-white/10 bg-dark-900/65 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                            Unlock Date
                          </div>
                          <div className="mt-2 text-sm text-gray-300">
                            Choose when the recipient can unlock the tokens.
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-gray-200">
                          Calendar
                        </span>
                      </div>

                      <input
                        type="datetime-local"
                        value={simpleLockForm.unlockAt}
                        min={minimumUnlockAt}
                        step={60}
                        onChange={(event) =>
                          setSimpleLockForm((current) => ({ ...current, unlockAt: event.target.value }))
                        }
                        className="mt-4 min-h-[54px] w-full rounded-2xl border border-white/10 bg-dark-800/85 px-4 text-sm text-white outline-none transition-all duration-300 [color-scheme:dark] focus:border-brand-cyan/50"
                      />

                      <div className="mt-4 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/10 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
                          Unlock Preview
                        </div>
                        <div className="mt-2 text-base font-semibold text-white">{unlockPreviewLabel}</div>
                        <div className="mt-1 text-xs text-gray-300">
                          The recipient can claim once this time is reached on devnet.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-dark-900/55 px-4 py-3 text-sm text-gray-300">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Recipient
                      </div>
                      <div className="mt-2 font-semibold text-white">
                        {simpleLockForm.recipient.trim()
                          ? formatLockHolder(simpleLockForm.recipient.trim(), connectedWalletAddress)
                          : 'Not set'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-dark-900/55 px-4 py-3 text-sm text-gray-300">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Token Decimals
                      </div>
                      <div className="mt-2 font-semibold text-white">
                        {simpleLockMintDecimals === null ? 'Loading...' : simpleLockMintDecimals}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-dark-900/55 px-4 py-3 text-sm text-gray-300">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Lock Type
                      </div>
                      <div className="mt-2 font-semibold text-white">One-time unlock</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCreateSimpleLock()}
                    disabled={!canCreateSimpleLock || actionLoading !== null}
                    className="btn-primary mt-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === 'create' ? 'Creating Lock...' : 'Create Lock'}
                  </button>
                </div>

                <div className="rounded-[32px] border border-white/10 bg-dark-900/60 p-6">
                  <h2 className="text-2xl font-bold font-heading text-white">How It Works</h2>
                  <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-300">
                    <p className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                      1. Enter who should receive the tokens, how much to lock, and when the lock
                      should end.
                    </p>
                    <p className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                      2. Kedolik Locker creates one on-chain lock for that setup.
                    </p>
                    <p className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                      3. When the unlock time arrives, the recipient can claim the released tokens.
                    </p>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-dark-800/70 px-4 py-4 text-sm text-gray-300">
                    Technical lock IDs stay hidden from the normal locker view, so users only focus
                    on amount, unlock date, and claimable status.
                  </div>
                </div>
              </div>
            </section>

            <section className="card mt-6 p-6 sm:p-8">
              {isLoadingPrograms || (isLoadingEscrows && !selectedEscrow) ? (
                <div className="text-sm text-gray-300">Loading live lock data...</div>
              ) : !selectedEscrow ? (
                <div className="text-sm text-gray-300">
                  No lock could be loaded from the current RPC endpoint.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                          {selectedEscrowLabel}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                          {selectedEscrow.isCancelled ? 'Cancelled' : 'Active'}
                        </span>
                      </div>
                      <h2 className="mt-4 text-3xl font-bold font-heading text-white">
                        Kedolik Locker
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
                        {selectedLockHeadline}
                      </p>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-dark-900/60 px-5 py-4 text-sm text-gray-300">
                      {showingSampleEscrowForViewer
                        ? 'Sample lock loaded. This lock belongs to another wallet.'
                        : 'Live on Devnet'}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <FieldCard
                      label="Status"
                      value={selectedEscrow.isCancelled ? 'Cancelled' : 'Active'}
                    />
                    <FieldCard
                      label="Total Locked"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.scheduledTotalAmount,
                        selectedEscrow.tokenDecimals
                      )}
                    />
                    <FieldCard
                      label="Still Locked"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.lockedAmount,
                        selectedEscrow.tokenDecimals
                      )}
                    />
                    <FieldCard
                      label="Claimable Now"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.claimableAmount,
                        selectedEscrow.tokenDecimals
                      )}
                    />
                    <FieldCard
                      label="Total Claimed"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.totalClaimedAmount,
                        selectedEscrow.tokenDecimals
                      )}
                    />
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <KedolikInfoRow
                      label="Recipient"
                      value={formatLockHolder(selectedEscrow.recipient, connectedWalletAddress)}
                    />
                    <KedolikInfoRow
                      label="Creator"
                      value={formatLockHolder(selectedEscrow.creator, connectedWalletAddress)}
                    />
                    <KedolikInfoRow label="Token" value={formatKedolikAddress(selectedEscrow.tokenMint)} />
                    <KedolikInfoRow label="Release Style" value={selectedLockSchedule} />
                    <KedolikInfoRow
                      label="Start"
                      value={formatKedolikUnixTime(selectedEscrow.vestingStartTime)}
                    />
                    <KedolikInfoRow
                      label={isOneTimeLock(selectedEscrow) ? 'Unlock Date' : 'Cliff'}
                      value={formatKedolikUnixTime(selectedEscrow.cliffTime)}
                    />
                    <KedolikInfoRow
                      label="Frequency"
                      value={isOneTimeLock(selectedEscrow) ? 'One-time release' : `${selectedEscrow.frequency} seconds`}
                    />
                    <KedolikInfoRow
                      label="Amount Per Period"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.amountPerPeriod,
                        selectedEscrow.tokenDecimals
                      )}
                    />
                    <KedolikInfoRow
                      label="Number of Periods"
                      value={selectedEscrow.numberOfPeriod.toString()}
                    />
                    <KedolikInfoRow
                      label="Unlocked So Far"
                      value={formatKedolikTokenAmount(
                        selectedEscrow.unlockedAmount,
                        selectedEscrow.tokenDecimals
                      )}
                    />
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

                    {canUpdateRecipient && (
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                        onClick={() => setShowUpdateRecipientForm((current) => !current)}
                      >
                        Update Recipient
                      </button>
                    )}
                  </div>

                  {!canClaim && !canCancel && !canClose && !canUpdateRecipient && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-dark-900/60 px-4 py-4 text-sm text-gray-300">
                      {showingSampleEscrowForViewer
                        ? 'This sample lock belongs to another wallet, so no actions are available here.'
                        : 'No actions are available for this lock right now.'}
                    </div>
                  )}

                  {showUpdateRecipientForm && canUpdateRecipient && (
                    <div className="mt-5 rounded-3xl border border-white/10 bg-dark-900/60 p-5">
                      <div className="text-sm font-semibold text-white">Update Recipient</div>
                      <input
                        value={newRecipient}
                        onChange={(event) => setNewRecipient(event.target.value)}
                        placeholder="New recipient wallet"
                        className="mt-4 w-full rounded-2xl border border-white/10 bg-dark-800/80 px-4 py-3 text-sm text-white outline-none transition-all duration-300 placeholder:text-gray-500 focus:border-brand-cyan/50"
                      />
                      <input
                        value={newRecipientEmail}
                        onChange={(event) => setNewRecipientEmail(event.target.value)}
                        placeholder="Recipient email (optional)"
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-dark-800/80 px-4 py-3 text-sm text-white outline-none transition-all duration-300 placeholder:text-gray-500 focus:border-brand-cyan/50"
                      />
                      <button
                        type="button"
                        className="mt-4 w-full rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading !== null}
                        onClick={() => void handleUpdateRecipient()}
                      >
                        {actionLoading === 'updateRecipient' ? 'Updating...' : 'Save Recipient'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="card mt-6 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-heading text-white">Your Locks</h2>
                  <p className="mt-2 text-sm text-gray-300">
                    Open one of your locks below. The sample lock stays available for testing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {connected && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold text-gray-200">
                      {escrows.length > 0 ? `${escrows.length} lock${escrows.length === 1 ? '' : 's'}` : 'No locks yet'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void refreshEscrows();
                      void refreshPrograms();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {connected && escrows.length > 0 ? (
                  escrows.map((escrow, index) => (
                    <button
                      key={escrow.address}
                      type="button"
                      onClick={() => handleSelectEscrow(escrow.address)}
                      className={`rounded-[28px] border p-5 text-left transition-all duration-300 ${
                        selectedEscrow?.address === escrow.address
                          ? 'border-brand-cyan/50 bg-brand-cyan/10'
                          : 'border-white/10 bg-dark-900/60 hover:border-brand-cyan/40 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Lock {index + 1}</div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-gray-200">
                          {escrow.walletRole === 'creator'
                            ? 'Created by you'
                            : escrow.walletRole === 'recipient'
                              ? 'For you'
                              : 'Viewer'}
                        </span>
                      </div>
                      <div className="mt-4 text-2xl font-bold text-white">
                        {formatKedolikTokenAmount(escrow.scheduledTotalAmount, escrow.tokenDecimals)}
                      </div>
                      <div className="mt-2 text-sm text-gray-300">
                        {isOneTimeLock(escrow)
                          ? `Unlocks ${formatKedolikUnixTime(escrow.cliffTime)}`
                          : `Unlocks gradually from ${formatKedolikUnixTime(escrow.cliffTime)}`}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
                        <span>Claimable: {formatKedolikTokenAmount(escrow.claimableAmount, escrow.tokenDecimals)}</span>
                        <span>Locked: {formatKedolikTokenAmount(escrow.lockedAmount, escrow.tokenDecimals)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[28px] border border-white/10 bg-dark-900/60 p-5 text-sm text-gray-300 md:col-span-2 xl:col-span-3">
                    {connected
                      ? 'No lock found for this wallet yet.'
                      : 'Connect wallet to load your own locks.'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSelectEscrow(sampleEscrowAddress)}
                  className={`rounded-[28px] border p-5 text-left transition-all duration-300 ${
                    selectedEscrow?.address === sampleEscrowAddress
                      ? 'border-brand-cyan/50 bg-brand-cyan/10'
                      : 'border-white/10 bg-dark-900/60 hover:border-brand-cyan/40 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">Sample Lock</div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-gray-200">
                      Devnet example
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-300">
                    Opens the live sample lock if you want to inspect the locker flow without using
                    your own funds.
                  </div>
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </KedolikPageFrame>
  );
}
