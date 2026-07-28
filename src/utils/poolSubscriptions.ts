import { Connection } from '@solana/web3.js';
import { PROGRAM_ID } from '../config/addresses';
import { hasWebsocketEndpoint } from '../config/rpc';
import { clearPoolCache } from './amm';
import { dispatchPoolsInvalidation } from './refreshEvents';
import { onPageVisibilityChange } from './visibilityControl';

/**
 * One `programSubscribe` covers every pool: swaps, deposits and withdrawals all
 * mutate the pool state account. That lets the pool cache live much longer, since
 * it gets invalidated on real changes instead of expiring on a timer.
 */

let refCount = 0;
let subscriptionId: number | null = null;
let stopVisibility: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let paused = false;
let missedWhilePaused = false;

const flush = () => {
  clearPoolCache();
  dispatchPoolsInvalidation();
};

const schedule = () => {
  if (paused) {
    missedWhilePaused = true;
    return;
  }
  // Busy pools emit many updates in a row; one refresh per burst is enough.
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush();
  }, 3000);
};

export const subscribePoolUpdates = (connection: Connection): (() => void) => {
  if (!hasWebsocketEndpoint()) {
    return () => undefined;
  }

  refCount += 1;

  if (subscriptionId === null) {
    paused = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    try {
      subscriptionId = connection.onProgramAccountChange(
        PROGRAM_ID,
        () => schedule(),
        'confirmed'
      );
    } catch (error) {
      console.warn('Pool subscription failed, falling back to cache TTL:', error);
      subscriptionId = null;
      refCount -= 1;
      return () => undefined;
    }

    stopVisibility = onPageVisibilityChange((visible) => {
      paused = !visible;
      if (visible && missedWhilePaused) {
        missedWhilePaused = false;
        flush();
      }
    });
  }

  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount > 0 || subscriptionId === null) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void connection.removeProgramAccountChangeListener(subscriptionId).catch(() => undefined);
    subscriptionId = null;
    stopVisibility?.();
    stopVisibility = null;
    missedWhilePaused = false;
  };
};
