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
const CLOSE_POSITION_DISCRIMINATOR = Buffer.from('7b86510031446262', 'hex');
const STAKING_POOL_STORAGE_KEY = 'kedolik:stake-lock-v1:pools';
export const KEDOLIK_STAKING_POOLS_UPDATED_EVENT = 'kedolik:staking-pools-updated';
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
  status: 'live' | 'awaiting_client' | 'awaiting_deployment';
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
  cluster: 'devnet';
  kedolikStakingProgramId: string;
  fetchLiveQuarries: (walletPublicKey?: PublicKey | null) => Promise<KedolikStakingQuarrySummary[]>;
  stake: (amountRaw: string, poolAddress?: string) => Promise<string>;
  unstake: (amountRaw: string, poolAddress?: string) => Promise<string>;
  claimRewards: (poolAddress?: string) => Promise<string>;
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
  stakeVault: string;
  rewardVault: string;
  rewardRatePerSecond: string;
  rewardAmountRaw: string;
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
  | 'missing';

export interface KedolikStakingAdminPool {
  poolId: string;
  pool: string;
  stakeMint: string;
  rewardMint: string;
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

export const getUserStakePositionPda = (pool: PublicKey, user: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('position'), pool.toBuffer(), user.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

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
    stakeVault: state.stakeVault.toString(),
    rewardVault: state.rewardVault.toString(),
    rewardRatePerSecond: state.rewardRatePerSecond.toString(),
    rewardAmountRaw: '0',
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

const fetchOnChainPools = async (connection: Connection) => {
  const accounts = await connection.getProgramAccounts(KEDOLIK_STAKE_LOCK_PROGRAM_ID, {
    commitment: 'confirmed',
  });

  return accounts
    .map(({ pubkey, account }) => decodeOnChainPoolAccount(pubkey, Buffer.from(account.data)))
    .filter((pool): pool is KedolikStoredStakingPool => pool !== null);
};

const getConfiguredPools = async (connection: Connection) => {
  const stored = getStoredPools();
  const onChain = await fetchOnChainPools(connection).catch(() => []);
  const byPool = new Map<string, KedolikStoredStakingPool>();

  stored.forEach((pool) => byPool.set(pool.pool, pool));
  onChain.forEach((pool) => {
    const storedPool = byPool.get(pool.pool);
    const storedDuration = Number(storedPool?.rewardDurationSeconds || 0);
    const storedCreatedAt = Number(storedPool?.createdAt || 0);

    byPool.set(pool.pool, {
      ...storedPool,
      ...pool,
      rewardAmountRaw: storedPool?.rewardAmountRaw ?? pool.rewardAmountRaw,
      rewardDurationSeconds: storedDuration > 0 ? storedDuration : pool.rewardDurationSeconds,
      createdAt: storedCreatedAt > 0 ? storedCreatedAt : pool.createdAt,
      updatedAt: Math.max(storedPool?.updatedAt ?? 0, pool.updatedAt ?? 0),
    });
  });

  return [...byPool.values()];
};

const getRawTokenAccountBalance = async (connection: Connection, tokenAccount: PublicKey) => {
  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
    return balance.value.amount;
  } catch {
    return null;
  }
};

const getPoolTiming = (poolConfig: KedolikStoredStakingPool) => {
  const rewardDurationSeconds = Number(poolConfig.rewardDurationSeconds || 0);
  const createdAtMs = Number(poolConfig.createdAt || 0);

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
  const now = Math.floor(Date.now() / 1000);
  const stakingSecondsRemaining = Math.max(0, stakingEndsAt - now);

  return {
    rewardDurationSeconds: Math.floor(rewardDurationSeconds),
    stakingStartedAt,
    stakingEndsAt,
    stakingSecondsRemaining,
    isExpired: now >= stakingEndsAt,
  };
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
  position: DecodedUserPosition | null
) => {
  if (!position) {
    return null;
  }

  if (!poolState) {
    return position.rewardsOwed;
  }

  let rewardPerTokenStored = poolState.rewardPerTokenStored;
  const elapsedSeconds = BigInt(Math.max(0, Math.floor(Date.now() / 1000) - poolState.lastUpdateTs));

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
  walletPublicKey?: PublicKey | null
): Promise<KedolikStakingQuarrySummary> => {
  const pool = toPublicKey(poolConfig.pool);
  const stakeMint = toPublicKey(poolConfig.stakeMint);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const stakeVault = toPublicKey(poolConfig.stakeVault);
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
  ] = await Promise.all([
    getTokenDecimals(connection, stakeMint),
    getTokenDecimals(connection, rewardMint),
    getRawTokenAccountBalance(connection, stakeVault),
    getRawTokenAccountBalance(connection, toPublicKey(poolConfig.rewardVault)),
    getWalletTokenBalance(connection, walletPublicKey, stakeMint, stakeTokenProgram),
    getWalletTokenBalance(connection, walletPublicKey, rewardMint, rewardTokenProgram),
    fetchUserPosition(connection, pool, walletPublicKey),
    connection.getAccountInfo(pool, 'confirmed'),
  ]);
  const livePool = poolAccountInfo ? decodeStakingPoolState(Buffer.from(poolAccountInfo.data)) : null;
  const positionAddress = position.address?.toString() ?? null;
  const rewardRatePerSecond = livePool?.rewardRatePerSecond.toString() ?? poolConfig.rewardRatePerSecond ?? null;
  const totalStakedRaw = livePool?.totalStaked.toString() ?? totalStaked;
  const rewardRateYearly =
    rewardRatePerSecond && rewardRatePerSecond !== '0'
      ? (BigInt(rewardRatePerSecond) * 365n * 24n * 60n * 60n).toString()
      : null;
  const estimatedClaimableRewards = estimateClaimableRewards(livePool, position.decoded);
  const userStake = position.decoded?.amount.toString() ?? '0';
  const claimableRewards = estimatedClaimableRewards?.toString() ?? '0';
  const hasPosition = Boolean(position.decoded);
  const poolTiming = getPoolTiming(poolConfig);
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
    rewardsPerSecondEstimate: rewardRatePerSecond,
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
    status: poolAccountInfo ? 'live' : 'awaiting_deployment',
    statusMessage: poolAccountInfo
      ? 'Live Stake Lock V1 pool'
      : 'Pool config is stored in the frontend, but the on-chain pool account was not found.',
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
  exists: boolean
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

  const rewardRatePerSecond = BigInt(rewardRatePerSecondRaw || '0');
  const rewardVaultBalance = BigInt(rewardVaultBalanceRaw ?? '0');

  if (rewardRatePerSecond === 0n) {
    return {
      status: 'rewards_stopped',
      statusLabel: 'Rewards stopped',
      statusMessage: 'Future reward accrual is stopped. Users can still unstake and claim accrued rewards.',
      secondsOfRewardsRemaining: null,
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
  poolConfig: KedolikStoredStakingPool
): Promise<KedolikStakingAdminPool> => {
  const pool = toPublicKey(poolConfig.pool);
  const stakeMint = toPublicKey(poolConfig.stakeMint);
  const rewardMint = toPublicKey(poolConfig.rewardMint);
  const stakeVault = toPublicKey(poolConfig.stakeVault);
  const rewardVault = toPublicKey(poolConfig.rewardVault);
  const [
    stakeTokenDecimals,
    rewardTokenDecimals,
    stakeVaultBalance,
    rewardVaultBalance,
    poolAccountInfo,
  ] = await Promise.all([
    getTokenDecimals(connection, stakeMint),
    getTokenDecimals(connection, rewardMint),
    getRawTokenAccountBalance(connection, stakeVault),
    getRawTokenAccountBalance(connection, rewardVault),
    connection.getAccountInfo(pool, 'confirmed'),
  ]);
  const livePool = poolAccountInfo ? decodeStakingPoolState(Buffer.from(poolAccountInfo.data)) : null;
  const rewardRatePerSecond =
    livePool?.rewardRatePerSecond.toString() ?? poolConfig.rewardRatePerSecond ?? '0';
  const totalStaked = livePool?.totalStaked.toString() ?? stakeVaultBalance;
  const poolTiming = getPoolTiming(poolConfig);
  const rewardStatus = getAdminPoolStatus(rewardRatePerSecond, rewardVaultBalance, Boolean(livePool));
  const status = poolTiming.isExpired
    ? {
        status: 'expired' as const,
        statusLabel: 'Expired',
        statusMessage: 'The configured staking duration has ended. Users can still unstake and claim available rewards.',
        secondsOfRewardsRemaining: rewardStatus.secondsOfRewardsRemaining,
      }
    : rewardStatus;

  return {
    poolId: (livePool?.poolId ?? BigInt(poolConfig.poolId || '0')).toString(),
    pool: pool.toString(),
    stakeMint: poolConfig.stakeMint,
    rewardMint: poolConfig.rewardMint,
    stakeVault: poolConfig.stakeVault,
    rewardVault: poolConfig.rewardVault,
    stakeTokenDecimals,
    rewardTokenDecimals,
    totalStaked,
    rewardRatePerSecond,
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
  const pools = await getConfiguredPools(connection);
  const adminPools = await Promise.all(pools.map((pool) => mapPoolToAdminPool(connection, pool)));

  return adminPools.sort((left, right) => {
    const leftId = BigInt(left.poolId || '0');
    const rightId = BigInt(right.poolId || '0');
    return leftId === rightId ? left.pool.localeCompare(right.pool) : leftId > rightId ? -1 : 1;
  });
};

const getFirstPoolOrThrow = async (connection: Connection) => {
  const pools = await getConfiguredPools(connection);

  if (pools.length === 0) {
    throw new Error(
      'No staking pool instance has been created yet. Create one from the staking admin controls or run setup-devnet-lean-staking.js.'
    );
  }

  return pools[0];
};

const getPoolOrThrow = async (connection: Connection, poolAddress?: string) => {
  if (!poolAddress) {
    return getFirstPoolOrThrow(connection);
  }

  const pools = await getConfiguredPools(connection);
  const pool = pools.find((candidate) => candidate.pool === poolAddress);

  if (!pool) {
    throw new Error('Selected staking pool was not found on the current RPC endpoint.');
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
  stakeVault: PublicKey,
  rewardVault: PublicKey,
  poolId: bigint,
  rewardRatePerSecond: bigint,
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

const buildOpenPositionInstruction = (user: PublicKey, pool: PublicKey, position: PublicKey) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: OPEN_POSITION_DISCRIMINATOR,
  });

const buildStakeInstruction = (
  user: PublicKey,
  pool: PublicKey,
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
  rewardRatePerSecond: bigint
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: KEDOLIK_STAKE_LOCK_ADMIN_CONFIG, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([SET_REWARD_RATE_DISCRIMINATOR, writeU64(rewardRatePerSecond)]),
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

  if (currentAdmin.exists && currentAdmin.authority !== signerWallet.publicKey.toString()) {
    throw new Error('Only the current staking admin can transfer admin authority.');
  }

  const newAuthorityPublicKey = toPublicKey(newAuthority);
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
      stakeVault,
      rewardVault,
      poolId,
      rewardRatePerSecond,
      rewardTokenProgram
    )
  );
  const signature = await sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  const storedPool: KedolikStoredStakingPool = {
    poolId: poolId.toString(),
    pool: pool.toString(),
    stakeMint: stakeMint.toString(),
    rewardMint: rewardMint.toString(),
    stakeVault: stakeVault.toString(),
    rewardVault: rewardVault.toString(),
    rewardRatePerSecond: rewardRatePerSecond.toString(),
    rewardAmountRaw: rewardAmountRaw.toString(),
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
  const stakeVault = getStakeVaultPda(pool);
  const rewardVault = getRewardVaultPda(pool);
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
      stakeVault,
      rewardVault,
      poolId,
      rewardRatePerSecond,
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
    stakeVault: stakeVault.toString(),
    rewardVault: rewardVault.toString(),
    rewardRatePerSecond: rewardRatePerSecond.toString(),
    rewardAmountRaw: rewardAmountRaw.toString(),
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
  const currentRewardAmount = BigInt(poolConfig.rewardAmountRaw || '0');

  updateStoredPool(pool.toString(), {
    rewardAmountRaw: (currentRewardAmount + rawAmount).toString(),
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
  const rewardRatePerSecond = assertU64String(rewardRatePerSecondRaw, 'Reward rate per second');
  const transaction = new Transaction().add(
    buildSetRewardRateInstruction(signerWallet.publicKey, pool, rewardRatePerSecond)
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

export const createKedolikStakingService = (
  connection: Connection,
  wallet?: AnchorWallet | null
): KedolikStakingService => ({
  cluster: KEDOLIK_STAKE_LOCK_V1.cluster,
  kedolikStakingProgramId: KEDOLIK_STAKE_LOCK_V1.programId,
  fetchLiveQuarries: async (walletPublicKey) => {
    const pools = await getConfiguredPools(connection);

    if (pools.length === 0) {
      return [];
    }

    return Promise.all(pools.map((pool) => mapPoolToSummary(connection, pool, walletPublicKey)));
  },
  stake: async (amountRaw, poolAddress) => {
    const signerWallet = assertWallet(wallet);
    const rawAmount = assertRawAmount(amountRaw);
    const poolConfig = await getPoolOrThrow(connection, poolAddress);
    const pool = toPublicKey(poolConfig.pool);
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
      transaction.add(buildOpenPositionInstruction(signerWallet.publicKey, pool, positionAddress));
    }

    transaction.add(
      buildStakeInstruction(
        signerWallet.publicKey,
        pool,
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
        positionAddress,
        userRewardToken.address,
        rewardVault,
        tokenProgram
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  getUserMinerAddress: (authority) => {
    const pool = getStoredPools()[0]?.pool;

    if (!pool) {
      return '';
    }

    return getUserStakePositionPda(new PublicKey(pool), authority).toString();
  },
  getStatusMessage: () => 'Live on Devnet through Stake Lock V1',
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

export const getKedolikStakingPlaceholderMessage = () => 'Live on Devnet through Stake Lock V1';
