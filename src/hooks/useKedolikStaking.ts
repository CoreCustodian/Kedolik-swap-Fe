import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createKedolikStakingService,
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

  return {
    quarries,
    isLoading,
    error,
    refresh,
    stakingService,
  };
};

export default useKedolikStaking;
