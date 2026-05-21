import { PublicKey } from '@solana/web3.js';
import {
  KEDOLIK_STAKE_LOCK_ADMIN_CONFIG,
  KEDOLIK_STAKE_LOCK_CURRENT_ADMIN,
  KEDOLIK_STAKE_LOCK_PROGRAM_DATA,
  KEDOLIK_STAKE_LOCK_PROGRAM_ID,
  KEDOLIK_STAKE_LOCK_V1,
  getKedolikStakeLockExplorerUrl,
} from './kedolikStakeLockV1';

export type KedolikProgramKey =
  | 'kedolikStakeLock'
  | 'kedolikLocker'
  | 'kedolikStaking';

export const KEDOLIK_DEVNET_CONFIG = {
  cluster: KEDOLIK_STAKE_LOCK_V1.cluster,
  stakeLockProgramId: KEDOLIK_STAKE_LOCK_V1.programId,
  lockerProgramId: KEDOLIK_STAKE_LOCK_V1.programId,
  kedolikStakingProgramId: KEDOLIK_STAKE_LOCK_V1.programId,
  adminConfigPda: KEDOLIK_STAKE_LOCK_V1.adminConfigPda,
  programData: KEDOLIK_STAKE_LOCK_V1.programData,
  upgradeAuthority: KEDOLIK_STAKE_LOCK_V1.upgradeAuthority,
  currentStakingAdmin: KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin,
  deployerWallet: KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin,
  feeReceiverWallet: KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin,
} as const;

export const KEDOLIK_INTERNAL_PROGRAM_NAMES: Record<KedolikProgramKey, string> = {
  kedolikStakeLock: 'kedolik_stake_lock',
  kedolikLocker: 'kedolik_stake_lock',
  kedolikStaking: 'kedolik_stake_lock',
};

export const KEDOLIK_PROGRAM_LABELS: Record<KedolikProgramKey, string> = {
  kedolikStakeLock: 'Kedolik Stake Lock V1',
  kedolikLocker: 'Kedolik Locker',
  kedolikStaking: 'Kedolik Staking',
};

export const KEDOLIK_DEVNET_PUBLIC_KEYS = {
  stakeLockProgram: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
  lockerProgram: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
  kedolikStakingProgram: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
  adminConfig: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG,
  programData: KEDOLIK_STAKE_LOCK_PROGRAM_DATA,
  deployerWallet: KEDOLIK_STAKE_LOCK_CURRENT_ADMIN,
  feeReceiverWallet: KEDOLIK_STAKE_LOCK_CURRENT_ADMIN,
};

export const KEDOLIK_DEVNET_DEPLOYMENT = {
  preparedStatus: 'replaced',
  liveStatus: 'live',
  network: KEDOLIK_STAKE_LOCK_V1.cluster,
  notes: [
    'Legacy staking, mint-wrapper, and locker programs have been replaced by the combined Stake Lock V1 program.',
    'No staking pool instance exists yet on mainnet; the staking admin must initialize one.',
  ],
  programsLive: true,
};

export const KEDOLIK_DEVNET_SOURCE_CHECK = {
  frontendDevnet: null,
  frontendDevnetLive: null,
  stakeLockV1: KEDOLIK_STAKE_LOCK_V1,
};

export const KEDOLIK_DEPLOYMENT_PENDING = false;

export const KEDOLIK_DEVNET_LIVE_MESSAGES = {
  staking: 'Kedolik Staking is live through the Stake Lock V1 mainnet program.',
  locker: 'Kedolik Locker is now live.',
  testObjects: 'No staking pool instance has been created yet on mainnet.',
} as const;

export const KEDOLIK_DEVNET_STAKING_LIVE = {
  pool: '',
  poolId: '',
  stakeVault: '',
  rewardVault: '',
  stakeTokenMint: '',
  rewardTokenMint: '',
} as const;

export const KEDOLIK_DEVNET_LOCKER_LIVE = {
  escrow: '',
  escrowTokenAccount: '',
  tokenMint: KEDOLIK_STAKE_LOCK_V1.mainTokenMint,
  recipient: KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin,
} as const;

export const getKedolikExplorerAccountUrl = getKedolikStakeLockExplorerUrl;

export const KEDOLIK_PROGRAM_ADDRESSES: Record<KedolikProgramKey, string> = {
  kedolikStakeLock: KEDOLIK_DEVNET_CONFIG.stakeLockProgramId,
  kedolikLocker: KEDOLIK_DEVNET_CONFIG.lockerProgramId,
  kedolikStaking: KEDOLIK_DEVNET_CONFIG.kedolikStakingProgramId,
};

export const toKedolikPublicKey = (value: string) => new PublicKey(value);
