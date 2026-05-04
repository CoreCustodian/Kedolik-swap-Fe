import { PublicKey } from '@solana/web3.js';

export const KEDOLIK_STAKE_LOCK_V1 = {
  cluster: 'devnet',
  programId: '6M6TzGRSRqYxYmAihrXgF6MrmrCJno4RK9mEDdtkanCW',
  programData: '9YB6N5m85wC2rGLaAmzXEEUbJ1stL7daTBrjzvePfefr',
  upgradeAuthority: '68ntKmiyhSdRT448Hj1VPW19a7EERJHCcGyjbmodVqot',
  adminConfigPda: '6zJinApyxvq5FK84oQjvuwj4i1xnoLNbD28WEmmyDQPR',
  currentStakingAdmin: '68ntKmiyhSdRT448Hj1VPW19a7EERJHCcGyjbmodVqot',
  expectedIdlPath: 'staking-locking/target/idl/kedolik_stake_lock.json',
  expectedFrontendExportPath: 'staking-locking/deployments/frontend-stake-lock-v1-devnet.ts',
} as const;

export const KEDOLIK_STAKE_LOCK_PROGRAM_ID = new PublicKey(KEDOLIK_STAKE_LOCK_V1.programId);
export const KEDOLIK_STAKE_LOCK_PROGRAM_DATA = new PublicKey(KEDOLIK_STAKE_LOCK_V1.programData);
export const KEDOLIK_STAKE_LOCK_ADMIN_CONFIG = new PublicKey(KEDOLIK_STAKE_LOCK_V1.adminConfigPda);
export const KEDOLIK_STAKE_LOCK_CURRENT_ADMIN = new PublicKey(
  KEDOLIK_STAKE_LOCK_V1.currentStakingAdmin
);

export const KEDOLIK_STAKE_LOCK_DEPLOYMENT_COSTS = {
  observedDevnetProgramDeploySol: 2.70603068,
  createStakingPoolRentOnlySol: 0.00649368,
  userStakePositionRentSol: 0.00162168,
  tokenLockRentSol: 0.00179568,
  createLockRentOnlySol: 0.00383496,
  adminConfigRentSol: 0.00117624,
} as const;

export const getKedolikStakeLockExplorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=${KEDOLIK_STAKE_LOCK_V1.cluster}`;
