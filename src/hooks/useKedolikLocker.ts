import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useState } from 'react';
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

interface UseKedolikLockerOptions {
  enabled?: boolean;
}

export const useKedolikLocker = ({ enabled = true }: UseKedolikLockerOptions = {}) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [escrows, setEscrows] = useState<LockerEscrowSummary[]>([]);
  const [isLoadingEscrows, setIsLoadingEscrows] = useState(false);
  const [escrowsError, setEscrowsError] = useState<string | null>(null);

  const refreshEscrows = useCallback(async () => {
    if (!enabled || !publicKey) {
      setEscrows([]);
      setEscrowsError(null);
      return;
    }

    setIsLoadingEscrows(true);
    setEscrowsError(null);

    try {
      const nextEscrows = await fetchLockerEscrowsForWallet(connection, publicKey);
      setEscrows(nextEscrows);
    } catch (error) {
      setEscrows([]);
      setEscrowsError(getLockerActionErrorMessage(error));
    } finally {
      setIsLoadingEscrows(false);
    }
  }, [connection, enabled, publicKey]);

  useEffect(() => {
    refreshEscrows();
  }, [refreshEscrows]);

  const lookupEscrow = useCallback(
    async (escrowAddress: string) => fetchLockerEscrow(connection, escrowAddress, publicKey ?? undefined),
    [connection, publicKey]
  );

  const claim = useCallback(
    async (escrowAddress: string) => {
      if (!anchorWallet) {
        throw new Error('Connect a wallet before claiming locker escrow tokens.');
      }

      return claimLockerEscrow(connection, anchorWallet, escrowAddress);
    },
    [anchorWallet, connection]
  );

  const cancel = useCallback(
    async (escrowAddress: string) => {
      if (!anchorWallet) {
        throw new Error('Connect a wallet before cancelling a locker escrow.');
      }

      return cancelLockerEscrow(connection, anchorWallet, escrowAddress);
    },
    [anchorWallet, connection]
  );

  const close = useCallback(
    async (escrowAddress: string) => {
      if (!anchorWallet) {
        throw new Error('Connect a wallet before closing a locker escrow.');
      }

      return closeLockerEscrow(connection, anchorWallet, escrowAddress);
    },
    [anchorWallet, connection]
  );

  const updateRecipient = useCallback(
    async (escrowAddress: string, newRecipient: string, newRecipientEmail?: string) => {
      if (!anchorWallet) {
        throw new Error('Connect a wallet before updating the locker recipient.');
      }

      return updateLockerEscrowRecipient(
        connection,
        anchorWallet,
        escrowAddress,
        newRecipient,
        newRecipientEmail
      );
    },
    [anchorWallet, connection]
  );

  const create = useCallback(
    async (input: Parameters<typeof createLockerVestingEscrow>[2]) => {
      if (!anchorWallet) {
        throw new Error('Connect a wallet before creating a locker escrow.');
      }

      return createLockerVestingEscrow(connection, anchorWallet, input);
    },
    [anchorWallet, connection]
  );

  return {
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
    getActionErrorMessage: getLockerActionErrorMessage,
  };
};

export default useKedolikLocker;
