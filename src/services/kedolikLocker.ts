import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  AccountState,
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
  KEDOLIK_STAKE_LOCK_PROGRAM_ID,
} from '../config/kedolikStakeLockV1';
import { confirmTransactionWithBlockhash } from '../utils/transactionConfirmation';

const TOKEN_LOCK_DISCRIMINATOR = Buffer.from('49e490f19a2c5dee', 'hex');
const CREATE_LOCK_DISCRIMINATOR = Buffer.from('abd85ca7a508995a', 'hex');
const UNLOCK_DISCRIMINATOR = Buffer.from('659b28159ebd38cb', 'hex');

interface TokenLockState {
  owner: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  amount: bigint;
  unlockTs: number;
  lockId: bigint | null;
}

export interface LockerEscrowAccountState {
  recipient: PublicKey;
  tokenMint: PublicKey;
  creator: PublicKey;
  base: PublicKey;
  escrowBump: number;
  updateRecipientMode: number;
  cancelMode: number;
  tokenProgramFlag: number;
  cliffTime: { toString(): string };
  frequency: { toString(): string };
  cliffUnlockAmount: { toString(): string };
  amountPerPeriod: { toString(): string };
  numberOfPeriod: { toString(): string };
  totalClaimedAmount: { toString(): string };
  vestingStartTime: { toString(): string };
  cancelledAt: { toString(): string };
}

export interface LockerEscrowSummary {
  address: string;
  recipient: string;
  creator: string;
  tokenMint: string;
  tokenProgramId: string;
  tokenDecimals: number | null;
  vestingStartTime: number;
  cliffTime: number;
  frequency: number;
  cliffUnlockAmount: string;
  amountPerPeriod: string;
  numberOfPeriod: number;
  totalClaimedAmount: string;
  scheduledTotalAmount: string;
  unlockedAmount: string;
  lockedAmount: string;
  claimableAmount: string;
  cancelledAt: number;
  isCancelled: boolean;
  walletRole: 'creator' | 'recipient' | 'viewer';
  walletMatchesCreator: boolean;
  walletMatchesRecipient: boolean;
  updateRecipientMode: number;
  cancelMode: number;
}

export interface CreateVestingEscrowInput {
  recipient: string;
  tokenMint: string;
  lockId?: string;
  vestingStartTime: number;
  cliffTime: number;
  frequency: number;
  cliffUnlockAmount: string;
  amountPerPeriod: string;
  numberOfPeriod: number;
  updateRecipientMode?: number;
  cancelMode?: number;
  senderToken?: string;
  tokenProgramId?: string;
}

interface EnsureAtaResult {
  address: PublicKey;
  instruction: TransactionInstruction | null;
}

const toPublicKey = (value: string) => {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid Solana address: ${value}`);
  }
};

const assertWallet = (wallet?: AnchorWallet): AnchorWallet => {
  if (!wallet?.publicKey) {
    throw new Error('Connect a wallet before submitting locker transactions.');
  }

  return wallet;
};

const writeU64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
};

const writeI64 = (value: bigint) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
};

const assertU64String = (value: string, label: string) => {
  try {
    const parsed = BigInt(value);
    const maxU64 = (1n << 64n) - 1n;

    if (parsed < 0n || parsed > maxU64) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer.`);
  }
};

const readU64 = (data: Buffer, offset: number) =>
  data.length >= offset + 8 ? data.readBigUInt64LE(offset) : 0n;

const readI64 = (data: Buffer, offset: number) =>
  data.length >= offset + 8 ? data.readBigInt64LE(offset) : 0n;

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32));

export const getTokenLockPda = (owner: PublicKey, mint: PublicKey, lockId: bigint) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('lock'), owner.toBuffer(), mint.toBuffer(), writeU64(lockId)],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

export const getLockVaultPda = (tokenLock: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('lock_vault'), tokenLock.toBuffer()],
    KEDOLIK_STAKE_LOCK_PROGRAM_ID
  )[0];

const getTokenProgramForMint = async (connection: Connection, mint: PublicKey) => {
  const accountInfo = await connection.getAccountInfo(mint, 'confirmed');

  if (!accountInfo) {
    throw new Error('Token CA was not found on the current RPC endpoint.');
  }

  if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error('Token CA must be a classic SPL Token mint address for Stake Lock V1.');
  }

  await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
  return TOKEN_PROGRAM_ID;
};

const ensureAta = async (
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
  allowOwnerOffCurve = false
): Promise<EnsureAtaResult> => {
  const address = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const accountInfo = await connection.getAccountInfo(address);

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

const findInitializedWalletTokenAccountForMint = async (
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
  minimumAmount: bigint
) => {
  const tokenAccounts = await connection.getTokenAccountsByOwner(owner, { mint }, 'confirmed');
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const candidates = tokenAccounts.value
    .map(({ pubkey, account }) => {
      if (!account.owner.equals(tokenProgramId) || account.data.length < AccountLayout.span) {
        return null;
      }

      const decoded = AccountLayout.decode(account.data);

      if (
        !decoded.mint.equals(mint) ||
        !decoded.owner.equals(owner) ||
        decoded.state !== AccountState.Initialized
      ) {
        return null;
      }

      return {
        address: pubkey,
        amount: decoded.amount,
        isAta: pubkey.equals(ata),
      };
    })
    .filter((candidate): candidate is { address: PublicKey; amount: bigint; isAta: boolean } =>
      candidate !== null
    )
    .sort((left, right) => {
      if (left.isAta !== right.isAta) {
        return left.isAta ? -1 : 1;
      }

      if (left.amount === right.amount) {
        return 0;
      }

      return left.amount > right.amount ? -1 : 1;
    });

  const fundedTokenAccount = candidates.find((candidate) => candidate.amount >= minimumAmount);

  if (fundedTokenAccount) {
    return fundedTokenAccount.address;
  }

  if (candidates.length > 0) {
    throw new Error('The connected wallet does not have enough unlocked tokens for this token CA.');
  }

  throw new Error('No initialized token account was found for this token CA in the connected wallet.');
};

const decodeTokenLockState = (data: Buffer): TokenLockState => {
  if (
    data.length < TOKEN_LOCK_DISCRIMINATOR.length + 122 ||
    !data.subarray(0, TOKEN_LOCK_DISCRIMINATOR.length).equals(TOKEN_LOCK_DISCRIMINATOR)
  ) {
    throw new Error('This account is not a Kedolik Stake Lock V1 lock.');
  }

  const owner = readPublicKey(data, 8);
  const mint = readPublicKey(data, 40);
  const vault = readPublicKey(data, 72);
  const lockId = readU64(data, 104);
  const amount = readU64(data, 112);
  const unlockTs = readI64(data, 120);

  return {
    owner,
    mint,
    vault,
    lockId,
    amount,
    unlockTs: Number(unlockTs),
  };
};

const getTokenDecimals = async (connection: Connection, mint: PublicKey) => {
  try {
    const mintInfo = await getMint(connection, mint, 'confirmed');
    return mintInfo.decimals;
  } catch {
    return null;
  }
};

const buildLockerSummary = async (
  connection: Connection,
  address: PublicKey,
  state: TokenLockState,
  walletAddress?: PublicKey
): Promise<LockerEscrowSummary> => {
  const now = Math.floor(Date.now() / 1000);
  const walletMatchesOwner = Boolean(walletAddress?.equals(state.owner));
  const amount = state.amount.toString();
  const isUnlocked = now >= state.unlockTs;
  const tokenProgramId = await getTokenProgramForMint(connection, state.mint)
    .then((programId) => programId.toString())
    .catch(() => TOKEN_PROGRAM_ID.toString());

  return {
    address: address.toString(),
    recipient: state.owner.toString(),
    creator: state.owner.toString(),
    tokenMint: state.mint.toString(),
    tokenProgramId,
    tokenDecimals: await getTokenDecimals(connection, state.mint),
    vestingStartTime: state.unlockTs,
    cliffTime: state.unlockTs,
    frequency: 1,
    cliffUnlockAmount: amount,
    amountPerPeriod: '0',
    numberOfPeriod: 1,
    totalClaimedAmount: '0',
    scheduledTotalAmount: amount,
    unlockedAmount: isUnlocked ? amount : '0',
    lockedAmount: isUnlocked ? '0' : amount,
    claimableAmount: isUnlocked ? amount : '0',
    cancelledAt: 0,
    isCancelled: false,
    walletRole: walletMatchesOwner ? 'recipient' : 'viewer',
    walletMatchesCreator: walletMatchesOwner,
    walletMatchesRecipient: walletMatchesOwner,
    updateRecipientMode: 0,
    cancelMode: 0,
  };
};

const fetchTokenLockState = async (connection: Connection, lockAddress: PublicKey) => {
  const accountInfo = await connection.getAccountInfo(lockAddress, 'confirmed');

  if (!accountInfo) {
    throw new Error('Lock account was not found on the current RPC endpoint.');
  }

  return decodeTokenLockState(Buffer.from(accountInfo.data));
};

const fetchTokenLockAccounts = async (connection: Connection) =>
  (await connection.getProgramAccounts(KEDOLIK_STAKE_LOCK_PROGRAM_ID, {
    commitment: 'confirmed',
  })).filter(({ account }) =>
    Buffer.from(account.data)
      .subarray(0, TOKEN_LOCK_DISCRIMINATOR.length)
      .equals(TOKEN_LOCK_DISCRIMINATOR)
  );

const sendAndConfirmLockerTransaction = async (
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
    throw new Error(`Locker transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
};

export const fetchLockerEscrow = async (
  connection: Connection,
  escrowAddress: string,
  walletAddress?: PublicKey
): Promise<LockerEscrowSummary> => {
  const lockAddress = toPublicKey(escrowAddress);
  const state = await fetchTokenLockState(connection, lockAddress);
  return buildLockerSummary(connection, lockAddress, state, walletAddress);
};

export const fetchLockerEscrowsForWallet = async (
  connection: Connection,
  walletAddress: PublicKey
): Promise<LockerEscrowSummary[]> => {
  const accounts = await fetchTokenLockAccounts(connection);
  const summaries = await Promise.all(
    accounts
      .map(({ pubkey, account }) => ({
        publicKey: pubkey,
        state: decodeTokenLockState(Buffer.from(account.data)),
      }))
      .filter(({ state }) => state.owner.equals(walletAddress))
      .map(({ publicKey, state }) => buildLockerSummary(connection, publicKey, state, walletAddress))
  );

  return summaries.sort((left, right) => right.vestingStartTime - left.vestingStartTime);
};

export const fetchAllLockerEscrows = async (
  connection: Connection
): Promise<LockerEscrowSummary[]> => {
  const accounts = await fetchTokenLockAccounts(connection);
  const summaries = await Promise.all(
    accounts.map(({ pubkey, account }) =>
      buildLockerSummary(connection, pubkey, decodeTokenLockState(Buffer.from(account.data)))
    )
  );

  return summaries.sort((left, right) => right.vestingStartTime - left.vestingStartTime);
};

const buildCreateLockInstruction = (
  owner: PublicKey,
  mint: PublicKey,
  ownerToken: PublicKey,
  tokenLock: PublicKey,
  lockVault: PublicKey,
  tokenProgram: PublicKey,
  lockId: bigint,
  amount: bigint,
  unlockTs: number
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenLock, isSigner: false, isWritable: true },
      { pubkey: lockVault, isSigner: false, isWritable: true },
      { pubkey: ownerToken, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      CREATE_LOCK_DISCRIMINATOR,
      writeU64(lockId),
      writeU64(amount),
      writeI64(BigInt(unlockTs)),
    ]),
  });

const buildUnlockInstruction = (
  owner: PublicKey,
  mint: PublicKey,
  ownerToken: PublicKey,
  tokenLock: PublicKey,
  lockVault: PublicKey,
  tokenProgram: PublicKey
) =>
  new TransactionInstruction({
    programId: KEDOLIK_STAKE_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenLock, isSigner: false, isWritable: true },
      { pubkey: lockVault, isSigner: false, isWritable: true },
      { pubkey: ownerToken, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: UNLOCK_DISCRIMINATOR,
  });

export const claimLockerEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  escrowAddress: string
): Promise<string> => {
  const signerWallet = assertWallet(wallet);
  const tokenLock = toPublicKey(escrowAddress);
  const state = await fetchTokenLockState(connection, tokenLock);

  if (!state.owner.equals(signerWallet.publicKey)) {
    throw new Error('Only the lock owner can unlock this Kedolik Stake Lock V1 lock.');
  }

  if (state.unlockTs > Math.floor(Date.now() / 1000)) {
    throw new Error('This lock has not reached its unlock time yet.');
  }

  const tokenProgram = await getTokenProgramForMint(connection, state.mint);
  const ownerToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    state.mint,
    tokenProgram
  );
  const lockVault = state.vault;
  const transaction = new Transaction();

  if (ownerToken.instruction) {
    transaction.add(ownerToken.instruction);
  }

  transaction.add(
    buildUnlockInstruction(
      signerWallet.publicKey,
      state.mint,
      ownerToken.address,
      tokenLock,
      lockVault,
      tokenProgram
    )
  );

  return sendAndConfirmLockerTransaction(connection, signerWallet, transaction);
};

export const cancelLockerEscrow = async (
  _connection: Connection,
  _wallet: AnchorWallet,
  _escrowAddress: string
): Promise<string> => {
  throw new Error('Stake Lock V1 does not expose a cancel lock action.');
};

export const closeLockerEscrow = async (
  _connection: Connection,
  _wallet: AnchorWallet,
  _escrowAddress: string
): Promise<string> => {
  throw new Error('Stake Lock V1 closes the lock account during unlock.');
};

export const updateLockerEscrowRecipient = async (
  _connection: Connection,
  _wallet: AnchorWallet,
  _escrowAddress: string,
  _newRecipient: string,
  _newRecipientEmail?: string
): Promise<string> => {
  throw new Error('Stake Lock V1 does not support updating the recipient wallet.');
};

export const createLockerVestingEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  input: CreateVestingEscrowInput
): Promise<{ signature: string; escrowAddress: string; baseAddress: string }> => {
  const signerWallet = assertWallet(wallet);
  const recipient = toPublicKey(input.recipient);

  if (!recipient.equals(signerWallet.publicKey)) {
    throw new Error(
      'Stake Lock V1 currently releases tokens back to the creator wallet. A separate recipient wallet requires a contract change.'
    );
  }

  const tokenMint = toPublicKey(input.tokenMint);
  const tokenProgram = await getTokenProgramForMint(connection, tokenMint);

  if (input.tokenProgramId && !toPublicKey(input.tokenProgramId).equals(TOKEN_PROGRAM_ID)) {
    throw new Error('Stake Lock V1 only supports the classic SPL Token program.');
  }
  const amount = BigInt(input.cliffUnlockAmount);
  const unlockTs = input.cliffTime;

  if (amount <= 0n) {
    throw new Error('Enter a token amount greater than zero.');
  }

  if (unlockTs <= Math.floor(Date.now() / 1000)) {
    throw new Error('Unlock date must be in the future.');
  }

  const lockId = input.lockId?.trim()
    ? assertU64String(input.lockId.trim(), 'Lock ID')
    : BigInt(Date.now());
  const tokenLock = getTokenLockPda(signerWallet.publicKey, tokenMint, lockId);
  const lockVault = getLockVaultPda(tokenLock);
  const ownerToken = input.senderToken
    ? toPublicKey(input.senderToken)
    : await findInitializedWalletTokenAccountForMint(
        connection,
        signerWallet.publicKey,
        tokenMint,
        tokenProgram,
        amount
      );
  const transaction = new Transaction();

  transaction.add(
    buildCreateLockInstruction(
      signerWallet.publicKey,
      tokenMint,
      ownerToken,
      tokenLock,
      lockVault,
      tokenProgram,
      lockId,
      amount,
      unlockTs
    )
  );

  const signature = await sendAndConfirmLockerTransaction(connection, signerWallet, transaction);

  return {
    signature,
    escrowAddress: tokenLock.toString(),
    baseAddress: lockId.toString(),
  };
};

export const getLockerActionErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message.trim() : String(error);

  if (!message) {
    return 'Locker transaction failed.';
  }

  if (message.includes('Account does not exist') || message.includes('was not found')) {
    return 'No matching Stake Lock V1 lock was found on the current RPC endpoint.';
  }

  return message;
};
