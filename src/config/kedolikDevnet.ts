import { PublicKey } from '@solana/web3.js';
import preparedDevnetConfig from '../../devnet-prepared.json';
import liveDevnetSummary from '../../devnet-live-summary.json';
import liveLockerConfig from '../../devnet-locker-live.json';
import liveStakingConfig from '../../devnet-staking-live.json';
import { STAKING_LOCKING_DEVNET } from '../../frontend-devnet.ts';
import { STAKING_LOCKING_DEVNET_LIVE } from '../../frontend-devnet-live.ts';

export type KedolikProgramKey =
  | 'kedolikLocker'
  | 'kedolikStaking'
  | 'kedolikMintWrapper';

export const KEDOLIK_DEVNET_CONFIG = {
  cluster: STAKING_LOCKING_DEVNET_LIVE.cluster,
  lockerProgramId: STAKING_LOCKING_DEVNET_LIVE.lockerProgramId,
  kedolikStakingProgramId: STAKING_LOCKING_DEVNET_LIVE.quarryMineProgramId,
  kedolikMintWrapperProgramId: STAKING_LOCKING_DEVNET_LIVE.quarryMintWrapperProgramId,
  deployerWallet: STAKING_LOCKING_DEVNET_LIVE.deployerWallet,
  feeReceiverWallet: STAKING_LOCKING_DEVNET_LIVE.feeReceiverWallet,
} as const;

export const KEDOLIK_INTERNAL_PROGRAM_NAMES: Record<KedolikProgramKey, string> = {
  kedolikLocker: 'locker',
  kedolikStaking: 'quarry_mine',
  kedolikMintWrapper: 'quarry_mint_wrapper',
};

export const KEDOLIK_PROGRAM_LABELS: Record<KedolikProgramKey, string> = {
  kedolikLocker: 'Kedolik Locker',
  kedolikStaking: 'Kedolik Staking',
  kedolikMintWrapper: 'Kedolik Mint Wrapper',
};

export const KEDOLIK_DEVNET_PUBLIC_KEYS = {
  lockerProgram: new PublicKey(KEDOLIK_DEVNET_CONFIG.lockerProgramId),
  kedolikStakingProgram: new PublicKey(KEDOLIK_DEVNET_CONFIG.kedolikStakingProgramId),
  kedolikMintWrapperProgram: new PublicKey(KEDOLIK_DEVNET_CONFIG.kedolikMintWrapperProgramId),
  deployerWallet: new PublicKey(KEDOLIK_DEVNET_CONFIG.deployerWallet),
  feeReceiverWallet: new PublicKey(KEDOLIK_DEVNET_CONFIG.feeReceiverWallet),
};

export const KEDOLIK_DEVNET_DEPLOYMENT = {
  preparedStatus: preparedDevnetConfig.status,
  liveStatus: liveDevnetSummary.status,
  network: liveDevnetSummary.network,
  notes: liveDevnetSummary.notes,
  programsLive: liveDevnetSummary.programs_live,
};

export const KEDOLIK_DEVNET_SOURCE_CHECK = {
  frontendDevnet: STAKING_LOCKING_DEVNET,
  frontendDevnetLive: STAKING_LOCKING_DEVNET_LIVE,
  preparedPrograms: preparedDevnetConfig.programs,
  liveStaking: liveStakingConfig,
  liveLocker: liveLockerConfig,
};

export const KEDOLIK_DEPLOYMENT_PENDING = false;

export const KEDOLIK_DEVNET_LIVE_MESSAGES = {
  staking: 'Kedolik Staking is live on devnet.',
  locker: 'Kedolik Locker is live on devnet.',
  testObjects: 'Devnet test pool and sample vesting escrow are available.',
} as const;

export const KEDOLIK_DEVNET_STAKING_LIVE = {
  mintWrapper: liveStakingConfig.mint_wrapper,
  rewarder: liveStakingConfig.rewarder,
  quarry: liveStakingConfig.quarry,
  minter: liveStakingConfig.minter,
  miner: liveStakingConfig.miner,
  stakeTokenMint: liveStakingConfig.stake_token_mint,
  rewardTokenMint: liveStakingConfig.reward_token_mint,
  userStakeTokenAccount: liveStakingConfig.user_stake_token_account,
  userRewardTokenAccount: liveStakingConfig.user_reward_token_account,
} as const;

export const KEDOLIK_DEVNET_LOCKER_LIVE = {
  escrow: liveLockerConfig.escrow,
  escrowTokenAccount: liveLockerConfig.escrow_token_account,
  tokenMint: liveLockerConfig.token_mint,
  recipient: liveLockerConfig.recipient,
} as const;

export const getKedolikExplorerAccountUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=${KEDOLIK_DEVNET_CONFIG.cluster}`;

export const KEDOLIK_PROGRAM_ADDRESSES: Record<KedolikProgramKey, string> = {
  kedolikLocker: KEDOLIK_DEVNET_CONFIG.lockerProgramId,
  kedolikStaking: KEDOLIK_DEVNET_CONFIG.kedolikStakingProgramId,
  kedolikMintWrapper: KEDOLIK_DEVNET_CONFIG.kedolikMintWrapperProgramId,
};
