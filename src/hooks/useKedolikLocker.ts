import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createLockerVestingEscrow,
  cancelLockerEscrow,
  claimLockerEscrow,
  closeLockerEscrow,
  fetchLockerEscrow,
  fetchLockerEscrowsForWallet,
  getLockerActionErrorMessage,
  LockerEscrowSummary,
  updateLockerEscrowRecipient,
} from '../services/kedolikLocker';
import { onRefreshEvent, REFRESH_EVENTS } from '../utils/refreshEvents';
import { isPageVisible } from '../utils/visibilityControl';

const LOCKER_CACHE_MS = 5 * 60 * 1000;

interface UseKedolikLockerOptions {
  enabled?: boolean;
}

export const useKedolikLocker = ({ enabled = true }: UseKedolikLockerOptions = {}) => {
  const { connection } = useConnection();
  const walletCtx = useWallet();
  const { publicKey } = walletCtx;
  const [escrows, setEscrows] = useState<LockerEscrowSummary[]>([]);
  const [isLoadingEscrows, setIsLoadingEscrows] = useState(false);
  const [escrowsError, setEscrowsError] = useState<string | null>(null);
  const lastFetchAt = useRef(0);

  const refreshEscrows = useCallback(async (force = false) => {
    if (!enabled || !publicKey) {
      setEscrows([]);
      setEscrowsError(null);
      return;
    }

    if (!isPageVisible() && !force) {
      return;
    }

    if (!force && Date.now() - lastFetchAt.current < LOCKER_CACHE_MS) {
      return;
    }

    setIsLoadingEscrows(true);
    setEscrowsError(null);

    try {
      const nextEscrows = await fetchLockerEscrowsForWallet(connection, publicKey);
      lastFetchAt.current = Date.now();
      setEscrows(nextEscrows);
    } catch (error) {
      setEscrows([]);
      setEscrowsError(getLockerActionErrorMessage(error));
    } finally {
      setIsLoadingEscrows(false);
    }
  }, [connection, enabled, publicKey]);

  useEffect(() => {
    lastFetchAt.current = 0;
    void refreshEscrows(true);
  }, [refreshEscrows]);

  useEffect(() => {
    const handleRefresh = () => {
      lastFetchAt.current = 0;
      void refreshEscrows(true);
    };
    const stopLocksEvent = onRefreshEvent(REFRESH_EVENTS.LOCKS, handleRefresh);
    return stopLocksEvent;
  }, [refreshEscrows]);

  const lookupEscrow = useCallback(
    async (escrowAddress: string) => fetchLockerEscrow(connection, escrowAddress, publicKey ?? undefined),
    [connection, publicKey],
  );

  const claim = useCallback(
    async (escrowAddress: string) => {
      if (!walletCtx.publicKey) {
        throw new Error('Connect a wallet before claiming locker escrow tokens.');
      }

      return claimLockerEscrow(connection, walletCtx, escrowAddress);
    },
    [walletCtx, connection],
  );

  const cancel = useCallback(
    async (escrowAddress: string) => {
      if (!walletCtx.publicKey) {
        throw new Error('Connect a wallet before cancelling a locker escrow.');
      }

      return cancelLockerEscrow(connection, walletCtx, escrowAddress);
    },
    [walletCtx, connection],
  );

  const close = useCallback(
    async (escrowAddress: string) => {
      if (!walletCtx.publicKey) {
        throw new Error('Connect a wallet before closing a locker escrow.');
      }

      return closeLockerEscrow(connection, walletCtx, escrowAddress);
    },
    [walletCtx, connection],
  );

  const updateRecipient = useCallback(
    async (escrowAddress: string, newRecipient: string, newRecipientEmail?: string) => {
      if (!walletCtx.publicKey) {
        throw new Error('Connect a wallet before updating the locker recipient.');
      }

      return updateLockerEscrowRecipient(
        connection,
        walletCtx,
        escrowAddress,
        newRecipient,
        newRecipientEmail,
      );
    },
    [walletCtx, connection],
  );

  const create = useCallback(
    async (input: Parameters<typeof createLockerVestingEscrow>[2]) => {
      if (!walletCtx.publicKey) {
        throw new Error('Connect a wallet before creating a locker escrow.');
      }

      return createLockerVestingEscrow(connection, walletCtx, input);
    },
    [walletCtx, connection],
  );

  return {
    escrows,
    isLoadingEscrows,
    escrowsError,
    refreshEscrows: () => {
      lastFetchAt.current = 0;
      return refreshEscrows(true);
    },
    lookupEscrow,
    create,
    claim,
    cancel,
    close,
    updateRecipient,
    getActionErrorMessage: getLockerActionErrorMessage,
  };
};

export default useKedolikLocker;
