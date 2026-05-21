import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  KEDOLIK_STAKE_LOCK_ADMIN_CONFIG,
  KEDOLIK_STAKE_LOCK_CURRENT_ADMIN,
  KEDOLIK_STAKE_LOCK_PROGRAM_ID,
  KEDOLIK_STAKE_LOCK_V1,
} from '../config/kedolikStakeLockV1';
import { confirmTransactionWithBlockhash } from '../utils/transactionConfirmation';

const ADMIN_CONFIG_DISCRIMINATOR = Buffer.from('9c0a4fa147093e4d', 'hex');
const STAKING_POOL_DISCRIMINATOR = Buffer.from('cb13d6dcdc9a1866', 'hex');
const USER_POSITION_DISCRIMINATOR = Buffer.from('4ea51e6fab7d0bdc', 'hex');

const INITIALIZE_ADMIN_CONFIG_DISCRIMINATOR = Buffer.from('85d6230232e85fa4', 'hex');
const TRANSFER_ADMIN_AUTHORITY_DISCRIMINATOR = Buffer.from('c60bb6cf910b87d7', 'hex');
const INITIALIZE_STAKING_POOL_DISCRIMINATOR = Buffer.from('e79bd84cb9d32297', 'hex');
const FUND_REWARDS_DISCRIMINATOR = Buffer.from('7240a370afa71379', 'hex');
const OPEN_POSITION_DISCRIMINATOR = Buffer.from('87802f4d0f98f031', 'hex');
const STAKE_DISCRIMINATOR = Buffer.from('ceb0ca12c8d1b36c', 'hex');
const SET_REWARD_RATE_DISCRIMINATOR = Buffer.from('fdc9be1430267822', 'hex');
const CLAIM_REWARDS_DISCRIMINATOR = Buffer.from('0490844774179750', 'hex');
const UNSTAKE_DISCRIMINATOR = Buffer.from('5a5f6b2acd7c32e1', 'hex');
const RECLAIM_UNCLAIMED_REWARDS_DISCRIMINATOR = Buffer.from('81e839e301f1a889', 'hex');
const CLOSE_POSITION_DISCRIMINATOR = Buffer.from('7b86510031446262', 'hex');
const STAKING_POOL_STORAGE_KEY = 'kedolik:stake-lock-v1:mainnet-beta:pools';
export const KEDOLIK_STAKING_POOLS_UPDATED_EVENT = 'kedolik:staking-pools-updated';
export const KEDOLIK_NO_STAKING_POOL_INSTANCE_MESSAGE =
  'No Staking Pool Instance has been deployed yet. Once the admin team deploys the staking pool instance, an official announcement will be shared across our social media channels.';
const ACC_REWARD_SCALE = 1_000_000_000_000n;

export interface KedolikStakingObjectStatus {
  address: string;
  exists: boolean;
}

export interface KedolikStakingQuarrySummary {
  id: string;
  title: string;
  description: string;
  quarryAddress: string;
  rewarderAddress: string;
  mintWrapperAddress: string;
  minterAddress: string;
  poolAdminAddress: string;
  poolAdminExists: boolean;
  poolCreator: string | null;
  reservedRewards: string | null;
  rewardEndTs: number | null;
  reclaimableRewards: string | null;
  requiredRewardAmount: string | null;
  fundedRewardAmount: string | null;
  isFullyFunded: boolean;
  isLegacy: boolean;
  sampleMinerAddress: string;
  derivedUserMinerAddress: string | null;
  stakeTokenMint: string;
  rewardTokenMint: string;
  stakeTokenSymbol: string;
  rewardTokenSymbol: string;
  stakeTokenDecimals: number | null;
  rewardTokenDecimals: number | null;
  totalStaked: string | null;
  stakers: string | null;
  rewardRate: string | null;
  rewardsPerSecondEstimate: string | null;
  rewardDurationSeconds: number | null;
  stakingStartedAt: number | null;
  stakingEndsAt: number | null;
  stakingSecondsRemaining: number | null;
  isExpired: boolean;
  userWalletBalance: string | null;
  userRewardWalletBalance: string | null;
  userStake: string | null;
  claimableRewards: string | null;
  claimableRewardsState: 'ready' | 'refreshing' | 'pending';
  lastCheckpointTs: number | null;
  hasMiner: boolean;
  status: 'live' | 'awaiting_client' | 'awaiting_deployment' | 'awaiting_rewards' | 'legacy';
  statusMessage: string;
  sampleStakeWalletBalance: string | null;
  sampleRewardWalletBalance: string | null;
  objectStatuses: {
    mintWrapper: KedolikStakingObjectStatus;
    rewarder: KedolikStakingObjectStatus;
    quarry: KedolikStakingObjectStatus;
    minter: KedolikStakingObjectStatus;
    sampleMiner: KedolikStakingObjectStatus;
    userMiner: KedolikStakingObjectStatus | null;
  };
}

export interface KedolikStakingService {
  cluster: 'mainnet-beta';
  kedolikStakingProgramId: string;
  fetchLiveQuarries: (walletPublicKey?: PublicKey | null) => Promise<KedolikStakingQuarrySummary[]>;
  stake: (amountRaw: string, poolAddress?: string) => Promise<string>;
  unstake: (amountRaw: string, poolAddress?: string) => Promise<string>;
  claimRewards: (poolAddress?: string) => Promise<string>;
  reclaimUnclaimedRewards: (poolAddress?: string) => Promise<string>;
  getUserMinerAddress: (authority: PublicKey) => string;
  getStatusMessage: () => string;
}

export interface KedolikStakeLockAdminConfig {
  address: string;
  authority: string;
  bump: number;
  exists: boolean;
}

export interface KedolikStoredStakingPool {
  poolId: string;
  pool: string;
  stakeMint: string;
  rewardMint: string;
  poolAdmin?: string;
  stakeVault: string;
  rewardVault: string;
  rewardRatePerSecond: string;
  rewardAmountRaw: string;
  fundedRewardAmountRaw?: string;
  rewardDurationSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateKedolikStakingPoolInput {
  stakeMint: string;
  rewardMint: string;
  poolId: string;
  rewardAmountRaw: string;
  rewardDurationSeconds: number;
}

export interface KedolikStakingPoolAddresses {
  poolId: string;
  pool: string;
  poolAdmin: string;
  stakeVault: string;
  rewardVault: string;
}

export interface KedolikStakingTokenBalance {
  mint: string;
  tokenAccount: string;
  decimals: number;
  balanceRaw: string;
}

export type KedolikStakingAdminPoolStatus =
  | 'active'
  | 'unfunded'
  | 'low_rewards'
  | 'expired'
  | 'rewards_stopped'
  | 'legacy'
  | 'missing';

export interface KedolikStakingAdminPool {
  poolId: string;
  pool: string;
  stakeMint: string;
  rewardMint: string;
  poolAdmin: string;
  poolAdminExists: boolean;
  poolCreator: string | null;
  reservedRewards: string | null;
  rewardEndTs: number | null;
  reclaimableRewards: string | null;
  requiredRewardAmount: string | null;
  fundedRewardAmount: string | null;
  isFullyFunded: boolean;
  isLegacy: boolean;
  stakeVault: string;
  rewardVault: string;
  stakeTokenDecimals: number | null;
  rewardTokenDecimals: number | null;
  totalStaked: string | null;
  rewardRatePerSecond: string;
  rewardVaultBalance: string | null;
  stakeVaultBalance: string | null;
  status: KedolikStakingAdminPoolStatus;
  statusLabel: string;
  statusMessage: string;
  secondsOfRewardsRemaining: number | null;
  rewardDurationSeconds: number | null;
  stakingStartedAt: number | null;
  stakingEndsAt: number | null;
  stakingSecondsRemaining: number | null;
  isExpired: boolean;
  exists: boolean;
  createdAt: number;
  updatedAt: number;
}

interface DecodedUserPosition {
  user: PublicKey;
  pool: PublicKey;
  amount: bigint;
  rewardDebt: bigint;
  rewardsOwed: bigint;
}

interface DecodedStakingPoolState {
  poolId: bigint;
  adminConfig: PublicKey;
  stakeMint: PublicKey;
  rewardMint: PublicKey;
  stakeVault: PublicKey;
  rewardVault: PublicKey;
  totalStaked: bigint;
  rewardRatePerSecond: bigint;
  lastUpdateTs: number;
  rewardPerTokenStored: bigint;
}

interface DecodedStakingPoolAdminState {
  pool: PublicKey | null;
  creator: PublicKey;
  rewardDurationSeconds: bigint | null;
  rewardEndTs: number;
  reservedRewards: bigint;
}

interface PoolAdminAccountState {
  address: PublicKey;
  exists: boolean;
  decoded: DecodedStakingPoolAdminState | null;
}

interface EnsureAtaResult {
  address: PublicKey;
  instruction: TransactionInstruction | null;
}

const writeU64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
};

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32));

const readU64 = (data: Buffer, offset: number) =>
  data.length >= offset + 8 ? data.readBigUInt64LE(offset) : 0n;

const readI64 = (data: Buffer, offset: number) =>
  data.length >= offset + 8 ? Number(data.readBigInt64LE(offset)) : 0;

const readU128 = (data: Buffer, offset: number) => {
  if (data.length < offset + 16) {
    return 0n;
  }

  return data.readBigUInt64LE(offset) + (data.readBigUInt64LE(offset + 8) << 64n);
};

const toPublicKey = (value: string) => {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid Solana address: ${value}`);
  }
};

export const getKedolikStakingErrorMessage = (
  error: unknown,
  fallback = 'Unable to load Kedolik Staking.'
) => {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/429|rate limits? exceeded/i.test(message)) {
    return 'Mainnet RPC rate limit reached while loading staking data. Please wait a moment and refresh.';
  }

  return message || fallback;
};

const assertWallet = (wallet?: AnchorWallet | null): AnchorWallet => {
  if (!wallet?.publicKey) {
    throw new Error('Connect a wallet before submitting staking transactions.');
  }

  return wallet;
};

const assertU64String = (value: string, label: string) => {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be an unsigned integer.`);
  }

  const parsed = BigInt(normalized);

  if (parsed < 0n || parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} must fit in u64.`);
  }

  return parsed;
};

const assertRawAmount = (amountRaw: string): bigint => {
  const amount = assertU64String(amountRaw, 'Amount');

  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }

  return amount;
};

const getTokenProgramForMint = async (connection: Connection, mint: PublicKey) => {
  const accountInfo = await connection.getAccountInfo(mint, 'confirmed');

  if (!accountInfo) {
    throw new Error('Token mint was not found on the current RPC endpoint.');
  }

  if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error('Stake Lock V1 only supports classic SPL Token mints.');
  }

  await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
  return TOKEN_PROGRAM_ID;
};

const ensureAta = async (
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey
): Promise<EnsureAtaResult> => {
  const address = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const accountInfo = await connection.getAccountInfo(address, 'confirmed');

  return {
    address,
    instruction: accountInfo
      ? null
      : createAssociatedTokenAccountIdempotentInstruction(
          payer,
          address,
          owner,
          mint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
  };
};

const sendAndConfirmStakingTransaction = async (
  connection: Connection,
  wallet: AnchorWallet,
  transaction: Transaction
) => {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signedTransaction = await wallet.signTransaction(transaction);
  let signature: string;

  try {
    signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    if (error instanceof SendTransactionError) {
      const logs = await error.getLogs(connection).catch(() => null);
      throw new Error(logs?.length ? `${error.message}\n${logs.join('\n')}` : error.message);
    }

    throw error;
  }

  const confirmation = await confirmTransactionWithBlockhash(
    connection,
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  if (confirmation.value?.err) {
    throw new Error(`Staking transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
};

export const getStakingPoolPda = (stakeMint: PublicKey, rewardMint: PublicKey, poolId: bigint) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from('staking_pool'),
      KEDOLIK_STAKE_LOCK_ADMIN_CONFIG.toBuffer(),
      stakeMint.toBuffer(),
      rewardMint.toBuffer(),
      writeU64(poolId),
    ],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

export const getStakeVaultPda = (pool: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), pool.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

export const getRewardVaultPda = (pool: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('reward_vault'), pool.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

export const getPoolAdminPda = (pool: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('pool_admin'), pool.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

export const getUserStakePositionPda = (pool: PublicKey, user: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('position'), pool.toBuffer(), user.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

const getStoredOrDerivedPoolAdmin = (poolConfig: KedolikStoredStakingPool) => {
  try {
    return poolConfig.poolAdmin ? toPublicKey(poolConfig.poolAdmin) : getPoolAdminPda(toPublicKey(poolConfig.pool));
  } catch {
    return getPoolAdminPda(toPublicKey(poolConfig.pool));
  }
};

export const deriveKedolikStakingPoolAddresses = (
  stakeMintAddress: string,
  rewardMintAddress: string,
  poolIdValue: string
): KedolikStakingPoolAddresses => {
  const stakeMint = toPublicKey(stakeMintAddress);
  const rewardMint = toPublicKey(rewardMintAddress);
  const poolId = assertU64String(poolIdValue, 'Pool ID');
  const pool = getStakingPoolPda(stakeMint, rewardMint, poolId);

  return {
    poolId: poolId.toString(),
    pool: pool.toString(),
    poolAdmin: getPoolAdminPda(pool).toString(),
    stakeVault: getStakeVaultPda(pool).toString(),
    rewardVault: getRewardVaultPda(pool).toString(),
  };
};

export const fetchKedolikStakeLockAdminConfig = async (
  connection: Connection
): Promise<KedolikStakeLockAdminConfig> => {
  const accountInfo = await connection.getAccountInfo(KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, 'confirmed');

  if (!accountInfo) {
    return {
      address: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG.toString(),
      authority: KEDOLIK_STAKE_LOCK_CURRENT_ADMIN.toString(),
      bump: 0,
      exists: false,
    };
  }

  const data = Buffer.from(accountInfo.data);

  if (!data.subarray(0, 8).equals(ADMIN_CONFIG_DISCRIMINATOR) || data.length < 41) {
    throw new Error('Admin config account layout does not match Stake Lock V1.');
  }

  return {
    address: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG.toString(),
    authority: readPublicKey(data, 8).toString(),
    bump: data[40],
    exists: true,
  };
};

const getStoredPools = (): KedolikStoredStakingPool[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STAKING_POOL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as KedolikStoredStakingPool[] : [];
  } catch {
    return [];
  }
};

const saveStoredPool = (pool: KedolikStoredStakingPool) => {
  if (typeof window === 'undefined') {
    return;
  }

  const pools = getStoredPools().filter((candidate) => candidate.pool !== pool.pool);
  window.localStorage.setItem(
    STAKING_POOL_STORAGE_KEY,
    JSON.stringify([{ ...pool, updatedAt: Date.now() }, ...pools])
  );
  window.dispatchEvent(new Event(KEDOLIK_STAKING_POOLS_UPDATED_EVENT));
};

const updateStoredPool = (poolAddress: string, updates: Partial<KedolikStoredStakingPool>) => {
  if (typeof window === 'undefined') {
    return;
  }

  const pools = getStoredPools();
  const nextPools = pools.map((pool) =>
    pool.pool === poolAddress ? { ...pool, ...updates, updatedAt: Date.now() } : pool
  );

  window.localStorage.setItem(STAKING_POOL_STORAGE_KEY, JSON.stringify(nextPools));
  window.dispatchEvent(new Event(KEDOLIK_STAKING_POOLS_UPDATED_EVENT));
};

export const getKedolikStoredStakingPools = () => getStoredPools();

const decodeOnChainPoolAccount = (
  publicKey: PublicKey,
  data: Buffer
): KedolikStoredStakingPool | null => {
  const state = decodeStakingPoolState(data);

  if (!state) {
    return null;
  }

  if (!state.adminConfig.equals(KEDOLIK_STAKE_LOCK_ADMIN_CONFIG)) {
    return null;
  }

  return {
    poolId: state.poolId.toString(),
    pool: publicKey.toString(),
    stakeMint: state.stakeMint.toString(),
    rewardMint: state.rewardMint.toString(),
    poolAdmin: getPoolAdminPda(publicKey).toString(),
    stakeVault: state.stakeVault.toString(),
    rewardVault: state.rewardVault.toString(),
    rewardRatePerSecond: state.rewardRatePerSecond.toString(),
    rewardAmountRaw: '0',
    fundedRewardAmountRaw: '0',
    rewardDurationSeconds: 0,
    createdAt: 0,
    updatedAt: Date.now(),
  };
};

const decodeStakingPoolState = (data: Buffer): DecodedStakingPoolState | null => {
  if (!data.subarray(0, 8).equals(STAKING_POOL_DISCRIMINATOR) || data.length < 219) {
    return null;
  }

  return {
    poolId: readU64(data, 8),
    adminConfig: readPublicKey(data, 16),
    stakeMint: readPublicKey(data, 48),
    rewardMint: readPublicKey(data, 80),
    stakeVault: readPublicKey(data, 112),
    rewardVault: readPublicKey(data, 144),
    totalStaked: readU64(data, 176),
    rewardRatePerSecond: readU64(data, 184),
    lastUpdateTs: readI64(data, 192),
    rewardPerTokenStored: readU128(data, 200),
  };
};

const isReasonableRewardEndTs = (timestamp: number) =>
  timestamp === 0 || (timestamp >= 1_500_000_000 && timestamp <= 4_500_000_000);

const decodeStakingPoolAdminState = (
  data: Buffer,
  expectedPool: PublicKey
): DecodedStakingPoolAdminState | null => {
  type LayoutCandidate = {
    poolOffset: number | null;
    creatorOffset: number;
    durationOffset: number | null;
    rewardEndOffset: number;
    reservedOffset: number;
  };

  const candidates: LayoutCandidate[] = [
    { poolOffset: 8, creatorOffset: 40, durationOffset: 72, rewardEndOffset: 80, reservedOffset: 88 },
    { poolOffset: 8, creatorOffset: 40, durationOffset: null, rewardEndOffset: 72, reservedOffset: 80 },
    { poolOffset: null, creatorOffset: 8, durationOffset: 40, rewardEndOffset: 48, reservedOffset: 56 },
    { poolOffset: null, creatorOffset: 8, durationOffset: null, rewardEndOffset: 40, reservedOffset: 48 },
    { poolOffset: 40, creatorOffset: 8, durationOffset: 72, rewardEndOffset: 80, reservedOffset: 88 },
    { poolOffset: 40, creatorOffset: 8, durationOffset: null, rewardEndOffset: 72, reservedOffset: 80 },
  ];

  let best: { decoded: DecodedStakingPoolAdminState; score: number } | null = null;

  for (const candidate of candidates) {
    const neededOffsets = [
      candidate.creatorOffset + 32,
      candidate.rewardEndOffset + 8,
      candidate.reservedOffset + 8,
      candidate.poolOffset === null ? 0 : candidate.poolOffset + 32,
      candidate.durationOffset === null ? 0 : candidate.durationOffset + 8,
    ];

    if (data.length < Math.max(...neededOffsets)) {
      continue;
    }

    const decodedPool = candidate.poolOffset === null ? null : readPublicKey(data, candidate.poolOffset);
    const creator = readPublicKey(data, candidate.creatorOffset);
    const rewardEndTs = readI64(data, candidate.rewardEndOffset);
    const reservedRewards = readU64(data, candidate.reservedOffset);
    const rewardDurationSeconds =
      candidate.durationOffset === null ? null : readU64(data, candidate.durationOffset);

    let score = 0;

    if (decodedPool) {
      score += decodedPool.equals(expectedPool) ? 50 : -50;
    }

    score += isReasonableRewardEndTs(rewardEndTs) ? 20 : -20;

    if (!creator.equals(SystemProgram.programId)) {
      score += 2;
    }

    if (rewardEndTs > 0) {
      score += 2;
    }

    if (!best || score > best.score) {
      best = {
        score,
        decoded: {
          pool: decodedPool,
          creator,
          rewardDurationSeconds,
          rewardEndTs,
          reservedRewards,
        },
      };
    }
  }

  return best && best.score > 0 ? best.decoded : null;
};

const fetchPoolAdminAccountState = async (
  connection: Connection,
  pool: PublicKey,
  poolConfig?: KedolikStoredStakingPool
): Promise<PoolAdminAccountState> => {
  const address = poolConfig ? getStoredOrDerivedPoolAdmin(poolConfig) : getPoolAdminPda(pool);
  const accountInfo = await connection.getAccountInfo(address, 'confirmed');

  if (!accountInfo || !accountInfo.owner.equals(KEDOLIK_STAKE_LOCK_PROGRAM_ID)) {
    return {
      address,
      exists: false,
      decoded: null,
    };
  }

  const decoded = decodeStakingPoolAdminState(Buffer.from(accountInfo.data), pool);

  return {
    address,
    exists: Boolean(decoded),
    decoded,
  };
};

const fetchPoolAdminAccountStates = async (
  connection: Connection,
  pools: KedolikStoredStakingPool[]
) => {
  const states = new Map<string, PoolAdminAccountState>();
  const batchSize = 100;

  for (let index = 0; index < pools.length; index += batchSize) {
    const batch = pools.slice(index, index + batchSize);
    const addresses = batch.map((poolConfig) => getStoredOrDerivedPoolAdmin(poolConfig));

    let accountInfos: Awaited<ReturnType<Connection['getMultipleAccountsInfo']>>;

    try {
      accountInfos = await connection.getMultipleAccountsInfo(addresses, 'confirmed');
    } catch (error) {
      throw new Error(getKedolikStakingErrorMessage(error));
    }

    batch.forEach((poolConfig, batchIndex) => {
      const pool = toPublicKey(poolConfig.pool);
      const address = addresses[batchIndex];
      const accountInfo = accountInfos[batchIndex];
      const decoded = accountInfo?.owner.equals(KEDOLIK_STAKE_LOCK_PROGRAM_ID)
        ? decodeStakingPoolAdminState(Buffer.from(accountInfo.data), pool)
        : null;

      states.set(poolConfig.pool, {
        address,
        exists: Boolean(decoded),
        decoded,
      });
    });
  }

  return states;
};

const getPoolAdminAccountOrThrow = async (
  connection: Connection,
  pool: PublicKey,
  poolConfig?: KedolikStoredStakingPool
) => {
  const poolAdminAccount = await fetchPoolAdminAccountState(connection, pool, poolConfig);

  if (!poolAdminAccount.exists) {
    throw new Error('This staking pool is legacy and cannot be used with the upgraded PoolAdmin staking program.');
  }

  return poolAdminAccount;
};

const fetchOnChainPools = async (connection: Connection) => {
  const accounts = await connection.getProgramAccounts(KEDOLIK_STAKE_LOCK_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      {
        memcmp: {
          offset: 0,
          encoding: 'base64',
          bytes: STAKING_POOL_DISCRIMINATOR.toString('base64'),
        },
      },
    ],
  });

  return accounts
    .map(({ pubkey, account }) => decodeOnChainPoolAccount(pubkey, Buffer.from(account.data)))
    .filter((pool): pool is KedolikStoredStakingPool => pool !== null);
};

const getConfiguredPools = async (connection: Connection) => {
  const stored = getStoredPools();
  const onChain = await fetchOnChainPools(connection).catch(() => []);
  const byPool = new Map<string, KedolikStoredStakingPool>();
  const withDerivedPoolAdmin = (pool: KedolikStoredStakingPool): KedolikStoredStakingPool => {
    const poolPublicKey = toPublicKey(pool.pool);

    return {
      ...pool,
      poolAdmin: pool.poolAdmin ?? getPoolAdminPda(poolPublicKey).toString(),
      fundedRewardAmountRaw: pool.fundedRewardAmountRaw ?? '0',
    };
  };

  stored.forEach((pool) => byPool.set(pool.pool, withDerivedPoolAdmin(pool)));
  onChain.forEach((pool) => {
    const storedPool = byPool.get(pool.pool);
    const storedDuration = Number(storedPool?.rewardDurationSeconds || 0);
    const storedCreatedAt = Number(storedPool?.createdAt || 0);

    byPool.set(pool.pool, {
      ...storedPool,
      ...pool,
      poolAdmin: storedPool?.poolAdmin ?? pool.poolAdmin,
      rewardAmountRaw: storedPool?.rewardAmountRaw ?? pool.rewardAmountRaw,
      fundedRewardAmountRaw: storedPool?.fundedRewardAmountRaw ?? pool.fundedRewardAmountRaw ?? '0',
      rewardDurationSeconds: storedDuration > 0 ? storedDuration : pool.rewardDurationSeconds,
      createdAt: storedCreatedAt > 0 ? storedCreatedAt : pool.createdAt,
      updatedAt: Math.max(storedPool?.updatedAt ?? 0, pool.updatedAt ?? 0),
    });
  });

  return [...byPool.values()];
};

const getUpgradedConfiguredPools = async (connection: Connection) => {
  const pools = await getConfiguredPools(connection);

  if (pools.length === 0) {
    return {
      pools: [] as KedolikStoredStakingPool[],
      poolAdminStates: new Map<string, PoolAdminAccountState>(),
    };
  }

  const poolAdminStates = await fetchPoolAdminAccountStates(connection, pools);

  return {
    pools: pools.filter((pool) => poolAdminStates.get(pool.pool)?.exists),
    poolAdminStates,
  };
};

const getRawTokenAccountBalance = async (connection: Connection, tokenAccount: PublicKey) => {
  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
    return balance.value.amount;
  } catch {
    return null;
  }
};

const getPoolTiming = (
  poolConfig: KedolikStoredStakingPool,
  poolAdminState?: DecodedStakingPoolAdminState | null
) => {
  const rewardDurationSeconds = Number(poolConfig.rewardDurationSeconds || 0);
  const createdAtMs = Number(poolConfig.createdAt || 0);
  const now = Math.floor(Date.now() / 1000);

  if (poolAdminState?.rewardEndTs && poolAdminState.rewardEndTs > 0) {
    const stakingEndsAt = poolAdminState.rewardEndTs;
    const stakingStartedAt =
      rewardDurationSeconds > 0 ? Math.max(0, stakingEndsAt - Math.floor(rewardDurationSeconds)) : null;

    return {
      rewardDurationSeconds:
        rewardDurationSeconds > 0
          ? Math.floor(rewardDurationSeconds)
          : poolAdminState.rewardDurationSeconds !== null
            ? Number(poolAdminState.rewardDurationSeconds)
            : null,
      stakingStartedAt,
      stakingEndsAt,
      stakingSecondsRemaining: Math.max(0, stakingEndsAt - now),
      isExpired: now >= stakingEndsAt,
    };
  }

  if (
    !Number.isFinite(rewardDurationSeconds) ||
    rewardDurationSeconds <= 0 ||
    !Number.isFinite(createdAtMs) ||
    createdAtMs <= 0
  ) {
    return {
      rewardDurationSeconds: null,
      stakingStartedAt: null,
      stakingEndsAt: null,
      stakingSecondsRemaining: null,
      isExpired: false,
    };
  }

  const stakingStartedAt = Math.floor(createdAtMs / 1000);
  const stakingEndsAt = stakingStartedAt + Math.floor(rewardDurationSeconds);
  const stakingSecondsRemaining = Math.max(0, stakingEndsAt - now);

  return {
    rewardDurationSeconds: Math.floor(rewardDurationSeconds),
    stakingStartedAt,
    stakingEndsAt,
    stakingSecondsRemaining,
    isExpired: now >= stakingEndsAt,
  };
};

const bigintFromString = (value: string | null | undefined) => {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
};

const getPoolFundingState = (
  poolConfig: KedolikStoredStakingPool,
  rewardVaultBalanceRaw: string | null
) => {
  const requiredRewardAmount = bigintFromString(poolConfig.rewardAmountRaw);
  const fundedRewardAmount = bigintFromString(poolConfig.fundedRewardAmountRaw);
  const rewardVaultBalance = bigintFromString(rewardVaultBalanceRaw);
  const isFullyFunded =
    requiredRewardAmount <= 0n
      ? rewardVaultBalance > 0n
      : fundedRewardAmount > 0n
        ? fundedRewardAmount >= requiredRewardAmount
        : rewardVaultBalance >= requiredRewardAmount;

  return {
    requiredRewardAmount: requiredRewardAmount.toString(),
    fundedRewardAmount: fundedRewardAmount.toString(),
    isFullyFunded,
  };
};

const getReclaimableRewards = (
  rewardVaultBalanceRaw: string | null,
  reservedRewards: bigint | null | undefined
) => {
  const rewardVaultBalance = bigintFromString(rewardVaultBalanceRaw);
  const reserved = reservedRewards ?? 0n;

  return rewardVaultBalance > reserved ? rewardVaultBalance - reserved : 0n;
};

const getWalletTokenBalance = async (
  connection: Connection,
  owner: PublicKey | null | undefined,
  mint: PublicKey,
  tokenProgram: PublicKey
) => {
  if (!owner) {
    return null;
  }

  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  return getRawTokenAccountBalance(connection, ata);
};

export const fetchKedolikWalletTokenBalance = async (
  connection: Connection,
  owner: PublicKey,
  mintAddress: string
): Promise<KedolikStakingTokenBalance> => {
  const mint = toPublicKey(mintAddress);
  const tokenProgram = await getTokenProgramForMint(connection, mint);
  const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgram);
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return {
    mint: mint.toString(),
    tokenAccount: tokenAccount.toString(),
    decimals: mintInfo.decimals,
    balanceRaw: (await getRawTokenAccountBalance(connection, tokenAccount)) ?? '0',
  };
};

const decodeUserPosition = (
  data: Buffer,
  expectedPool: PublicKey,
  expectedUser: PublicKey
): DecodedUserPosition | null => {
  if (!data.subarray(0, 8).equals(USER_POSITION_DISCRIMINATOR) || data.length < 8 + 64 + 8) {
    return null;
  }

  const firstKey = readPublicKey(data, 8);
  const secondKey = readPublicKey(data, 40);
  const firstOrderMatches = firstKey.equals(expectedUser) && secondKey.equals(expectedPool);
  const secondOrderMatches = firstKey.equals(expectedPool) && secondKey.equals(expectedUser);

  if (!firstOrderMatches && !secondOrderMatches) {
    return null;
  }

  const amountOffset = 72;
  const rewardsOwedOffset = amountOffset + 8;
  const rewardPerTokenPaidOffset = rewardsOwedOffset + 8;

  return {
    user: expectedUser,
    pool: expectedPool,
    amount: readU64(data, amountOffset),
    rewardDebt: readU128(data, rewardPerTokenPaidOffset),
    rewardsOwed: readU64(data, rewardsOwedOffset),
  };
};

const fetchUserPosition = async (
  connection: Connection,
  pool: PublicKey,
  user: PublicKey | null | undefined
) => {
  if (!user) {
    return {
      address: null,
      infoExists: false,
      decoded: null as DecodedUserPosition | null,
    };
  }

  const address = getUserStakePositionPda(pool, user);
  const accountInfo = await connection.getAccountInfo(address, 'confirmed');

  return {
    address,
    infoExists: Boolean(accountInfo),
    decoded: accountInfo ? decodeUserPosition(Buffer.from(accountInfo.data), pool, user) : null,
  };
};

const estimateClaimableRewards = (
  poolState: DecodedStakingPoolState | null,
  position: DecodedUserPosition | null,
  rewardEndTs?: number | null
) => {
  if (!position) {
    return null;
  }

  if (!poolState) {
    return position.rewardsOwed;
  }

  const now = Math.floor(Date.now() / 1000);

  let rewardPerTokenStored = poolState.rewardPerTokenStored;
  const accrualEndTs = rewardEndTs && rewardEndTs > 0 ? Math.min(now, rewardEndTs) : now;
  const elapsedSeconds = BigInt(Math.max(0, accrualEndTs - poolState.lastUpdateTs));

  if (poolState.totalStaked > 0n && poolState.rewardRatePerSecond > 0n && elapsedSeconds > 0n) {
    rewardPerTokenStored +=
      (elapsedSeconds * poolState.rewardRatePerSecond * ACC_REWARD_SCALE) / poolState.totalStaked;
  }

  const rewardPerTokenDelta =
    rewardPerTokenStored > position.rewardDebt ? rewardPerTokenStored - position.rewardDebt : 0n;

  return position.rewardsOwed + (position.amount * rewardPerTokenDelta) / ACC_REWARD_SCALE;
};

const getTokenDecimals = async (connection: Connection, mint: PublicKey) => {
  try {
    const mintInfo = await getMint(connection, mint, 'confirmed');
    return mintInfo.decimals;
  } catch {
    return null;
  }
};

const mapPoolToSummary = async (
  connection: Connection,
  poolConfig: KedolikStoredStakingPool,
  walletPublicKey?: PublicKey | null,
  preloadedPoolAdminAccountState?: PoolAdminAccountState
): Promise<KedolikStakingQuarrySummary> => {
  const pool = toPublicKey(poolConfig.pool);
  const stakeMint = toPublicKey(poolConfig.stakeMint);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const stakeVault = toPublicKey(poolConfig.stakeVault);
  const poolAdmin = getStoredOrDerivedPoolAdmin(poolConfig);
  const [stakeTokenProgram, rewardTokenProgram] = await Promise.all([
    getTokenProgramForMint(connection, stakeMint).catch(() => TOKEN_PROGRAM_ID),
    getTokenProgramForMint(connection, rewardMint).catch(() => TOKEN_PROGRAM_ID),
  ]);
  const [
    stakeTokenDecimals,
    rewardTokenDecimals,
    totalStaked,
    rewardVaultBalance,
    userWalletBalance,
    userRewardWalletBalance,
    position,
    poolAccountInfo,
    poolAdminAccountState,
  ] = await Promise.all([
    getTokenDecimals(connection, stakeMint),
    getTokenDecimals(connection, rewardMint),
    getRawTokenAccountBalance(connection, stakeVault),
    getRawTokenAccountBalance(connection, toPublicKey(poolConfig.rewardVault)),
    getWalletTokenBalance(connection, walletPublicKey, stakeMint, stakeTokenProgram),
    getWalletTokenBalance(connection, walletPublicKey, rewardMint, rewardTokenProgram),
    fetchUserPosition(connection, pool, walletPublicKey),
    connection.getAccountInfo(pool, 'confirmed'),
    preloadedPoolAdminAccountState ?? fetchPoolAdminAccountState(connection, pool, poolConfig),
  ]);
  const livePool = poolAccountInfo ? decodeStakingPoolState(Buffer.from(poolAccountInfo.data)) : null;
  const positionAddress = position.address?.toString() ?? null;
  const rewardRatePerSecond = livePool?.rewardRatePerSecond.toString() ?? poolConfig.rewardRatePerSecond ?? null;
  const totalStakedRaw = livePool?.totalStaked.toString() ?? totalStaked;
  const poolTiming = getPoolTiming(poolConfig, poolAdminAccountState.decoded);
  const effectiveRewardRatePerSecond = poolTiming.isExpired ? '0' : rewardRatePerSecond;
  const rewardRateYearly =
    effectiveRewardRatePerSecond && effectiveRewardRatePerSecond !== '0'
      ? (BigInt(effectiveRewardRatePerSecond) * 365n * 24n * 60n * 60n).toString()
      : null;
  const estimatedClaimableRewards = estimateClaimableRewards(
    livePool,
    position.decoded,
    poolTiming.stakingEndsAt
  );
  const userStake = position.decoded?.amount.toString() ?? '0';
  const claimableRewards = estimatedClaimableRewards?.toString() ?? '0';
  const hasPosition = Boolean(position.decoded);
  const fundingState = getPoolFundingState(poolConfig, rewardVaultBalance);
  const reservedRewards = poolAdminAccountState.decoded?.reservedRewards ?? null;
  const reclaimableRewards = getReclaimableRewards(rewardVaultBalance, reservedRewards);
  const isLegacy = !poolAdminAccountState.exists;
  const status: KedolikStakingQuarrySummary['status'] = !poolAccountInfo
    ? 'awaiting_deployment'
    : isLegacy
      ? 'legacy'
      : !fundingState.isFullyFunded
        ? 'awaiting_rewards'
        : 'live';
  const statusMessage = !poolAccountInfo
    ? 'Pool config is stored in the frontend, but the on-chain pool account was not found.'
    : isLegacy
      ? 'Legacy staking pool created before the PoolAdmin upgrade.'
      : !fundingState.isFullyFunded
        ? 'Pool is created, but rewards are not fully funded yet.'
        : 'Live Stake Lock V1 pool';
  const objectStatus = (address: string, exists: boolean): KedolikStakingObjectStatus => ({
    address,
    exists,
  });

  return {
    id: poolConfig.pool,
    title: `Stake Lock Pool #${poolConfig.poolId || '0'}`,
    description: 'Stake tokens, unstake, and claim rewards from the Kedolik Stake Lock V1 program.',
    quarryAddress: poolConfig.pool,
    rewarderAddress: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG.toString(),
    mintWrapperAddress: KEDOLIK_STAKE_LOCK_PROGRAM_ID.toString(),
    minterAddress: poolConfig.rewardVault,
    poolAdminAddress: poolAdmin.toString(),
    poolAdminExists: poolAdminAccountState.exists,
    poolCreator: poolAdminAccountState.decoded?.creator.toString() ?? null,
    reservedRewards: reservedRewards?.toString() ?? null,
    rewardEndTs: poolAdminAccountState.decoded?.rewardEndTs ?? null,
    reclaimableRewards: reclaimableRewards.toString(),
    requiredRewardAmount: fundingState.requiredRewardAmount,
    fundedRewardAmount: fundingState.fundedRewardAmount,
    isFullyFunded: fundingState.isFullyFunded,
    isLegacy,
    sampleMinerAddress: positionAddress ?? '',
    derivedUserMinerAddress: positionAddress,
    stakeTokenMint: poolConfig.stakeMint,
    rewardTokenMint: poolConfig.rewardMint,
    stakeTokenSymbol: 'STAKE',
    rewardTokenSymbol: 'REWARD',
    stakeTokenDecimals,
    rewardTokenDecimals,
    totalStaked: totalStakedRaw,
    stakers: null,
    rewardRate: rewardRateYearly,
    rewardsPerSecondEstimate: effectiveRewardRatePerSecond,
    rewardDurationSeconds: poolTiming.rewardDurationSeconds,
    stakingStartedAt: poolTiming.stakingStartedAt,
    stakingEndsAt: poolTiming.stakingEndsAt,
    stakingSecondsRemaining: poolTiming.stakingSecondsRemaining,
    isExpired: poolTiming.isExpired,
    userWalletBalance,
    userRewardWalletBalance,
    userStake,
    claimableRewards,
    claimableRewardsState: hasPosition ? 'ready' : 'pending',
    lastCheckpointTs: livePool?.lastUpdateTs ?? (poolConfig.updatedAt ? Math.floor(poolConfig.updatedAt / 1000) : null),
    hasMiner: hasPosition,
    status,
    statusMessage,
    sampleStakeWalletBalance: null,
    sampleRewardWalletBalance: rewardVaultBalance,
    objectStatuses: {
      mintWrapper: objectStatus(KEDOLIK_STAKE_LOCK_PROGRAM_ID.toString(), true),
      rewarder: objectStatus(KEDOLIK_STAKE_LOCK_ADMIN_CONFIG.toString(), true),
      quarry: objectStatus(poolConfig.pool, Boolean(poolAccountInfo)),
      minter: objectStatus(poolConfig.rewardVault, true),
      sampleMiner: objectStatus(positionAddress ?? '', Boolean(positionAddress)),
      userMiner: positionAddress ? objectStatus(positionAddress, hasPosition) : null,
    },
  };
};

const getAdminPoolStatus = (
  rewardRatePerSecondRaw: string,
  rewardVaultBalanceRaw: string | null,
  exists: boolean,
  poolAdminExists: boolean,
  isFullyFunded: boolean
): {
  status: KedolikStakingAdminPoolStatus;
  statusLabel: string;
  statusMessage: string;
  secondsOfRewardsRemaining: number | null;
} => {
  if (!exists) {
    return {
      status: 'missing',
      statusLabel: 'Missing',
      statusMessage: 'The pool is stored locally, but the on-chain pool account was not found.',
      secondsOfRewardsRemaining: null,
    };
  }

  if (!poolAdminExists) {
    return {
      status: 'legacy',
      statusLabel: 'Legacy',
      statusMessage: 'This pool was created before the PoolAdmin upgrade and is hidden from the new staking UI.',
      secondsOfRewardsRemaining: null,
    };
  }

  const rewardRatePerSecond = BigInt(rewardRatePerSecondRaw || '0');
  const rewardVaultBalance = BigInt(rewardVaultBalanceRaw ?? '0');

  if (!isFullyFunded) {
    return {
      status: 'unfunded',
      statusLabel: 'Created, not fully funded',
      statusMessage: 'Pool is created, but the configured reward amount has not been fully funded yet.',
      secondsOfRewardsRemaining: 0,
    };
  }

  if (rewardVaultBalance === 0n) {
    return {
      status: 'unfunded',
      statusLabel: 'Unfunded',
      statusMessage: 'Rewards are not funded yet.',
      secondsOfRewardsRemaining: 0,
    };
  }

  if (rewardRatePerSecond === 0n) {
    return {
      status: 'rewards_stopped',
      statusLabel: 'Rewards stopped',
      statusMessage: 'Future reward accrual is stopped. Users can still unstake and claim accrued rewards.',
      secondsOfRewardsRemaining: null,
    };
  }

  const secondsOfRewardsRemaining = Number(rewardVaultBalance / rewardRatePerSecond);

  if (secondsOfRewardsRemaining < 24 * 60 * 60) {
    return {
      status: 'low_rewards',
      statusLabel: 'Low rewards',
      statusMessage: 'Reward vault has less than 24 hours of rewards at the current rate.',
      secondsOfRewardsRemaining,
    };
  }

  return {
    status: 'active',
    statusLabel: 'Active',
    statusMessage: 'Reward rate and reward vault balance are both active.',
    secondsOfRewardsRemaining,
  };
};

const mapPoolToAdminPool = async (
  connection: Connection,
  poolConfig: KedolikStoredStakingPool,
  preloadedPoolAdminAccountState?: PoolAdminAccountState
): Promise<KedolikStakingAdminPool> => {
  const pool = toPublicKey(poolConfig.pool);
  const stakeMint = toPublicKey(poolConfig.stakeMint);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const poolAdmin = getStoredOrDerivedPoolAdmin(poolConfig);
  const stakeVault = toPublicKey(poolConfig.stakeVault);
  const rewardVault = toPublicKey(poolConfig.rewardVault);
  const [
    stakeTokenDecimals,
    rewardTokenDecimals,
    stakeVaultBalance,
    rewardVaultBalance,
    poolAccountInfo,
    poolAdminAccountState,
  ] = await Promise.all([
    getTokenDecimals(connection, stakeMint),
    getTokenDecimals(connection, rewardMint),
    getRawTokenAccountBalance(connection, stakeVault),
    getRawTokenAccountBalance(connection, rewardVault),
    connection.getAccountInfo(pool, 'confirmed'),
    preloadedPoolAdminAccountState ?? fetchPoolAdminAccountState(connection, pool, poolConfig),
  ]);
  const livePool = poolAccountInfo ? decodeStakingPoolState(Buffer.from(poolAccountInfo.data)) : null;
  const rewardRatePerSecond =
    livePool?.rewardRatePerSecond.toString() ?? poolConfig.rewardRatePerSecond ?? '0';
  const totalStaked = livePool?.totalStaked.toString() ?? stakeVaultBalance;
  const poolTiming = getPoolTiming(poolConfig, poolAdminAccountState.decoded);
  const effectiveRewardRatePerSecond = poolTiming.isExpired ? '0' : rewardRatePerSecond;
  const fundingState = getPoolFundingState(poolConfig, rewardVaultBalance);
  const reservedRewards = poolAdminAccountState.decoded?.reservedRewards ?? null;
  const reclaimableRewards = getReclaimableRewards(rewardVaultBalance, reservedRewards);
  const rewardStatus = getAdminPoolStatus(
    effectiveRewardRatePerSecond,
    rewardVaultBalance,
    Boolean(livePool),
    poolAdminAccountState.exists,
    fundingState.isFullyFunded
  );
  const status = !poolAdminAccountState.exists
    ? rewardStatus
    : poolTiming.isExpired
    ? {
        status: 'expired' as const,
        statusLabel: 'Expired',
        statusMessage:
          'The configured staking duration has ended. Creator can reclaim unreserved leftover rewards.',
        secondsOfRewardsRemaining: rewardStatus.secondsOfRewardsRemaining,
      }
    : rewardStatus;

  return {
    poolId: (livePool?.poolId ?? BigInt(poolConfig.poolId || '0')).toString(),
    pool: pool.toString(),
    stakeMint: poolConfig.stakeMint,
    rewardMint: poolConfig.rewardMint,
    poolAdmin: poolAdmin.toString(),
    poolAdminExists: poolAdminAccountState.exists,
    poolCreator: poolAdminAccountState.decoded?.creator.toString() ?? null,
    reservedRewards: reservedRewards?.toString() ?? null,
    rewardEndTs: poolAdminAccountState.decoded?.rewardEndTs ?? null,
    reclaimableRewards: reclaimableRewards.toString(),
    requiredRewardAmount: fundingState.requiredRewardAmount,
    fundedRewardAmount: fundingState.fundedRewardAmount,
    isFullyFunded: fundingState.isFullyFunded,
    isLegacy: !poolAdminAccountState.exists,
    stakeVault: poolConfig.stakeVault,
    rewardVault: poolConfig.rewardVault,
    stakeTokenDecimals,
    rewardTokenDecimals,
    totalStaked,
    rewardRatePerSecond: effectiveRewardRatePerSecond,
    rewardVaultBalance,
    stakeVaultBalance,
    exists: Boolean(livePool),
    rewardDurationSeconds: poolTiming.rewardDurationSeconds,
    stakingStartedAt: poolTiming.stakingStartedAt,
    stakingEndsAt: poolTiming.stakingEndsAt,
    stakingSecondsRemaining: poolTiming.stakingSecondsRemaining,
    isExpired: poolTiming.isExpired,
    createdAt: poolConfig.createdAt,
    updatedAt: poolConfig.updatedAt,
    ...status,
  };
};

export const fetchKedolikStakingAdminPools = async (
  connection: Connection
): Promise<KedolikStakingAdminPool[]> => {
  const { pools, poolAdminStates } = await getUpgradedConfiguredPools(connection);
  const adminPools = await Promise.all(
    pools.map((pool) => mapPoolToAdminPool(connection, pool, poolAdminStates.get(pool.pool)))
  );

  return adminPools.sort((left, right) => {
    const leftId = BigInt(left.poolId || '0');
    const rightId = BigInt(right.poolId || '0');
    return leftId === rightId ? left.pool.localeCompare(right.pool) : leftId > rightId ? -1 : 1;
  });
};

const getFirstPoolOrThrow = async (connection: Connection) => {
  const { pools } = await getUpgradedConfiguredPools(connection);

  if (pools.length === 0) {
    throw new Error(KEDOLIK_NO_STAKING_POOL_INSTANCE_MESSAGE);
  }

  return pools[0];
};

const getPoolOrThrow = async (connection: Connection, poolAddress?: string) => {
  if (!poolAddress) {
    return getFirstPoolOrThrow(connection);
  }

  const { pools } = await getUpgradedConfiguredPools(connection);
  const pool = pools.find((candidate) => candidate.pool === poolAddress);

  if (!pool) {
    throw new Error('Selected staking pool was not found in the upgraded staking pool list.');
  }

  return pool;
};

const buildInitializeAdminConfigInstruction = (authority: PublicKey) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: INITIALIZE_ADMIN_CONFIG_DISCRIMINATOR,
  });

const buildTransferAdminAuthorityInstruction = (authority: PublicKey, newAuthority: PublicKey) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([TRANSFER_ADMIN_AUTHORITY_DISCRIMINATOR, newAuthority.toBuffer()]),
  });

const buildInitializeStakingPoolInstruction = (
  authority: PublicKey,
  stakeMint: PublicKey,
  rewardMint: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  stakeVault: PublicKey,
  rewardVault: PublicKey,
  poolId: bigint,
  rewardRatePerSecond: bigint,
  rewardDurationSeconds: bigint,
  tokenProgram: PublicKey
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, isSigner: false, isWritable: false },
      { pubkey: stakeMint, isSigner: false, isWritable: false },
      { pubkey: rewardMint, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: stakeVault, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INITIALIZE_STAKING_POOL_DISCRIMINATOR,
      writeU64(poolId),
      writeU64(rewardRatePerSecond),
      writeU64(rewardDurationSeconds),
    ]),
  });

const buildFundRewardsInstruction = (
  funder: PublicKey,
  pool: PublicKey,
  funderRewardToken: PublicKey,
  rewardVault: PublicKey,
  tokenProgram: PublicKey,
  amount: bigint
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: funder, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: funderRewardToken, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([FUND_REWARDS_DISCRIMINATOR, writeU64(amount)]),
  });

const buildOpenPositionInstruction = (
  user: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  position: PublicKey
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: OPEN_POSITION_DISCRIMINATOR,
  });

const buildStakeInstruction = (
  user: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  position: PublicKey,
  userStakeToken: PublicKey,
  stakeVault: PublicKey,
  tokenProgram: PublicKey,
  amount: bigint
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: userStakeToken, isSigner: false, isWritable: true },
      { pubkey: stakeVault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([STAKE_DISCRIMINATOR, writeU64(amount)]),
  });

const buildUnstakeInstruction = (
  user: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  position: PublicKey,
  userStakeToken: PublicKey,
  stakeVault: PublicKey,
  tokenProgram: PublicKey,
  amount: bigint
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: userStakeToken, isSigner: false, isWritable: true },
      { pubkey: stakeVault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([UNSTAKE_DISCRIMINATOR, writeU64(amount)]),
  });

const buildClaimRewardsInstruction = (
  user: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  position: PublicKey,
  userRewardToken: PublicKey,
  rewardVault: PublicKey,
  tokenProgram: PublicKey
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: userRewardToken, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: CLAIM_REWARDS_DISCRIMINATOR,
  });

const buildSetRewardRateInstruction = (
  authority: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  rewardRatePerSecond: bigint
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([SET_REWARD_RATE_DISCRIMINATOR, writeU64(rewardRatePerSecond)]),
  });

const buildReclaimUnclaimedRewardsInstruction = (
  authority: PublicKey,
  pool: PublicKey,
  poolAdmin: PublicKey,
  rewardVault: PublicKey,
  adminRewardToken: PublicKey,
  tokenProgram: PublicKey
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolAdmin, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: adminRewardToken, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: RECLAIM_UNCLAIMED_REWARDS_DISCRIMINATOR,
  });

const buildClosePositionInstruction = (user: PublicKey, pool: PublicKey, position: PublicKey) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: position, isSigner: false, isWritable: true },
    ],
    data: CLOSE_POSITION_DISCRIMINATOR,
  });

export const initializeKedolikStakeLockAdminConfig = async (
  connection: Connection,
  wallet: AnchorWallet
) => {
  const signerWallet = assertWallet(wallet);
  const transaction = new Transaction().add(
    buildInitializeAdminConfigInstruction(signerWallet.publicKey)
  );

  return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
};

export const transferKedolikStakingAdmin = async (
  connection: Connection,
  wallet: AnchorWallet,
  newAuthority: string
) => {
  const signerWallet = assertWallet(wallet);
  const currentAdmin = await fetchKedolikStakeLockAdminConfig(connection);
  const newAuthorityPublicKey = toPublicKey(newAuthority);

  if (!currentAdmin.exists) {
    throw new Error('Stake Lock admin config was not found on the current RPC endpoint.');
  }

  if (currentAdmin.authority !== signerWallet.publicKey.toString()) {
    throw new Error('Only the current staking admin can transfer admin authority.');
  }

  if (newAuthorityPublicKey.equals(signerWallet.publicKey)) {
    throw new Error('New staking admin must be a different wallet address.');
  }

  const transaction = new Transaction().add(
    buildTransferAdminAuthorityInstruction(signerWallet.publicKey, newAuthorityPublicKey)
  );

  return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
};

export const initializeKedolikStakingPool = async (
  connection: Connection,
  wallet: AnchorWallet,
  input: CreateKedolikStakingPoolInput
) => {
  const signerWallet = assertWallet(wallet);
  const adminConfig = await fetchKedolikStakeLockAdminConfig(connection);

  if (adminConfig.exists && adminConfig.authority !== signerWallet.publicKey.toString()) {
    throw new Error('Only the current staking admin can create a staking pool.');
  }

  const stakeMint = toPublicKey(input.stakeMint);
  const rewardMint = toPublicKey(input.rewardMint);
  const poolId = assertU64String(input.poolId, 'Pool ID');
  const rewardAmountRaw = assertRawAmount(input.rewardAmountRaw);
  const rewardDurationSeconds = BigInt(input.rewardDurationSeconds);

  if (rewardDurationSeconds <= 0n) {
    throw new Error('Reward duration must be greater than zero.');
  }

  const rewardRatePerSecond = rewardAmountRaw / rewardDurationSeconds;

  if (rewardRatePerSecond <= 0n) {
    throw new Error('Reward amount is too small for the selected duration.');
  }

  const pool = getStakingPoolPda(stakeMint, rewardMint, poolId);
  const poolAdmin = getPoolAdminPda(pool);
  const stakeVault = getStakeVaultPda(pool);
  const rewardVault = getRewardVaultPda(pool);

  if (await connection.getAccountInfo(pool, 'confirmed')) {
    throw new Error('A staking pool already exists for this stake mint, reward mint, and pool ID.');
  }

  const [stakeTokenProgram, rewardTokenProgram] = await Promise.all([
    getTokenProgramForMint(connection, stakeMint),
    getTokenProgramForMint(connection, rewardMint),
  ]);

  if (!stakeTokenProgram.equals(rewardTokenProgram)) {
    throw new Error('Stake Lock V1 frontend currently expects stake and reward mints to share the same token program.');
  }

  const transaction = new Transaction().add(
    buildInitializeStakingPoolInstruction(
      signerWallet.publicKey,
      stakeMint,
      rewardMint,
      pool,
      poolAdmin,
      stakeVault,
      rewardVault,
      poolId,
      rewardRatePerSecond,
      rewardDurationSeconds,
      rewardTokenProgram
    )
  );
  const signature = await sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  const storedPool: KedolikStoredStakingPool = {
    poolId: poolId.toString(),
    pool: pool.toString(),
    stakeMint: stakeMint.toString(),
    rewardMint: rewardMint.toString(),
    poolAdmin: poolAdmin.toString(),
    stakeVault: stakeVault.toString(),
    rewardVault: rewardVault.toString(),
    rewardRatePerSecond: rewardRatePerSecond.toString(),
    rewardAmountRaw: rewardAmountRaw.toString(),
    fundedRewardAmountRaw: '0',
    rewardDurationSeconds: Number(rewardDurationSeconds),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveStoredPool(storedPool);

  return {
    signature,
    pool: storedPool,
    rewardRatePerSecond: rewardRatePerSecond.toString(),
  };
};

export const createKedolikStakingPool = async (
  connection: Connection,
  wallet: AnchorWallet,
  input: CreateKedolikStakingPoolInput
) => {
  const signerWallet = assertWallet(wallet);
  const adminConfig = await fetchKedolikStakeLockAdminConfig(connection);

  if (adminConfig.exists && adminConfig.authority !== signerWallet.publicKey.toString()) {
    throw new Error('Only the current staking admin can create a staking pool.');
  }

  const stakeMint = toPublicKey(input.stakeMint);
  const rewardMint = toPublicKey(input.rewardMint);
  const poolId = assertU64String(input.poolId, 'Pool ID');
  const rewardAmountRaw = assertRawAmount(input.rewardAmountRaw);
  const rewardDurationSeconds = BigInt(input.rewardDurationSeconds);

  if (rewardDurationSeconds <= 0n) {
    throw new Error('Reward duration must be greater than zero.');
  }

  const rewardRatePerSecond = rewardAmountRaw / rewardDurationSeconds;

  if (rewardRatePerSecond <= 0n) {
    throw new Error('Reward amount is too small for the selected duration.');
  }

  const pool = getStakingPoolPda(stakeMint, rewardMint, poolId);
  const poolAdmin = getPoolAdminPda(pool);
  const stakeVault = getStakeVaultPda(pool);
  const rewardVault = getRewardVaultPda(pool);

  if (await connection.getAccountInfo(pool, 'confirmed')) {
    throw new Error('A staking pool already exists for this stake mint, reward mint, and pool ID.');
  }

  const [stakeTokenProgram, rewardTokenProgram] = await Promise.all([
    getTokenProgramForMint(connection, stakeMint),
    getTokenProgramForMint(connection, rewardMint),
  ]);

  if (!stakeTokenProgram.equals(rewardTokenProgram)) {
    throw new Error('Stake Lock V1 frontend currently expects stake and reward mints to share the same token program.');
  }

  const funderRewardToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    rewardMint,
    rewardTokenProgram
  );
  const transaction = new Transaction();

  if (funderRewardToken.instruction) {
    transaction.add(funderRewardToken.instruction);
  }

  transaction.add(
    buildInitializeStakingPoolInstruction(
      signerWallet.publicKey,
      stakeMint,
      rewardMint,
      pool,
      poolAdmin,
      stakeVault,
      rewardVault,
      poolId,
      rewardRatePerSecond,
      rewardDurationSeconds,
      rewardTokenProgram
    )
  );
  transaction.add(
    buildFundRewardsInstruction(
      signerWallet.publicKey,
      pool,
      funderRewardToken.address,
      rewardVault,
      rewardTokenProgram,
      rewardAmountRaw
    )
  );

  const signature = await sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  const storedPool: KedolikStoredStakingPool = {
    poolId: poolId.toString(),
    pool: pool.toString(),
    stakeMint: stakeMint.toString(),
    rewardMint: rewardMint.toString(),
    poolAdmin: poolAdmin.toString(),
    stakeVault: stakeVault.toString(),
    rewardVault: rewardVault.toString(),
    rewardRatePerSecond: rewardRatePerSecond.toString(),
    rewardAmountRaw: rewardAmountRaw.toString(),
    fundedRewardAmountRaw: rewardAmountRaw.toString(),
    rewardDurationSeconds: Number(rewardDurationSeconds),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveStoredPool(storedPool);

  return {
    signature,
    pool: storedPool,
  };
};

export const fundKedolikStakingRewards = async (
  connection: Connection,
  wallet: AnchorWallet,
  poolAddress: string,
  amountRaw: string
) => {
  const signerWallet = assertWallet(wallet);
  const rawAmount = assertRawAmount(amountRaw);
  const poolConfig = await getPoolOrThrow(connection, poolAddress);
  const pool = toPublicKey(poolConfig.pool);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const rewardVault = toPublicKey(poolConfig.rewardVault);
  const rewardTokenProgram = await getTokenProgramForMint(connection, rewardMint);
  const funderRewardToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    rewardMint,
    rewardTokenProgram
  );
  const funderBalance = await getRawTokenAccountBalance(connection, funderRewardToken.address);

  if (!funderBalance || BigInt(funderBalance) < rawAmount) {
    throw new Error('Admin reward token balance is lower than the amount being funded.');
  }

  const transaction = new Transaction();

  if (funderRewardToken.instruction) {
    transaction.add(funderRewardToken.instruction);
  }

  transaction.add(
    buildFundRewardsInstruction(
      signerWallet.publicKey,
      pool,
      funderRewardToken.address,
      rewardVault,
      rewardTokenProgram,
      rawAmount
    )
  );
  const signature = await sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  const currentFundedAmount = BigInt(poolConfig.fundedRewardAmountRaw || '0');

  updateStoredPool(pool.toString(), {
    fundedRewardAmountRaw: (currentFundedAmount + rawAmount).toString(),
  });

  return signature;
};

export const setKedolikStakingRewardRate = async (
  connection: Connection,
  wallet: AnchorWallet,
  poolAddress: string,
  rewardRatePerSecondRaw: string,
  rewardDurationSeconds?: number
) => {
  const signerWallet = assertWallet(wallet);
  const adminConfig = await fetchKedolikStakeLockAdminConfig(connection);

  if (adminConfig.exists && adminConfig.authority !== signerWallet.publicKey.toString()) {
    throw new Error('Only the current staking admin can update the reward rate.');
  }

  const pool = toPublicKey(poolAddress);
  const poolAdmin = (await getPoolAdminAccountOrThrow(connection, pool)).address;
  const rewardRatePerSecond = assertU64String(rewardRatePerSecondRaw, 'Reward rate per second');
  const transaction = new Transaction().add(
    buildSetRewardRateInstruction(signerWallet.publicKey, pool, poolAdmin, rewardRatePerSecond)
  );
  const signature = await sendAndConfirmStakingTransaction(connection, signerWallet, transaction);

  updateStoredPool(pool.toString(), {
    rewardRatePerSecond: rewardRatePerSecond.toString(),
    ...(rewardDurationSeconds && rewardDurationSeconds > 0
      ? {
          rewardDurationSeconds: Math.floor(rewardDurationSeconds),
          createdAt: Date.now(),
        }
      : {}),
  });

  return signature;
};

export const reclaimKedolikStakingUnclaimedRewards = async (
  connection: Connection,
  wallet: AnchorWallet,
  poolAddress: string
) => {
  const signerWallet = assertWallet(wallet);
  const poolConfig = await getPoolOrThrow(connection, poolAddress);
  const pool = toPublicKey(poolConfig.pool);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const rewardVault = toPublicKey(poolConfig.rewardVault);
  const poolAdminAccount = await getPoolAdminAccountOrThrow(connection, pool, poolConfig);

  if (!poolAdminAccount.decoded) {
    throw new Error('PoolAdmin account exists, but its data could not be decoded by the frontend.');
  }

  if (!poolAdminAccount.decoded.creator.equals(signerWallet.publicKey)) {
    throw new Error('Only the original pool creator can reclaim leftover staking rewards.');
  }

  if (poolAdminAccount.decoded.rewardEndTs > Math.floor(Date.now() / 1000)) {
    throw new Error('Leftover rewards can only be reclaimed after staking expiry.');
  }

  const rewardTokenProgram = await getTokenProgramForMint(connection, rewardMint);
  const adminRewardToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    rewardMint,
    rewardTokenProgram
  );
  const rewardVaultBalance = await getRawTokenAccountBalance(connection, rewardVault);
  const reclaimableRewards = getReclaimableRewards(
    rewardVaultBalance,
    poolAdminAccount.decoded.reservedRewards
  );

  if (reclaimableRewards <= 0n) {
    throw new Error('There are no unreserved leftover rewards to reclaim.');
  }

  const transaction = new Transaction();

  if (adminRewardToken.instruction) {
    transaction.add(adminRewardToken.instruction);
  }

  transaction.add(
    buildReclaimUnclaimedRewardsInstruction(
      signerWallet.publicKey,
      pool,
      poolAdminAccount.address,
      rewardVault,
      adminRewardToken.address,
      rewardTokenProgram
    )
  );

  return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
};

export const createKedolikStakingService = (
  connection: Connection,
  wallet?: AnchorWallet | null
): KedolikStakingService => ({
  cluster: KEDOLIK_STAKE_LOCK_V1.cluster,
  kedolikStakingProgramId: KEDOLIK_STAKE_LOCK_V1.programId,
  fetchLiveQuarries: async (walletPublicKey) => {
    const { pools, poolAdminStates } = await getUpgradedConfiguredPools(connection);

    if (pools.length === 0) {
      return [];
    }

    const summaries = await Promise.all(
      pools.map((pool) => mapPoolToSummary(connection, pool, walletPublicKey, poolAdminStates.get(pool.pool)))
    );

    return summaries.filter((pool) => pool.poolAdminExists);
  },
  stake: async (amountRaw, poolAddress) => {
    const signerWallet = assertWallet(wallet);
    const rawAmount = assertRawAmount(amountRaw);
    const poolConfig = await getPoolOrThrow(connection, poolAddress);
    const pool = toPublicKey(poolConfig.pool);
    const poolAdmin = (await getPoolAdminAccountOrThrow(connection, pool, poolConfig)).address;
    const stakeMint = toPublicKey(poolConfig.stakeMint);
    const stakeVault = toPublicKey(poolConfig.stakeVault);
    const tokenProgram = await getTokenProgramForMint(connection, stakeMint);
    const userStakeToken = await ensureAta(
      connection,
      signerWallet.publicKey,
      signerWallet.publicKey,
      stakeMint,
      tokenProgram
    );
    const walletBalance = await getRawTokenAccountBalance(connection, userStakeToken.address);

    if (!walletBalance || BigInt(walletBalance) < rawAmount) {
      throw new Error('Not enough stake token balance in the connected wallet.');
    }

    const positionAddress = getUserStakePositionPda(pool, signerWallet.publicKey);
    const positionInfo = await connection.getAccountInfo(positionAddress, 'confirmed');
    const transaction = new Transaction();

    if (userStakeToken.instruction) {
      transaction.add(userStakeToken.instruction);
    }

    if (!positionInfo) {
      transaction.add(buildOpenPositionInstruction(signerWallet.publicKey, pool, poolAdmin, positionAddress));
    }

    transaction.add(
      buildStakeInstruction(
        signerWallet.publicKey,
        pool,
        poolAdmin,
        positionAddress,
        userStakeToken.address,
        stakeVault,
        tokenProgram,
        rawAmount
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  unstake: async (amountRaw, poolAddress) => {
    const signerWallet = assertWallet(wallet);
    const rawAmount = assertRawAmount(amountRaw);
    const poolConfig = await getPoolOrThrow(connection, poolAddress);
    const pool = toPublicKey(poolConfig.pool);
    const poolAdmin = (await getPoolAdminAccountOrThrow(connection, pool, poolConfig)).address;
    const stakeMint = toPublicKey(poolConfig.stakeMint);
    const stakeVault = toPublicKey(poolConfig.stakeVault);
    const tokenProgram = await getTokenProgramForMint(connection, stakeMint);
    const positionAddress = getUserStakePositionPda(pool, signerWallet.publicKey);
    const positionInfo = await connection.getAccountInfo(positionAddress, 'confirmed');

    if (!positionInfo) {
      throw new Error('No stake position exists for this wallet yet.');
    }

    const decodedPosition = decodeUserPosition(Buffer.from(positionInfo.data), pool, signerWallet.publicKey);

    if (decodedPosition && decodedPosition.amount < rawAmount) {
      throw new Error('Unstake amount exceeds your current stake.');
    }

    const userStakeToken = await ensureAta(
      connection,
      signerWallet.publicKey,
      signerWallet.publicKey,
      stakeMint,
      tokenProgram
    );
    const transaction = new Transaction();

    if (userStakeToken.instruction) {
      transaction.add(userStakeToken.instruction);
    }

    transaction.add(
      buildUnstakeInstruction(
        signerWallet.publicKey,
        pool,
        poolAdmin,
        positionAddress,
        userStakeToken.address,
        stakeVault,
        tokenProgram,
        rawAmount
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  claimRewards: async (poolAddress) => {
    const signerWallet = assertWallet(wallet);
    const poolConfig = await getPoolOrThrow(connection, poolAddress);
    const pool = toPublicKey(poolConfig.pool);
    const poolAdmin = (await getPoolAdminAccountOrThrow(connection, pool, poolConfig)).address;
    const rewardMint = toPublicKey(poolConfig.rewardMint);
    const rewardVault = toPublicKey(poolConfig.rewardVault);
    const tokenProgram = await getTokenProgramForMint(connection, rewardMint);
    const positionAddress = getUserStakePositionPda(pool, signerWallet.publicKey);
    const positionInfo = await connection.getAccountInfo(positionAddress, 'confirmed');

    if (!positionInfo) {
      throw new Error('No stake position exists for this wallet yet.');
    }

    const userRewardToken = await ensureAta(
      connection,
      signerWallet.publicKey,
      signerWallet.publicKey,
      rewardMint,
      tokenProgram
    );
    const transaction = new Transaction();

    if (userRewardToken.instruction) {
      transaction.add(userRewardToken.instruction);
    }

    transaction.add(
      buildClaimRewardsInstruction(
        signerWallet.publicKey,
        pool,
        poolAdmin,
        positionAddress,
        userRewardToken.address,
        rewardVault,
        tokenProgram
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  reclaimUnclaimedRewards: async (poolAddress) => {
    const signerWallet = assertWallet(wallet);
    const poolConfig = await getPoolOrThrow(connection, poolAddress);

    return reclaimKedolikStakingUnclaimedRewards(connection, signerWallet, poolConfig.pool);
  },
  getUserMinerAddress: (authority) => {
    const pool = getStoredPools()[0]?.pool;

    if (!pool) {
      return '';
    }

    return getUserStakePositionPda(new PublicKey(pool), authority).toString();
  },
  getStatusMessage: () => 'Live on Mainnet through Stake Lock V1',
});

export const closeKedolikStakePosition = async (
  connection: Connection,
  wallet: AnchorWallet,
  poolAddress: string
) => {
  const signerWallet = assertWallet(wallet);
  const pool = toPublicKey(poolAddress);
  const position = getUserStakePositionPda(pool, signerWallet.publicKey);
  const positionInfo = await connection.getAccountInfo(position, 'confirmed');

  if (!positionInfo) {
    throw new Error('No stake position exists for this wallet.');
  }

  const decodedPosition = decodeUserPosition(Buffer.from(positionInfo.data), pool, signerWallet.publicKey);

  if (decodedPosition && (decodedPosition.amount > 0n || decodedPosition.rewardsOwed > 0n)) {
    throw new Error('Close position only after staked amount and rewards owed are zero.');
  }

  const transaction = new Transaction().add(
    buildClosePositionInstruction(signerWallet.publicKey, pool, position)
  );

  return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
};

export const estimatePendingRewards = (
  stakedAmountRaw: bigint,
  rewardRatePerSecond: bigint,
  elapsedSeconds: bigint,
  totalStakedRaw: bigint
) => {
  if (stakedAmountRaw <= 0n || rewardRatePerSecond <= 0n || elapsedSeconds <= 0n || totalStakedRaw <= 0n) {
    return 0n;
  }

  return (stakedAmountRaw * rewardRatePerSecond * elapsedSeconds * ACC_REWARD_SCALE) /
    totalStakedRaw /
    ACC_REWARD_SCALE;
};

export const getKedolikStakingPlaceholderMessage = () => 'Live on Mainnet through Stake Lock V1';
