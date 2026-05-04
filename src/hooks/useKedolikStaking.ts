import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createKedolikStakingService,
  KEDOLIK_STAKING_POOLS_UPDATED_EVENT,
  KedolikStakingQuarrySummary,
} from '../services/kedolikStaking';

export const useKedolikStaking = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const stakingService = useMemo(
    () => createKedolikStakingService(connection, anchorWallet ?? null),
    [anchorWallet, connection]
  );
  const [quarries, setQuarries] = useState<KedolikStakingQuarrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextQuarries = await stakingService.fetchLiveQuarries(publicKey ?? null);
      setQuarries(nextQuarries);
    } catch (refreshError) {
      setQuarries([]);
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load Kedolik Staking.');
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, stakingService]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handlePoolsUpdated = () => {
      void refresh();
    };

    window.addEventListener(KEDOLIK_STAKING_POOLS_UPDATED_EVENT, handlePoolsUpdated);
    window.addEventListener('storage', handlePoolsUpdated);

    return () => {
      window.removeEventListener(KEDOLIK_STAKING_POOLS_UPDATED_EVENT, handlePoolsUpdated);
      window.removeEventListener('storage', handlePoolsUpdated);
    };
  }, [refresh]);

  return {
    quarries,
    isLoading,
    error,
    refresh,
    stakingService,
  };
};

export default useKedolikStaking;
