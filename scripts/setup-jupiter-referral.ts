/**
 * One-time Jupiter Referral Program setup for Kedolik Swap integrator fees.
 *
 * Your FEE WALLET (e.g. treasury EGX4...) is where you claim earnings.
 * Jupiter also creates a separate REFERRAL ACCOUNT (PDA) — that PDA goes in .env.
 *
 * Prerequisites:
 *   - Keypair for the fee wallet with ~0.05 SOL for account rent
 *   - VITE_RPC_ENDPOINT in .env
 *
 * Usage:
 *   KEYPAIR_PATH=path/to/EGX4-keypair.json npx tsx scripts/setup-jupiter-referral.ts
 *
 * Docs: https://dev.jup.ag/docs/swap/order-and-execute#referral-fees
 * Dashboard: https://referral.jup.ag/dashboard
 */

import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { ReferralProvider } from '@jup-ag/referral-sdk';
import bs58 from 'bs58';

const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
};

loadEnv();

const JUPITER_REFERRAL_PROJECT = new PublicKey('DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc');
const JUPITER_REFER_PROGRAM = new PublicKey('REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
/** Kedolik treasury — partner wallet that claims fees */
const DEFAULT_FEE_WALLET = 'EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom';
const FEE_MINTS = [
  new PublicKey('So11111111111111111111111111111111111111112'),
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
];

const RPC_ENDPOINT = process.env.VITE_RPC_ENDPOINT;
if (!RPC_ENDPOINT) {
  console.error('Set VITE_RPC_ENDPOINT in .env');
  process.exit(1);
}

const loadWallet = (): Keypair => {
  const keypairPath = process.env.KEYPAIR_PATH;
  if (keypairPath) {
    const resolved = keypairPath.replace(/^~/, process.env.HOME || '');
    const secret = JSON.parse(fs.readFileSync(resolved, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  const bs58Key = process.env.BS58_PRIVATE_KEY;
  if (bs58Key) {
    return Keypair.fromSecretKey(bs58.decode(bs58Key));
  }

  console.error('Provide KEYPAIR_PATH or BS58_PRIVATE_KEY for the fee wallet');
  process.exit(1);
};

const isWalletAddress = async (connection: Connection, pubkey: PublicKey): Promise<boolean> => {
  const info = await connection.getAccountInfo(pubkey);
  return !info || info.owner.equals(SYSTEM_PROGRAM);
};

const isReferralAccount = async (connection: Connection, pubkey: PublicKey): Promise<boolean> => {
  const info = await connection.getAccountInfo(pubkey);
  return Boolean(info?.owner.equals(JUPITER_REFER_PROGRAM));
};

async function main() {
  const connection = new Connection(RPC_ENDPOINT!, 'confirmed');
  const wallet = loadWallet();
  const provider = new ReferralProvider(connection);
  const expectedFeeWallet = new PublicKey(
    process.env.FEE_WALLET || process.env.VITE_JUPITER_FEE_WALLET || DEFAULT_FEE_WALLET
  );

  console.log('Kedolik Swap — Jupiter Referral Setup');
  console.log('Fee wallet (claim destination):', expectedFeeWallet.toBase58());
  console.log('Signer / partner wallet:      ', wallet.publicKey.toBase58());
  console.log('RPC:', RPC_ENDPOINT);
  console.log('');

  if (!wallet.publicKey.equals(expectedFeeWallet)) {
    console.warn(
      '⚠️  Signer does not match the expected fee wallet.',
      'Use the keypair for',
      expectedFeeWallet.toBase58(),
      'so you can claim fees from https://referral.jup.ag/dashboard'
    );
    console.warn('');
  }

  const configuredReferral = process.env.REFERRAL_ACCOUNT || process.env.VITE_JUPITER_REFERRAL_ACCOUNT;
  let referralAccount: PublicKey;

  if (configuredReferral) {
    const candidate = new PublicKey(configuredReferral);
    if (await isReferralAccount(connection, candidate)) {
      referralAccount = candidate;
      console.log('Using existing Jupiter referral account:', referralAccount.toBase58());
    } else if (await isWalletAddress(connection, candidate)) {
      console.log(
        '⚠️',
        configuredReferral,
        'is your wallet, not a Jupiter referral account.',
        'Creating a new referral account linked to your wallet...'
      );
      referralAccount = await createReferralAccount(provider, connection, wallet);
    } else {
      console.warn('Unknown account type for', configuredReferral, '— creating new referral account...');
      referralAccount = await createReferralAccount(provider, connection, wallet);
    }
  } else {
    referralAccount = await createReferralAccount(provider, connection, wallet);
  }

  console.log('\nInitializing referral token accounts for SOL / USDC / USDT...');
  for (const mint of FEE_MINTS) {
    try {
      const tx = await provider.initializeReferralTokenAccountV2({
        payerPubKey: wallet.publicKey,
        referralAccountPubKey: referralAccount,
        mint,
      });
      const sig = await sendAndConfirmTransaction(connection, tx.tx, [wallet]);
      console.log(`  ${mint.toBase58().slice(0, 8)}... → ${tx.tokenAccount.toBase58()} (${sig.slice(0, 12)}...)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('already')) {
        console.log(`  ${mint.toBase58().slice(0, 8)}... already initialized`);
      } else {
        console.warn(`  ${mint.toBase58().slice(0, 8)}... failed:`, message);
      }
    }
  }

  console.log('\n========== IMPORTANT ==========');
  console.log('Fee wallet (where you CLAIM fees):', wallet.publicKey.toBase58());
  console.log('Referral account (put in .env):   ', referralAccount.toBase58());
  console.log('================================\n');
  console.log('--- Add to .env and Vercel ---');
  console.log(`VITE_JUPITER_REFERRAL_ACCOUNT=${referralAccount.toBase58()}`);
  console.log('VITE_JUPITER_REFERRAL_FEE_BPS=100');
  console.log('\nDo NOT put your wallet address in VITE_JUPITER_REFERRAL_ACCOUNT.');
  console.log('Claim accumulated fees at: https://referral.jup.ag/dashboard');
}

async function createReferralAccount(
  provider: ReferralProvider,
  connection: Connection,
  wallet: Keypair
): Promise<PublicKey> {
  try {
    const init = await provider.initializeReferralAccountWithName({
      payerPubKey: wallet.publicKey,
      partnerPubKey: wallet.publicKey,
      projectPubKey: JUPITER_REFERRAL_PROJECT,
      name: 'kedolik-swap',
    });
    const sig = await sendAndConfirmTransaction(connection, init.tx, [wallet]);
    console.log('Created referralAccount:', init.referralAccountPubKey.toBase58());
    console.log('Tx:', sig);
    return init.referralAccountPubKey;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('already in use')) {
      console.error(
        'A referral account named "kedolik-swap" may already exist for this wallet.',
        'Check https://referral.jup.ag/dashboard and set REFERRAL_ACCOUNT=<pda> to only init token accounts.'
      );
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
