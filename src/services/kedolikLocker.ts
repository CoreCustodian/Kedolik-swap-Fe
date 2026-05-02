import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import lockerIdlJson from '../../locker.json';
import { KEDOLIK_DEVNET_CONFIG, KEDOLIK_DEVNET_PUBLIC_KEYS } from '../config/kedolikDevnet';

const LOCKER_IDL = lockerIdlJson as unknown as Idl;
const LOCKER_PROGRAM_ID = KEDOLIK_DEVNET_PUBLIC_KEYS.lockerProgram;
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const ESCROW_METADATA_SEED = Buffer.from('escrow_metadata');
const EVENT_AUTHORITY_SEED = Buffer.from('__event_authority');
const MAX_U64 = new BN('18446744073709551615');

const READONLY_WALLET = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async () => {
    throw new Error('Read-only locker client cannot sign transactions.');
  },
  signAllTransactions: async () => {
    throw new Error('Read-only locker client cannot sign transactions.');
  },
} as unknown as AnchorWallet;

type LockerProgram = Program<Idl> & {
  account: Record<string, { all?: () => Promise<Array<{ publicKey: PublicKey; account: unknown }>>; fetch?: (address: PublicKey) => Promise<unknown> }>;
  methods: Record<string, (...args: unknown[]) => { accounts: (accounts: Record<string, unknown>) => { instruction: () => Promise<TransactionInstruction>; rpc: () => Promise<string> } }>;
};

type BnLike = BN | { toString(): string } | number | string;

interface RawVestingEscrowAccount {
  recipient?: PublicKey;
  recipient_pubkey?: PublicKey;
  tokenMint?: PublicKey;
  token_mint?: PublicKey;
  creator?: PublicKey;
  base?: PublicKey;
  escrowBump?: number;
  escrow_bump?: number;
  updateRecipientMode?: number;
  update_recipient_mode?: number;
  cancelMode?: number;
  cancel_mode?: number;
  tokenProgramFlag?: number;
  token_program_flag?: number;
  cliffTime?: BnLike;
  cliff_time?: BnLike;
  frequency?: BnLike;
  cliffUnlockAmount?: BnLike;
  cliff_unlock_amount?: BnLike;
  amountPerPeriod?: BnLike;
  amount_per_period?: BnLike;
  numberOfPeriod?: BnLike;
  number_of_period?: BnLike;
  totalClaimedAmount?: BnLike;
  total_claimed_amount?: BnLike;
  vestingStartTime?: BnLike;
  vesting_start_time?: BnLike;
  cancelledAt?: BnLike;
  cancelled_at?: BnLike;
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
  cliffTime: BN;
  frequency: BN;
  cliffUnlockAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  totalClaimedAmount: BN;
  vestingStartTime: BN;
  cancelledAt: BN;
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

interface AnchorRpcBuilder {
  accounts: (accounts: Record<string, unknown>) => AnchorRpcBuilder;
  signers: (signers: Keypair[]) => AnchorRpcBuilder;
  instruction: () => Promise<TransactionInstruction>;
  rpc: () => Promise<string>;
}

const toPublicKey = (value: string | PublicKey): PublicKey =>
  value instanceof PublicKey ? value : new PublicKey(value);

const toBn = (value: BnLike | undefined): BN => {
  if (value instanceof BN) {
    return value;
  }

  if (value === undefined) {
    return new BN(0);
  }

  return new BN(value.toString());
};

const resolveLockerMethod = (
  program: LockerProgram,
  ...names: string[]
): ((...args: unknown[]) => AnchorRpcBuilder) => {
  for (const name of names) {
    const candidate = program.methods[name];
    if (typeof candidate === 'function') {
      return candidate.bind(program.methods) as (...args: unknown[]) => AnchorRpcBuilder;
    }
  }

  throw new Error(`Locker IDL is missing expected method: ${names[0]}`);
};

const getVestingEscrowNamespace = (program: LockerProgram) => {
  const accountNamespace =
    program.account.vestingEscrow ??
    program.account.vesting_escrow ??
    program.account.VestingEscrow;

  if (!accountNamespace) {
    throw new Error('Locker IDL is missing the VestingEscrow account namespace.');
  }

  return accountNamespace;
};

const getTokenProgramId = (tokenProgramFlag: number) =>
  tokenProgramFlag === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

const getLockerProvider = (connection: Connection, wallet?: AnchorWallet) =>
  new AnchorProvider(connection, wallet ?? READONLY_WALLET, { commitment: 'confirmed' });

export const getKedolikLockerProgram = (
  connection: Connection,
  wallet?: AnchorWallet
): LockerProgram => {
  const provider = getLockerProvider(connection, wallet);
  const idlWithCorrectAddress = {
    ...LOCKER_IDL,
    address: KEDOLIK_DEVNET_CONFIG.lockerProgramId,
  };

  return new Program(idlWithCorrectAddress as Idl, provider) as LockerProgram;
};

const sendAndConfirmLockerTransaction = async (
  program: LockerProgram,
  transaction: Transaction,
  signers: Keypair[] = []
) => (program.provider as AnchorProvider).sendAndConfirm(transaction, signers);

export const getLockerEventAuthority = (): PublicKey =>
  PublicKey.findProgramAddressSync([EVENT_AUTHORITY_SEED], LOCKER_PROGRAM_ID)[0];

export const getLockerEscrowMetadataPda = (escrow: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([ESCROW_METADATA_SEED, escrow.toBuffer()], LOCKER_PROGRAM_ID)[0];

export const getLockerEscrowPda = (base: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('escrow'), base.toBuffer()], LOCKER_PROGRAM_ID)[0];

export const isLockerIdlAvailable = () => Boolean(LOCKER_IDL);

const normalizeLockerError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown locker error.');
};

const decodeVestingEscrowState = (account: RawVestingEscrowAccount): LockerEscrowAccountState => ({
  recipient: account.recipient ?? account.recipient_pubkey ?? PublicKey.default,
  tokenMint: account.tokenMint ?? account.token_mint ?? PublicKey.default,
  creator: account.creator ?? PublicKey.default,
  base: account.base ?? PublicKey.default,
  escrowBump: account.escrowBump ?? account.escrow_bump ?? 0,
  updateRecipientMode: account.updateRecipientMode ?? account.update_recipient_mode ?? 0,
  cancelMode: account.cancelMode ?? account.cancel_mode ?? 0,
  tokenProgramFlag: account.tokenProgramFlag ?? account.token_program_flag ?? 0,
  cliffTime: toBn(account.cliffTime ?? account.cliff_time),
  frequency: toBn(account.frequency),
  cliffUnlockAmount: toBn(account.cliffUnlockAmount ?? account.cliff_unlock_amount),
  amountPerPeriod: toBn(account.amountPerPeriod ?? account.amount_per_period),
  numberOfPeriod: toBn(account.numberOfPeriod ?? account.number_of_period),
  totalClaimedAmount: toBn(account.totalClaimedAmount ?? account.total_claimed_amount),
  vestingStartTime: toBn(account.vestingStartTime ?? account.vesting_start_time),
  cancelledAt: toBn(account.cancelledAt ?? account.cancelled_at),
});

const bnMin = (left: BN, right: BN) => (left.lt(right) ? left : right);

const bnMax = (left: BN, right: BN) => (left.gt(right) ? left : right);

const calculateUnlockedAmount = (
  account: LockerEscrowAccountState,
  scheduledTotalAmount: BN
): BN => {
  const now = Math.floor(Date.now() / 1000);
  const effectiveTimestamp = account.cancelledAt.isZero()
    ? new BN(now)
    : account.cancelledAt;

  if (effectiveTimestamp.lt(account.cliffTime)) {
    return new BN(0);
  }

  let unlockedAmount = account.cliffUnlockAmount;

  if (account.numberOfPeriod.gt(new BN(0))) {
    if (account.frequency.isZero()) {
      unlockedAmount = unlockedAmount.add(account.amountPerPeriod.mul(account.numberOfPeriod));
    } else {
      const periodsElapsed = effectiveTimestamp
        .sub(account.cliffTime)
        .div(account.frequency);
      const unlockedPeriods = bnMin(periodsElapsed, account.numberOfPeriod);
      unlockedAmount = unlockedAmount.add(account.amountPerPeriod.mul(unlockedPeriods));
    }
  }

  return bnMin(unlockedAmount, scheduledTotalAmount);
};

const buildLockerSummary = async (
  connection: Connection,
  escrowAddress: PublicKey,
  account: LockerEscrowAccountState,
  walletAddress?: PublicKey
): Promise<LockerEscrowSummary> => {
  const tokenProgramId = getTokenProgramId(account.tokenProgramFlag);
  const scheduledTotalAmount = account.cliffUnlockAmount.add(
    account.amountPerPeriod.mul(account.numberOfPeriod)
  );
  const unlockedAmount = calculateUnlockedAmount(account, scheduledTotalAmount);
  const lockedAmount = bnMax(scheduledTotalAmount.sub(unlockedAmount), new BN(0));
  const claimableAmount = bnMax(unlockedAmount.sub(account.totalClaimedAmount), new BN(0));

  let tokenDecimals: number | null = null;

  try {
    const mintInfo = await getMint(connection, account.tokenMint, 'confirmed', tokenProgramId);
    tokenDecimals = mintInfo.decimals;
  } catch {
    tokenDecimals = null;
  }

  let walletRole: LockerEscrowSummary['walletRole'] = 'viewer';
  const walletMatchesCreator = walletAddress?.equals(account.creator) ?? false;
  const walletMatchesRecipient = walletAddress?.equals(account.recipient) ?? false;

  if (walletMatchesCreator) {
    walletRole = 'creator';
  } else if (walletMatchesRecipient) {
    walletRole = 'recipient';
  }

  return {
    address: escrowAddress.toString(),
    recipient: account.recipient.toString(),
    creator: account.creator.toString(),
    tokenMint: account.tokenMint.toString(),
    tokenProgramId: tokenProgramId.toString(),
    tokenDecimals,
    vestingStartTime: account.vestingStartTime.toNumber(),
    cliffTime: account.cliffTime.toNumber(),
    frequency: account.frequency.toNumber(),
    cliffUnlockAmount: account.cliffUnlockAmount.toString(),
    amountPerPeriod: account.amountPerPeriod.toString(),
    numberOfPeriod: account.numberOfPeriod.toNumber(),
    totalClaimedAmount: account.totalClaimedAmount.toString(),
    scheduledTotalAmount: scheduledTotalAmount.toString(),
    unlockedAmount: unlockedAmount.toString(),
    lockedAmount: lockedAmount.toString(),
    claimableAmount: claimableAmount.toString(),
    cancelledAt: account.cancelledAt.toNumber(),
    isCancelled: !account.cancelledAt.isZero(),
    walletRole,
    walletMatchesCreator,
    walletMatchesRecipient,
    updateRecipientMode: account.updateRecipientMode,
    cancelMode: account.cancelMode,
  };
};

const ensureAta = async (
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
  allowOwnerOffCurve: boolean = false
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

const assertWallet = (wallet?: AnchorWallet): AnchorWallet => {
  if (!wallet?.publicKey) {
    throw new Error('Connect a wallet before submitting locker transactions.');
  }

  return wallet;
};

export const fetchLockerEscrow = async (
  connection: Connection,
  escrowAddress: string,
  walletAddress?: PublicKey
): Promise<LockerEscrowSummary> => {
  const program = getKedolikLockerProgram(connection);
  const vestingEscrowNamespace = getVestingEscrowNamespace(program);

  if (!vestingEscrowNamespace.fetch) {
    throw new Error('Locker IDL does not support lock fetch.');
  }

  const escrow = toPublicKey(escrowAddress);
  const rawAccount = (await vestingEscrowNamespace.fetch(escrow)) as RawVestingEscrowAccount;
  const normalized = decodeVestingEscrowState(rawAccount);
  return buildLockerSummary(connection, escrow, normalized, walletAddress);
};

export const fetchLockerEscrowsForWallet = async (
  connection: Connection,
  walletAddress: PublicKey
): Promise<LockerEscrowSummary[]> => {
  const program = getKedolikLockerProgram(connection);
  const vestingEscrowNamespace = getVestingEscrowNamespace(program);

  if (!vestingEscrowNamespace.all) {
    throw new Error('Locker IDL does not support lock listing.');
  }

  const allEscrows = await vestingEscrowNamespace.all();
  const summaries = await Promise.all(
    allEscrows
      .map(({ publicKey, account }) => ({
        publicKey,
        account: decodeVestingEscrowState(account as RawVestingEscrowAccount),
      }))
      .filter(
        ({ account }) => account.creator.equals(walletAddress) || account.recipient.equals(walletAddress)
      )
      .map(({ publicKey, account }) => buildLockerSummary(connection, publicKey, account, walletAddress))
  );

  return summaries.sort((left, right) => right.vestingStartTime - left.vestingStartTime);
};

export const fetchAllLockerEscrows = async (
  connection: Connection
): Promise<LockerEscrowSummary[]> => {
  const program = getKedolikLockerProgram(connection);
  const vestingEscrowNamespace = getVestingEscrowNamespace(program);

  if (!vestingEscrowNamespace.all) {
    throw new Error('Locker IDL does not support lock listing.');
  }

  const allEscrows = await vestingEscrowNamespace.all();
  const summaries = await Promise.all(
    allEscrows.map(({ publicKey, account }) =>
      buildLockerSummary(
        connection,
        publicKey,
        decodeVestingEscrowState(account as RawVestingEscrowAccount)
      )
    )
  );

  return summaries.sort((left, right) => right.vestingStartTime - left.vestingStartTime);
};

const fetchLockerEscrowState = async (
  connection: Connection,
  escrowAddress: string
): Promise<{ escrow: PublicKey; state: LockerEscrowAccountState }> => {
  const program = getKedolikLockerProgram(connection);
  const vestingEscrowNamespace = getVestingEscrowNamespace(program);

  if (!vestingEscrowNamespace.fetch) {
    throw new Error('Locker IDL does not support lock fetch.');
  }

  const escrow = toPublicKey(escrowAddress);
  const rawAccount = (await vestingEscrowNamespace.fetch(escrow)) as RawVestingEscrowAccount;
  return {
    escrow,
    state: decodeVestingEscrowState(rawAccount),
  };
};

export const claimLockerEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  escrowAddress: string
): Promise<string> => {
  const signerWallet = assertWallet(wallet);
  const program = getKedolikLockerProgram(connection, signerWallet);
  const { escrow, state } = await fetchLockerEscrowState(connection, escrowAddress);

  if (!state.recipient.equals(signerWallet.publicKey)) {
    throw new Error('Only the current recipient can claim from this Kedolik Locker lock.');
  }

  const tokenProgram = getTokenProgramId(state.tokenProgramFlag);
  const escrowToken = getAssociatedTokenAddressSync(
    state.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const recipientToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    state.tokenMint,
    tokenProgram
  );

  const claimMethod = resolveLockerMethod(program, 'claimV2', 'claim_v2');
  const transaction = new Transaction();

  if (recipientToken.instruction) {
    transaction.add(recipientToken.instruction);
  }

  transaction.add(
    await claimMethod(MAX_U64, null)
      .accounts({
        escrow,
        tokenMint: state.tokenMint,
        escrowToken,
        recipient: signerWallet.publicKey,
        recipientToken: recipientToken.address,
        memoProgram: MEMO_PROGRAM_ID,
        tokenProgram,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      })
      .instruction()
  );

  return sendAndConfirmLockerTransaction(program, transaction);
};

export const cancelLockerEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  escrowAddress: string
): Promise<string> => {
  const signerWallet = assertWallet(wallet);
  const program = getKedolikLockerProgram(connection, signerWallet);
  const { escrow, state } = await fetchLockerEscrowState(connection, escrowAddress);
  const tokenProgram = getTokenProgramId(state.tokenProgramFlag);
  const escrowToken = getAssociatedTokenAddressSync(
    state.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const creatorToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    state.creator,
    state.tokenMint,
    tokenProgram
  );
  const recipientToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    state.recipient,
    state.tokenMint,
    tokenProgram
  );

  const cancelMethod = resolveLockerMethod(program, 'cancelVestingEscrow', 'cancel_vesting_escrow');
  const transaction = new Transaction();

  if (creatorToken.instruction) {
    transaction.add(creatorToken.instruction);
  }
  if (recipientToken.instruction) {
    transaction.add(recipientToken.instruction);
  }

  transaction.add(
    await cancelMethod(null)
      .accounts({
        escrow,
        tokenMint: state.tokenMint,
        escrowToken,
        creatorToken: creatorToken.address,
        recipientToken: recipientToken.address,
        rentReceiver: state.creator,
        signer: signerWallet.publicKey,
        memoProgram: MEMO_PROGRAM_ID,
        tokenProgram,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      })
      .instruction()
  );

  return sendAndConfirmLockerTransaction(program, transaction);
};

export const closeLockerEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  escrowAddress: string
): Promise<string> => {
  const signerWallet = assertWallet(wallet);
  const program = getKedolikLockerProgram(connection, signerWallet);
  const { escrow, state } = await fetchLockerEscrowState(connection, escrowAddress);

  if (!state.creator.equals(signerWallet.publicKey)) {
    throw new Error('Only the lock creator can close a Kedolik Locker lock.');
  }

  const tokenProgram = getTokenProgramId(state.tokenProgramFlag);
  const escrowMetadata = getLockerEscrowMetadataPda(escrow);
  const escrowMetadataInfo = await connection.getAccountInfo(escrowMetadata);

  if (!escrowMetadataInfo) {
    throw new Error('Lock metadata account was not found. close_vesting_escrow cannot run yet.');
  }

  const escrowToken = getAssociatedTokenAddressSync(
    state.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const creatorToken = await ensureAta(
    connection,
    signerWallet.publicKey,
    signerWallet.publicKey,
    state.tokenMint,
    tokenProgram
  );

  const closeMethod = resolveLockerMethod(program, 'closeVestingEscrow', 'close_vesting_escrow');
  const transaction = new Transaction();

  if (creatorToken.instruction) {
    transaction.add(creatorToken.instruction);
  }

  transaction.add(
    await closeMethod(null)
      .accounts({
        escrow,
        escrowMetadata,
        tokenMint: state.tokenMint,
        escrowToken,
        creatorToken: creatorToken.address,
        creator: signerWallet.publicKey,
        tokenProgram,
        memoProgram: MEMO_PROGRAM_ID,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      })
      .instruction()
  );

  return sendAndConfirmLockerTransaction(program, transaction);
};

export const updateLockerEscrowRecipient = async (
  connection: Connection,
  wallet: AnchorWallet,
  escrowAddress: string,
  newRecipient: string,
  newRecipientEmail?: string
): Promise<string> => {
  const signerWallet = assertWallet(wallet);
  const program = getKedolikLockerProgram(connection, signerWallet);
  const escrow = toPublicKey(escrowAddress);
  const escrowMetadata = getLockerEscrowMetadataPda(escrow);
  const escrowMetadataInfo = await connection.getAccountInfo(escrowMetadata);
  const updateMethod = resolveLockerMethod(
    program,
    'updateVestingEscrowRecipient',
    'update_vesting_escrow_recipient'
  );

  const builder = updateMethod(toPublicKey(newRecipient), newRecipientEmail ?? null);
  const accounts = escrowMetadataInfo
    ? {
        escrow,
        escrowMetadata,
        signer: signerWallet.publicKey,
        systemProgram: SystemProgram.programId,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      }
    : {
        escrow,
        signer: signerWallet.publicKey,
        systemProgram: SystemProgram.programId,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      };

  return (builder as AnchorRpcBuilder).accounts(accounts as Record<string, unknown>).rpc();
};

export const createLockerVestingEscrow = async (
  connection: Connection,
  wallet: AnchorWallet,
  input: CreateVestingEscrowInput
): Promise<{ signature: string; escrowAddress: string; baseAddress: string }> => {
  const signerWallet = assertWallet(wallet);
  const program = getKedolikLockerProgram(connection, signerWallet);
  const tokenMint = toPublicKey(input.tokenMint);
  const tokenProgram = input.tokenProgramId
    ? toPublicKey(input.tokenProgramId)
    : TOKEN_PROGRAM_ID;
  const base = Keypair.generate();
  const escrow = getLockerEscrowPda(base.publicKey);
  const senderToken = input.senderToken
    ? toPublicKey(input.senderToken)
    : getAssociatedTokenAddressSync(
        tokenMint,
        signerWallet.publicKey,
        false,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
  const escrowToken = getAssociatedTokenAddressSync(
    tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const escrowTokenSetup = await ensureAta(
    connection,
    signerWallet.publicKey,
    escrow,
    tokenMint,
    tokenProgram,
    true
  );

  const useV2 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const createMethod = useV2
    ? resolveLockerMethod(program, 'createVestingEscrowV2', 'create_vesting_escrow_v2')
    : resolveLockerMethod(program, 'createVestingEscrow', 'create_vesting_escrow');
  const builder = createMethod({
    vestingStartTime: new BN(input.vestingStartTime),
    cliffTime: new BN(input.cliffTime),
    frequency: new BN(input.frequency),
    cliffUnlockAmount: new BN(input.cliffUnlockAmount),
    amountPerPeriod: new BN(input.amountPerPeriod),
    numberOfPeriod: new BN(input.numberOfPeriod),
    updateRecipientMode: input.updateRecipientMode ?? 0,
    cancelMode: input.cancelMode ?? 0,
  });

  const accounts = useV2
    ? {
        base: base.publicKey,
        escrow,
        tokenMint,
        escrowToken,
        sender: signerWallet.publicKey,
        senderToken,
        recipient: toPublicKey(input.recipient),
        tokenProgram,
        systemProgram: SystemProgram.programId,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      }
    : {
        base: base.publicKey,
        escrow,
        escrowToken,
        sender: signerWallet.publicKey,
        senderToken,
        recipient: toPublicKey(input.recipient),
        tokenProgram,
        systemProgram: SystemProgram.programId,
        eventAuthority: getLockerEventAuthority(),
        program: LOCKER_PROGRAM_ID,
      };

  const transaction = new Transaction();
  if (escrowTokenSetup.instruction) {
    transaction.add(escrowTokenSetup.instruction);
  }

  transaction.add(
    await (builder as AnchorRpcBuilder)
      .accounts(accounts as Record<string, unknown>)
      .signers([base])
      .instruction()
  );

  const signature = await sendAndConfirmLockerTransaction(program, transaction, [base]);

  return {
    signature,
    escrowAddress: escrow.toString(),
    baseAddress: base.publicKey.toString(),
  };
};

export const getLockerActionErrorMessage = (error: unknown): string => {
  const normalized = normalizeLockerError(error);
  const message = normalized.message.trim();

  if (!message) {
    return 'Locker transaction failed.';
  }

  if (message.includes('Account does not exist')) {
    return 'Program not live on devnet yet.';
  }

  if (message.includes('0x1773') || message.includes('AlreadyCancelled')) {
    return 'This lock is already cancelled.';
  }

  if (message.includes('ClaimingIsNotFinished')) {
    return 'This lock cannot be closed until all claimable tokens are handled.';
  }

  if (message.includes('Not permit to do this action')) {
    return 'The connected wallet is not allowed to perform this locker action.';
  }

  return message;
};
