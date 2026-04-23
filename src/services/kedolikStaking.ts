import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  AccountInfo,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  KEDOLIK_DEVNET_CONFIG,
  KEDOLIK_DEVNET_PUBLIC_KEYS,
  KEDOLIK_DEVNET_STAKING_LIVE,
} from '../config/kedolikDevnet';
import { confirmTransactionWithBlockhash } from '../utils/transactionConfirmation';

const ANCHOR_DISCRIMINATOR_LENGTH = 8;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const TOKEN_ACCOUNT_RENT_SPACE = ACCOUNT_SIZE;
const MAX_U64 = (1n << 64n) - 1n;

// These discriminators were confirmed against the live Kedolik devnet transactions.
const CREATE_MINER_V2_DISCRIMINATOR = Buffer.from('b1f21db00dd92447', 'hex');
const STAKE_TOKENS_DISCRIMINATOR = Buffer.from('887e5ba228830d7f', 'hex');
const WITHDRAW_TOKENS_DISCRIMINATOR = Buffer.from('0204e13d13b66aaa', 'hex');
const CLAIM_REWARDS_V2_DISCRIMINATOR = Buffer.from('45319ee5d48588e3', 'hex');

interface DecodedRewarder {
  base: string;
  bump: number;
  authority: string;
  pendingAuthority: string;
  numQuarries: number;
  annualRewardsRate: bigint;
  totalRewardsShares: bigint;
  mintWrapper: string;
  rewardsTokenMint: string;
  claimFeeTokenAccount: string;
  maxClaimFeeMilliBps: bigint;
  pauseAuthority: string;
  isPaused: boolean;
}

interface DecodedQuarry {
  rewarder: string;
  tokenMintKey: string;
  bump: number;
  index: number;
  tokenMintDecimals: number;
  famineTs: number;
  lastUpdateTs: number;
  rewardsPerTokenStored: bigint;
  annualRewardsRate: bigint;
  rewardsShare: bigint;
  totalTokensDeposited: bigint;
  numMiners: bigint;
}

interface DecodedMiner {
  quarry: string;
  authority: string;
  bump: number;
  tokenVaultKey: string;
  rewardsEarned: bigint;
  rewardsPerTokenPaid: bigint;
  balance: bigint;
  index: bigint;
}

interface WalletTokenAccount {
  address: PublicKey;
  rawAmount: bigint;
}

interface ClaimableRewardsEstimate {
  amount: string | null;
  simulationError: string | null;
}

interface LiveStakingState {
  rewarderKey: PublicKey;
  quarryKey: PublicKey;
  mintWrapperKey: PublicKey;
  minterKey: PublicKey;
  sampleMinerKey: PublicKey;
  stakeTokenMintKey: PublicKey;
  rewardTokenMintKey: PublicKey;
  userMinerKey: PublicKey | null;
  rewarderInfo: AccountInfo<Buffer> | null;
  quarryInfo: AccountInfo<Buffer> | null;
  mintWrapperInfo: AccountInfo<Buffer> | null;
  minterInfo: AccountInfo<Buffer> | null;
  sampleMinerInfo: AccountInfo<Buffer> | null;
  userMinerInfo: AccountInfo<Buffer> | null;
  decodedRewarder: DecodedRewarder | null;
  decodedQuarry: DecodedQuarry | null;
  decodedUserMiner: DecodedMiner | null;
  stakeMintInfo: Awaited<ReturnType<typeof getMint>> | null;
  rewardMintInfo: Awaited<ReturnType<typeof getMint>> | null;
  userWalletBalance: string | null;
  userRewardWalletBalance: string | null;
  sampleStakeWalletBalance: string | null;
  sampleRewardWalletBalance: string | null;
}

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
  kedolikMintWrapperProgramId: string;
  fetchLiveQuarries: (walletPublicKey?: PublicKey | null) => Promise<KedolikStakingQuarrySummary[]>;
  stake: (amountRaw: string) => Promise<string>;
  unstake: (amountRaw: string) => Promise<string>;
  claimRewards: () => Promise<string>;
  getUserMinerAddress: (authority: PublicKey) => string;
  getStatusMessage: () => string;
}

class ByteCursor {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.bytes = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readBytes(length: number) {
    const nextOffset = this.offset + length;
    if (nextOffset > this.bytes.length) {
      throw new Error('Unexpected end of staking account data.');
    }

    const slice = this.bytes.slice(this.offset, nextOffset);
    this.offset = nextOffset;
    return slice;
  }

  readPublicKey() {
    return new PublicKey(this.readBytes(32));
  }

  readU8() {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readU16() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readU64() {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readI64() {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return Number(value);
  }

  readU128() {
    const lower = this.view.getBigUint64(this.offset, true);
    const upper = this.view.getBigUint64(this.offset + 8, true);
    this.offset += 16;
    return (upper << 64n) + lower;
  }

  readBool() {
    return this.readU8() === 1;
  }
}

const decodeAccount = <T>(
  accountInfo: AccountInfo<Buffer> | null,
  decode: (bytes: Uint8Array) => T
): T | null => {
  if (!accountInfo) {
    return null;
  }

  const rawBytes = new Uint8Array(accountInfo.data);
  if (rawBytes.length <= ANCHOR_DISCRIMINATOR_LENGTH) {
    throw new Error('Invalid staking account data.');
  }

  return decode(rawBytes.slice(ANCHOR_DISCRIMINATOR_LENGTH));
};

const decodeRewarder = (bytes: Uint8Array): DecodedRewarder => {
  const cursor = new ByteCursor(bytes);
  return {
    base: cursor.readPublicKey().toString(),
    bump: cursor.readU8(),
    authority: cursor.readPublicKey().toString(),
    pendingAuthority: cursor.readPublicKey().toString(),
    numQuarries: cursor.readU16(),
    annualRewardsRate: cursor.readU64(),
    totalRewardsShares: cursor.readU64(),
    mintWrapper: cursor.readPublicKey().toString(),
    rewardsTokenMint: cursor.readPublicKey().toString(),
    claimFeeTokenAccount: cursor.readPublicKey().toString(),
    maxClaimFeeMilliBps: cursor.readU64(),
    pauseAuthority: cursor.readPublicKey().toString(),
    isPaused: cursor.readBool(),
  };
};

const decodeQuarry = (bytes: Uint8Array): DecodedQuarry => {
  const cursor = new ByteCursor(bytes);
  return {
    rewarder: cursor.readPublicKey().toString(),
    tokenMintKey: cursor.readPublicKey().toString(),
    bump: cursor.readU8(),
    index: cursor.readU16(),
    tokenMintDecimals: cursor.readU8(),
    famineTs: cursor.readI64(),
    lastUpdateTs: cursor.readI64(),
    rewardsPerTokenStored: cursor.readU128(),
    annualRewardsRate: cursor.readU64(),
    rewardsShare: cursor.readU64(),
    totalTokensDeposited: cursor.readU64(),
    numMiners: cursor.readU64(),
  };
};

const decodeMiner = (bytes: Uint8Array): DecodedMiner => {
  const cursor = new ByteCursor(bytes);
  return {
    quarry: cursor.readPublicKey().toString(),
    authority: cursor.readPublicKey().toString(),
    bump: cursor.readU8(),
    tokenVaultKey: cursor.readPublicKey().toString(),
    rewardsEarned: cursor.readU64(),
    rewardsPerTokenPaid: cursor.readU128(),
    balance: cursor.readU64(),
    index: cursor.readU64(),
  };
};

const formatBigIntToString = (value: bigint | null) => (value === null ? null : value.toString());

const getTokenBalanceForMint = async (
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
) => {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  const totalRawAmount = accounts.value.reduce((sum, account) => {
    const parsedData = account.account.data;
    if (!('parsed' in parsedData)) {
      return sum;
    }

    const amount = parsedData.parsed?.info?.tokenAmount?.amount ?? '0';
    return sum + BigInt(amount);
  }, 0n);

  return totalRawAmount.toString();
};

const getTokenAccountBalance = async (connection: Connection, accountAddress: string) => {
  try {
    const response = await connection.getTokenAccountBalance(new PublicKey(accountAddress), 'confirmed');
    return response.value.amount;
  } catch {
    return null;
  }
};

const getDerivedRewardsPerSecond = (annualRewardsRate: bigint | null) => {
  if (annualRewardsRate === null) {
    return null;
  }

  return (annualRewardsRate / BigInt(YEAR_SECONDS)).toString();
};

const getMinerPda = (authority: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from('Miner'),
      new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.quarry).toBuffer(),
      authority.toBuffer(),
    ],
    KEDOLIK_DEVNET_PUBLIC_KEYS.kedolikStakingProgram
  )[0];

const getClaimableRewardsState = (
  miner: DecodedMiner | null,
  quarry: DecodedQuarry | null
): KedolikStakingQuarrySummary['claimableRewardsState'] => {
  if (!miner || !quarry) {
    return 'pending';
  }

  return 'ready';
};

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

const getStatusMessage = (rewarderExists: boolean, quarryExists: boolean) => {
  if (!rewarderExists || !quarryExists) {
    return 'Live pool data not found on the current RPC endpoint';
  }

  return 'Live on Devnet';
};

const assertWallet = (wallet?: AnchorWallet | null): AnchorWallet => {
  if (!wallet?.publicKey || !wallet.signTransaction) {
    throw new Error('Connect a wallet to use Kedolik Staking.');
  }

  return wallet;
};

const toU64Buffer = (value: bigint) => {
  if (value < 0n || value > MAX_U64) {
    throw new Error('Amount is outside the supported staking range.');
  }

  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value, 0);
  return buffer;
};

const buildInstructionData = (discriminator: Buffer, amount?: bigint) =>
  amount === undefined ? discriminator : Buffer.concat([discriminator, toU64Buffer(amount)]);

const buildStakingInstruction = (
  accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  data: Buffer
) =>
  new TransactionInstruction({
    programId: KEDOLIK_DEVNET_PUBLIC_KEYS.kedolikStakingProgram,
    keys: accounts,
    data,
  });

const isAlreadyProcessedTransactionError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('already been processed');
};

const getTransactionErrorMessage = async (connection: Connection, error: unknown) => {
  if (!(error instanceof SendTransactionError)) {
    return error instanceof Error ? error.message : 'Kedolik Staking transaction failed.';
  }

  try {
    const logs = await error.getLogs(connection);
    if (logs.length > 0) {
      return `${error.message}\nLogs:\n${logs.join('\n')}`;
    }
  } catch {
    // Keep the original message when log retrieval fails.
  }

  return error.message;
};

const sendAndConfirmStakingTransaction = async (
  connection: Connection,
  wallet: AnchorWallet,
  transaction: Transaction,
  signers: Keypair[] = []
) => {
  transaction.feePayer = wallet.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latestBlockhash.blockhash;

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }

  const signedTransaction = await wallet.signTransaction(transaction);
  const rawTransaction = signedTransaction.serialize();
  const signatureBytes = signedTransaction.signature;

  if (!signatureBytes) {
    throw new Error('Wallet returned an unsigned staking transaction.');
  }

  const signature = bs58.encode(signatureBytes);

  try {
    await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    if (!isAlreadyProcessedTransactionError(error)) {
      throw new Error(await getTransactionErrorMessage(connection, error));
    }
  }

  const confirmation = await confirmTransactionWithBlockhash(
    connection,
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  if (confirmation.value?.err) {
    throw new Error(
      typeof confirmation.value.err === 'string'
        ? confirmation.value.err
        : JSON.stringify(confirmation.value.err)
    );
  }

  return signature;
};

const findWalletTokenAccountForMint = async (
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<WalletTokenAccount | null> => {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
  const tokenAccounts = accounts.value
    .map((account) => {
      const parsedData = account.account.data;
      if (!('parsed' in parsedData)) {
        return null;
      }

      const rawAmount = BigInt(parsedData.parsed?.info?.tokenAmount?.amount ?? '0');
      return {
        address: account.pubkey,
        rawAmount,
      };
    })
    .filter((account): account is WalletTokenAccount => account !== null)
    .sort((left, right) => {
      if (left.rawAmount === right.rawAmount) {
        return 0;
      }

      return left.rawAmount > right.rawAmount ? -1 : 1;
    });

  return tokenAccounts[0] ?? null;
};

const ensureAtaInstruction = async (
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): Promise<{ address: PublicKey; instruction: TransactionInstruction | null }> => {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const existingAccount = await connection.getAccountInfo(ata, 'confirmed');

  if (existingAccount) {
    return {
      address: ata,
      instruction: null,
    };
  }

  return {
    address: ata,
    instruction: createAssociatedTokenAccountInstruction(payer, ata, owner, mint),
  };
};

const getTokenAccountAmountFromSimulation = (
  accountInfo:
    | {
        data: string[];
      }
    | null
) => {
  if (!accountInfo) {
    return 0n;
  }

  const encodedData = accountInfo.data[0];
  if (!encodedData) {
    return 0n;
  }

  const rawData = Buffer.from(encodedData, 'base64');
  if (rawData.length < ACCOUNT_SIZE) {
    return 0n;
  }

  const decoded = rawData.subarray(64, 72);
  return decoded.readBigUInt64LE(0);
};

const buildClaimRewardsTransaction = async (
  connection: Connection,
  authority: PublicKey,
  state: LiveStakingState
) => {
  const rewardsTokenAccount = await ensureAtaInstruction(
    connection,
    authority,
    authority,
    state.rewardTokenMintKey
  );
  const transaction = new Transaction();

  if (rewardsTokenAccount.instruction) {
    transaction.add(rewardsTokenAccount.instruction);
  }

  transaction.add(
    buildClaimRewardsV2Instruction(
      state.mintWrapperKey,
      KEDOLIK_DEVNET_PUBLIC_KEYS.kedolikMintWrapperProgram,
      state.minterKey,
      state.rewardTokenMintKey,
      rewardsTokenAccount.address,
      new PublicKey(state.decodedRewarder!.claimFeeTokenAccount),
      authority,
      state.userMinerKey!,
      state.quarryKey,
      state.rewarderKey
    )
  );

  transaction.feePayer = authority;

  return {
    transaction,
    rewardsTokenAccountAddress: rewardsTokenAccount.address,
  };
};

const simulateClaimableRewards = async (
  connection: Connection,
  authority: PublicKey,
  state: LiveStakingState
): Promise<ClaimableRewardsEstimate> => {
  if (!state.decodedRewarder || !state.decodedQuarry || !state.decodedUserMiner || !state.userMinerKey) {
    return {
      amount: formatBigIntToString(state.decodedUserMiner?.rewardsEarned ?? null),
      simulationError: null,
    };
  }

  try {
    const { transaction, rewardsTokenAccountAddress } = await buildClaimRewardsTransaction(
      connection,
      authority,
      state
    );
    const preClaimTokenAccount = await connection.getAccountInfo(rewardsTokenAccountAddress, 'confirmed');
    const preClaimAmount = preClaimTokenAccount
      ? getTokenAccountAmountFromSimulation({
          data: [preClaimTokenAccount.data.toString('base64'), 'base64'],
        })
      : 0n;
    const simulation = await connection.simulateTransaction(
      transaction,
      undefined,
      [rewardsTokenAccountAddress]
    );

    if (simulation.value.err) {
      return {
        amount: formatBigIntToString(state.decodedUserMiner.rewardsEarned),
        simulationError: JSON.stringify(simulation.value.err),
      };
    }

    const postClaimAmount = getTokenAccountAmountFromSimulation(simulation.value.accounts?.[0] ?? null);
    const estimatedClaimable = postClaimAmount - preClaimAmount;

    return {
      amount: estimatedClaimable >= 0n ? estimatedClaimable.toString() : '0',
      simulationError: null,
    };
  } catch (simulationError) {
    return {
      amount: formatBigIntToString(state.decodedUserMiner.rewardsEarned),
      simulationError:
        simulationError instanceof Error
          ? simulationError.message
          : 'Unable to simulate claimable rewards on the current RPC endpoint.',
    };
  }
};

const fetchLiveStakingState = async (
  connection: Connection,
  walletPublicKey?: PublicKey | null
): Promise<LiveStakingState> => {
  const rewarderKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.rewarder);
  const quarryKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.quarry);
  const mintWrapperKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.mintWrapper);
  const minterKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.minter);
  const sampleMinerKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.miner);
  const stakeTokenMintKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.stakeTokenMint);
  const rewardTokenMintKey = new PublicKey(KEDOLIK_DEVNET_STAKING_LIVE.rewardTokenMint);
  const userMinerKey = walletPublicKey ? getMinerPda(walletPublicKey) : null;

  const objectKeys = [
    mintWrapperKey,
    rewarderKey,
    quarryKey,
    minterKey,
    sampleMinerKey,
    ...(userMinerKey ? [userMinerKey] : []),
  ];

  const accountInfos = await connection.getMultipleAccountsInfo(objectKeys, 'confirmed');
  const mintWrapperInfo = accountInfos[0] ?? null;
  const rewarderInfo = accountInfos[1] ?? null;
  const quarryInfo = accountInfos[2] ?? null;
  const minterInfo = accountInfos[3] ?? null;
  const sampleMinerInfo = accountInfos[4] ?? null;
  const userMinerInfo = userMinerKey ? accountInfos[5] ?? null : null;

  const decodedRewarder = decodeAccount(rewarderInfo, decodeRewarder);
  const decodedQuarry = decodeAccount(quarryInfo, decodeQuarry);
  const decodedUserMiner = decodeAccount(userMinerInfo, decodeMiner);

  const [
    stakeMintInfo,
    rewardMintInfo,
    userWalletBalance,
    userRewardWalletBalance,
    sampleStakeWalletBalance,
    sampleRewardWalletBalance,
  ] =
    await Promise.all([
      getMint(connection, stakeTokenMintKey, 'confirmed').catch(() => null),
      getMint(connection, rewardTokenMintKey, 'confirmed').catch(() => null),
      walletPublicKey
        ? getTokenBalanceForMint(connection, walletPublicKey, stakeTokenMintKey).catch(() => null)
        : Promise.resolve(null),
      walletPublicKey
        ? getTokenBalanceForMint(connection, walletPublicKey, rewardTokenMintKey).catch(() => null)
        : Promise.resolve(null),
      getTokenAccountBalance(connection, KEDOLIK_DEVNET_STAKING_LIVE.userStakeTokenAccount),
      getTokenAccountBalance(connection, KEDOLIK_DEVNET_STAKING_LIVE.userRewardTokenAccount),
    ]);

  return {
    rewarderKey,
    quarryKey,
    mintWrapperKey,
    minterKey,
    sampleMinerKey,
    stakeTokenMintKey,
    rewardTokenMintKey,
    userMinerKey,
    rewarderInfo,
    quarryInfo,
    mintWrapperInfo,
    minterInfo,
    sampleMinerInfo,
    userMinerInfo,
    decodedRewarder,
    decodedQuarry,
    decodedUserMiner,
    stakeMintInfo,
    rewardMintInfo,
    userWalletBalance,
    userRewardWalletBalance,
    sampleStakeWalletBalance,
    sampleRewardWalletBalance,
  };
};

const mapStateToSummary = (state: LiveStakingState): KedolikStakingQuarrySummary => {
  const claimableRewardsState = getClaimableRewardsState(state.decodedUserMiner, state.decodedQuarry);
  const claimableRewards =
    claimableRewardsState === 'refreshing'
      ? null
      : formatBigIntToString(state.decodedUserMiner?.rewardsEarned ?? null);

  return {
    id: KEDOLIK_DEVNET_STAKING_LIVE.quarry,
    title: 'Kedolik Staking',
    description: 'Live devnet staking pool with wallet, stake, and reward transactions.',
    quarryAddress: state.quarryKey.toString(),
    rewarderAddress: state.rewarderKey.toString(),
    mintWrapperAddress: state.mintWrapperKey.toString(),
    minterAddress: state.minterKey.toString(),
    sampleMinerAddress: state.sampleMinerKey.toString(),
    derivedUserMinerAddress: state.userMinerKey?.toString() ?? null,
    stakeTokenMint: state.decodedQuarry?.tokenMintKey ?? state.stakeTokenMintKey.toString(),
    rewardTokenMint: state.decodedRewarder?.rewardsTokenMint ?? state.rewardTokenMintKey.toString(),
    stakeTokenSymbol: shortenAddress(state.decodedQuarry?.tokenMintKey ?? state.stakeTokenMintKey.toString()),
    rewardTokenSymbol: shortenAddress(
      state.decodedRewarder?.rewardsTokenMint ?? state.rewardTokenMintKey.toString()
    ),
    stakeTokenDecimals: state.stakeMintInfo?.decimals ?? state.decodedQuarry?.tokenMintDecimals ?? null,
    rewardTokenDecimals: state.rewardMintInfo?.decimals ?? null,
    totalStaked: formatBigIntToString(state.decodedQuarry?.totalTokensDeposited ?? null),
    stakers: state.decodedQuarry ? state.decodedQuarry.numMiners.toString() : null,
    rewardRate: formatBigIntToString(
      state.decodedQuarry?.annualRewardsRate ?? state.decodedRewarder?.annualRewardsRate ?? null
    ),
    rewardsPerSecondEstimate: getDerivedRewardsPerSecond(
      state.decodedQuarry?.annualRewardsRate ?? state.decodedRewarder?.annualRewardsRate ?? null
    ),
    userWalletBalance: state.userWalletBalance,
    userRewardWalletBalance: state.userRewardWalletBalance,
    userStake: formatBigIntToString(state.decodedUserMiner?.balance ?? null),
    claimableRewards,
    claimableRewardsState,
    lastCheckpointTs: state.decodedQuarry?.lastUpdateTs ?? null,
    hasMiner: Boolean(state.decodedUserMiner),
    status: state.rewarderInfo && state.quarryInfo ? 'live' : 'awaiting_deployment',
    statusMessage: getStatusMessage(Boolean(state.rewarderInfo), Boolean(state.quarryInfo)),
    sampleStakeWalletBalance: state.sampleStakeWalletBalance,
    sampleRewardWalletBalance: state.sampleRewardWalletBalance,
    objectStatuses: {
      mintWrapper: {
        address: state.mintWrapperKey.toString(),
        exists: Boolean(state.mintWrapperInfo),
      },
      rewarder: {
        address: state.rewarderKey.toString(),
        exists: Boolean(state.rewarderInfo),
      },
      quarry: {
        address: state.quarryKey.toString(),
        exists: Boolean(state.quarryInfo),
      },
      minter: {
        address: state.minterKey.toString(),
        exists: Boolean(state.minterInfo),
      },
      sampleMiner: {
        address: state.sampleMinerKey.toString(),
        exists: Boolean(state.sampleMinerInfo),
      },
      userMiner: state.userMinerKey
        ? {
            address: state.userMinerKey.toString(),
            exists: Boolean(state.userMinerInfo),
          }
        : null,
    },
  };
};

const createMinerVaultInstructionSet = async (
  connection: Connection,
  payer: PublicKey,
  stakeTokenMintKey: PublicKey,
  minerKey: PublicKey
) => {
  const minerVault = Keypair.generate();
  const rentLamports = await connection.getMinimumBalanceForRentExemption(
    TOKEN_ACCOUNT_RENT_SPACE,
    'confirmed'
  );

  return {
    minerVault,
    instructions: [
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: minerVault.publicKey,
        lamports: rentLamports,
        space: TOKEN_ACCOUNT_RENT_SPACE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(minerVault.publicKey, stakeTokenMintKey, minerKey),
    ],
  };
};

const buildCreateMinerV2Instruction = (
  authority: PublicKey,
  miner: PublicKey,
  quarry: PublicKey,
  rewarder: PublicKey,
  stakeTokenMint: PublicKey,
  minerVault: PublicKey
) =>
  buildStakingInstruction(
    [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: miner, isSigner: false, isWritable: true },
      { pubkey: quarry, isSigner: false, isWritable: true },
      { pubkey: rewarder, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: stakeTokenMint, isSigner: false, isWritable: false },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    buildInstructionData(CREATE_MINER_V2_DISCRIMINATOR)
  );

const buildStakeTokensInstruction = (
  authority: PublicKey,
  miner: PublicKey,
  quarry: PublicKey,
  minerVault: PublicKey,
  sourceTokenAccount: PublicKey,
  rewarder: PublicKey,
  rawAmount: bigint
) =>
  buildStakingInstruction(
    [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: miner, isSigner: false, isWritable: true },
      { pubkey: quarry, isSigner: false, isWritable: true },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: rewarder, isSigner: false, isWritable: false },
    ],
    buildInstructionData(STAKE_TOKENS_DISCRIMINATOR, rawAmount)
  );

const buildWithdrawTokensInstruction = (
  authority: PublicKey,
  miner: PublicKey,
  quarry: PublicKey,
  minerVault: PublicKey,
  destinationTokenAccount: PublicKey,
  rewarder: PublicKey,
  rawAmount: bigint
) =>
  buildStakingInstruction(
    [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: miner, isSigner: false, isWritable: true },
      { pubkey: quarry, isSigner: false, isWritable: true },
      { pubkey: minerVault, isSigner: false, isWritable: true },
      { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: rewarder, isSigner: false, isWritable: false },
    ],
    buildInstructionData(WITHDRAW_TOKENS_DISCRIMINATOR, rawAmount)
  );

const buildClaimRewardsV2Instruction = (
  mintWrapper: PublicKey,
  mintWrapperProgram: PublicKey,
  minter: PublicKey,
  rewardsTokenMint: PublicKey,
  rewardsTokenAccount: PublicKey,
  claimFeeTokenAccount: PublicKey,
  authority: PublicKey,
  miner: PublicKey,
  quarry: PublicKey,
  rewarder: PublicKey
) =>
  buildStakingInstruction(
    [
      { pubkey: mintWrapper, isSigner: false, isWritable: true },
      { pubkey: mintWrapperProgram, isSigner: false, isWritable: false },
      { pubkey: minter, isSigner: false, isWritable: true },
      { pubkey: rewardsTokenMint, isSigner: false, isWritable: true },
      { pubkey: rewardsTokenAccount, isSigner: false, isWritable: true },
      { pubkey: claimFeeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: miner, isSigner: false, isWritable: true },
      { pubkey: quarry, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: rewarder, isSigner: false, isWritable: true },
    ],
    buildInstructionData(CLAIM_REWARDS_V2_DISCRIMINATOR)
  );

const assertRawAmount = (amountRaw: string): bigint => {
  const normalized = amountRaw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Enter a valid staking amount.');
  }

  const rawAmount = BigInt(normalized);
  if (rawAmount <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }

  return rawAmount;
};

export const createKedolikStakingService = (
  connection: Connection,
  wallet?: AnchorWallet | null
): KedolikStakingService => ({
  cluster: KEDOLIK_DEVNET_CONFIG.cluster,
  kedolikStakingProgramId: KEDOLIK_DEVNET_CONFIG.kedolikStakingProgramId,
  kedolikMintWrapperProgramId: KEDOLIK_DEVNET_CONFIG.kedolikMintWrapperProgramId,
  fetchLiveQuarries: async (walletPublicKey) => {
    const state = await fetchLiveStakingState(connection, walletPublicKey);
    const claimableEstimate =
      walletPublicKey && state.decodedUserMiner
        ? await simulateClaimableRewards(connection, walletPublicKey, state)
        : {
            amount: formatBigIntToString(state.decodedUserMiner?.rewardsEarned ?? null),
            simulationError: null,
          };
    const summary = mapStateToSummary(state);

    return [
      {
        ...summary,
        claimableRewards: claimableEstimate.amount,
        claimableRewardsState:
          summary.hasMiner && claimableEstimate.simulationError
            ? 'refreshing'
            : summary.claimableRewardsState,
      },
    ];
  },
  stake: async (amountRaw) => {
    const signerWallet = assertWallet(wallet);
    const rawAmount = assertRawAmount(amountRaw);
    const state = await fetchLiveStakingState(connection, signerWallet.publicKey);

    if (!state.decodedRewarder || !state.decodedQuarry || !state.userMinerKey) {
      throw new Error('Live staking pool data could not be loaded from devnet.');
    }

    const sourceTokenAccount = await findWalletTokenAccountForMint(
      connection,
      signerWallet.publicKey,
      state.stakeTokenMintKey
    );

    if (!sourceTokenAccount || sourceTokenAccount.rawAmount < rawAmount) {
      throw new Error('Not enough stake token balance in the connected wallet.');
    }

    const transaction = new Transaction();
    const signers: Keypair[] = [];
    let minerVault = state.decodedUserMiner?.tokenVaultKey
      ? new PublicKey(state.decodedUserMiner.tokenVaultKey)
      : null;

    if (!state.decodedUserMiner) {
      const minerVaultSetup = await createMinerVaultInstructionSet(
        connection,
        signerWallet.publicKey,
        state.stakeTokenMintKey,
        state.userMinerKey
      );

      minerVault = minerVaultSetup.minerVault.publicKey;
      transaction.add(...minerVaultSetup.instructions);
      transaction.add(
        buildCreateMinerV2Instruction(
          signerWallet.publicKey,
          state.userMinerKey,
          state.quarryKey,
          state.rewarderKey,
          state.stakeTokenMintKey,
          minerVault
        )
      );
      signers.push(minerVaultSetup.minerVault);
    }

    if (!minerVault) {
      throw new Error('Could not determine the miner vault for this staking position.');
    }

    transaction.add(
      buildStakeTokensInstruction(
        signerWallet.publicKey,
        state.userMinerKey,
        state.quarryKey,
        minerVault,
        sourceTokenAccount.address,
        state.rewarderKey,
        rawAmount
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction, signers);
  },
  unstake: async (amountRaw) => {
    const signerWallet = assertWallet(wallet);
    const rawAmount = assertRawAmount(amountRaw);
    const state = await fetchLiveStakingState(connection, signerWallet.publicKey);

    if (!state.decodedRewarder || !state.decodedQuarry || !state.userMinerKey || !state.decodedUserMiner) {
      throw new Error('No stake yet.');
    }

    if (state.decodedUserMiner.balance < rawAmount) {
      throw new Error('Unstake amount exceeds your current stake.');
    }

    const destinationTokenAccount = await ensureAtaInstruction(
      connection,
      signerWallet.publicKey,
      signerWallet.publicKey,
      state.stakeTokenMintKey
    );
    const transaction = new Transaction();

    if (destinationTokenAccount.instruction) {
      transaction.add(destinationTokenAccount.instruction);
    }

    transaction.add(
      buildWithdrawTokensInstruction(
        signerWallet.publicKey,
        state.userMinerKey,
        state.quarryKey,
        new PublicKey(state.decodedUserMiner.tokenVaultKey),
        destinationTokenAccount.address,
        state.rewarderKey,
        rawAmount
      )
    );

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  claimRewards: async () => {
    const signerWallet = assertWallet(wallet);
    const state = await fetchLiveStakingState(connection, signerWallet.publicKey);

    if (!state.decodedRewarder || !state.decodedQuarry || !state.userMinerKey || !state.decodedUserMiner) {
      throw new Error('No stake yet.');
    }

    const claimableEstimate = await simulateClaimableRewards(connection, signerWallet.publicKey, state);
    if (
      claimableEstimate.simulationError === null &&
      (!claimableEstimate.amount || BigInt(claimableEstimate.amount) === 0n)
    ) {
      throw new Error('No rewards to claim yet.');
    }

    const { transaction } = await buildClaimRewardsTransaction(connection, signerWallet.publicKey, state);

    return sendAndConfirmStakingTransaction(connection, signerWallet, transaction);
  },
  getUserMinerAddress: (authority) => getMinerPda(authority).toString(),
  getStatusMessage: () => 'Live on Devnet',
});

export const getKedolikStakingPlaceholderMessage = () => 'Live on Devnet';
