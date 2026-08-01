import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createKedolikStakingService,
  getKedolikStakingErrorMessage,
  KEDOLIK_STAKING_POOLS_UPDATED_EVENT,
  KedolikStakingQuarrySummary,
} from '../services/kedolikStaking';
import { onRefreshEvent, REFRESH_EVENTS } from '../utils/refreshEvents';
import { isPageVisible } from '../utils/visibilityControl';

const STAKING_CACHE_MS = 60_000;

export const useKedolikStaking = () => {
  const { connection } = useConnection();
  const walletCtx = useWallet();
  const { publicKey } = walletCtx;
  const stakingService = useMemo(
    () => createKedolikStakingService(connection, walletCtx ?? null),
    [walletCtx, connection],
  );
  const [quarries, setQuarries] = useState<KedolikStakingQuarrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchAt = useRef(0);

  const refresh = useCallback(async (force = false) => {
    if (!isPageVisible() && !force) {
      return;
    }

    if (!force && Date.now() - lastFetchAt.current < STAKING_CACHE_MS) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextQuarries = await stakingService.fetchLiveQuarries(publicKey ?? null);
      lastFetchAt.current = Date.now();
      setQuarries(nextQuarries);
    } catch (refreshError) {
      setQuarries([]);
      setError(getKedolikStakingErrorMessage(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, stakingService]);

  useEffect(() => {
    lastFetchAt.current = 0;
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    const handlePoolsUpdated = () => {
      lastFetchAt.current = 0;
      void refresh(true);
    };

    window.addEventListener(KEDOLIK_STAKING_POOLS_UPDATED_EVENT, handlePoolsUpdated);
    window.addEventListener('storage', handlePoolsUpdated);
    const stopStakingEvent = onRefreshEvent(REFRESH_EVENTS.STAKING, handlePoolsUpdated);

    return () => {
      window.removeEventListener(KEDOLIK_STAKING_POOLS_UPDATED_EVENT, handlePoolsUpdated);
      window.removeEventListener('storage', handlePoolsUpdated);
      stopStakingEvent();
    };
  }, [refresh]);

  return {
    quarries,
    isLoading,
    error,
    refresh: () => {
      lastFetchAt.current = 0;
      return refresh(true);
    },
    stakingService,
  };
};

export default useKedolikStaking;
