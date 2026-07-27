import { useState, useEffect, useCallback } from 'react';
import {
  fetchFeatureFlags,
  FeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  clearRemoteConfigCache,
} from '../config/remoteConfig';

const FEATURE_FLAG_POLL_MS = 5 * 60 * 1000;

let sharedFlags: FeatureFlags = DEFAULT_FEATURE_FLAGS;
let sharedLoading = true;
let sharedError: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
let subscriberCount = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const loadSharedFlags = async (forceRefresh = false): Promise<void> => {
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      if (forceRefresh) {
        clearRemoteConfigCache();
      }

      sharedFlags = await fetchFeatureFlags();
      sharedError = null;
    } catch (err) {
      console.error('Error loading feature flags:', err);
      sharedError = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      sharedLoading = false;
      inflight = null;
      emit();
    }
  })();

  return inflight;
};

const startSharedPolling = () => {
  if (pollTimer) return;

  void loadSharedFlags();

  pollTimer = setInterval(() => {
    void loadSharedFlags(false);
  }, FEATURE_FLAG_POLL_MS);
};

const stopSharedPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

/**
 * React hook for accessing feature flags.
 * One shared poll for the whole app — Navbar, Swap, Pools, etc. do not each hit GitHub.
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(sharedFlags);
  const [isLoading, setIsLoading] = useState(sharedLoading);
  const [error, setError] = useState<string | null>(sharedError);

  useEffect(() => {
    subscriberCount += 1;
    startSharedPolling();

    const sync = () => {
      setFlags({ ...sharedFlags });
      setIsLoading(sharedLoading);
      setError(sharedError);
    };

    listeners.add(sync);
    sync();

    return () => {
      listeners.delete(sync);
      subscriberCount -= 1;
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        stopSharedPolling();
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    sharedLoading = true;
    emit();
    await loadSharedFlags(true);
  }, []);

  return {
    flags,
    isLoading,
    error,
    refresh,
    swapEnabled: flags.swapEnabled,
    poolsEnabled: flags.poolsEnabled,
    liquidityEnabled: flags.liquidityEnabled,
    maintenanceMode: flags.maintenanceMode,
    kedolikDevnetEnabled: flags.kedolikDevnetEnabled ?? DEFAULT_FEATURE_FLAGS.kedolikDevnetEnabled,
    maintenanceMessage: flags.maintenanceMessage,
    announcementBanner: flags.announcementBanner,
  };
}

export default useFeatureFlags;
