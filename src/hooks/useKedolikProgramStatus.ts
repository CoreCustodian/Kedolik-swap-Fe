import { useConnection } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useState } from 'react';
import {
  KEDOLIK_DEVNET_PUBLIC_KEYS,
  KEDOLIK_PROGRAM_ADDRESSES,
  KEDOLIK_PROGRAM_LABELS,
  KedolikProgramKey,
} from '../config/kedolikDevnet';

export interface KedolikProgramStatus {
  key: KedolikProgramKey;
  label: string;
  address: string;
  live: boolean;
  executable: boolean;
  statusMessage: string;
  error?: string;
}

type KedolikProgramStatusMap = Record<KedolikProgramKey, KedolikProgramStatus>;

const defaultStatus = (key: KedolikProgramKey): KedolikProgramStatus => ({
  key,
  label: KEDOLIK_PROGRAM_LABELS[key],
  address: KEDOLIK_PROGRAM_ADDRESSES[key],
  live: false,
  executable: false,
  statusMessage: 'Checking live devnet status...',
});

export const useKedolikProgramStatus = () => {
  const { connection } = useConnection();
  const [programs, setPrograms] = useState<KedolikProgramStatusMap>({
    kedolikLocker: defaultStatus('kedolikLocker'),
    kedolikStaking: defaultStatus('kedolikStaking'),
    kedolikMintWrapper: defaultStatus('kedolikMintWrapper'),
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const entries = await Promise.all(
        (Object.keys(KEDOLIK_PROGRAM_ADDRESSES) as KedolikProgramKey[]).map(async (key) => {
          try {
            const accountInfo = await connection.getAccountInfo(KEDOLIK_DEVNET_PUBLIC_KEYS[
              key === 'kedolikLocker'
                ? 'lockerProgram'
                : key === 'kedolikStaking'
                  ? 'kedolikStakingProgram'
                  : 'kedolikMintWrapperProgram'
            ]);

            if (!accountInfo) {
              return [
                key,
                {
                  ...defaultStatus(key),
                  statusMessage: 'Live program account not found on the current RPC endpoint',
                },
              ] as const;
            }

            return [
              key,
              {
                key,
                label: KEDOLIK_PROGRAM_LABELS[key],
                address: KEDOLIK_PROGRAM_ADDRESSES[key],
                live: true,
                executable: accountInfo.executable,
                statusMessage: accountInfo.executable
                  ? 'Live on devnet'
                  : 'Program account found but not executable',
              },
            ] as const;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to query program status.';
            return [
              key,
              {
                ...defaultStatus(key),
                error: message,
                statusMessage: 'Unable to query program status on the current RPC endpoint',
              },
            ] as const;
          }
        })
      );

      setPrograms(Object.fromEntries(entries) as KedolikProgramStatusMap);
    } finally {
      setIsLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    programs,
    isLoading,
    refresh,
  };
};

export default useKedolikProgramStatus;
