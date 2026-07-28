import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { isNativeSOL } from './amm';
import { clearBalanceCache } from './balanceCache';
import { onPageVisibilityChange } from './visibilityControl';
import { onRefreshEvent, REFRESH_EVENTS } from './refreshEvents';

/**
 * Subscribe to wallet balance changes via WebSocket (no polling).
 * Also listens for explicit invalidation events (swap, stake, manual refresh).
 */
export const subscribeWalletBalanceUpdates = (
  connection: Connection,
  wallet: PublicKey,
  mints: PublicKey[],
  onUpdate: () => void,
): (() => void) => {
  const subscriptionIds: number[] = [];
  let paused = !document || document.visibilityState === 'hidden';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // A single swap mutates SOL plus both token accounts, so coalesce the
  // notifications into one refetch instead of three.
  const scheduleUpdate = () => {
    if (paused) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      clearBalanceCache(wallet);
      onUpdate();
    }, 400);
  };

  // Native SOL
  subscriptionIds.push(
    connection.onAccountChange(wallet, () => scheduleUpdate(), 'confirmed'),
  );

  const uniqueMints = new Map<string, PublicKey>();
  mints.forEach((mint) => {
    if (!isNativeSOL(mint)) {
      uniqueMints.set(mint.toString(), mint);
    }
  });

  uniqueMints.forEach((mint) => {
    try {
      const ata = getAssociatedTokenAddressSync(mint, wallet);
      subscriptionIds.push(
        connection.onAccountChange(ata, () => scheduleUpdate(), 'confirmed'),
      );
    } catch {
      // Skip invalid mint layouts
    }
  });

  const stopVisibility = onPageVisibilityChange((visible) => {
    paused = !visible;
    if (visible) {
      scheduleUpdate();
    }
  });

  const stopBalanceEvent = onRefreshEvent(REFRESH_EVENTS.BALANCES, (detail) => {
    if (!detail?.wallet || detail.wallet === wallet.toString()) {
      scheduleUpdate();
    }
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    subscriptionIds.forEach((id) => {
      try {
        void connection.removeAccountChangeListener(id);
      } catch {
        // ignore
      }
    });
    stopVisibility();
    stopBalanceEvent();
  };
};
