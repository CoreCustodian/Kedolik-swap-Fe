/**
 * One-time Jupiter Referral Program setup for Kedolik Swap integrator fees.
 *
 * Prerequisites:
 *   - Wallet keypair with ~0.05 SOL for account rent
 *   - VITE_RPC_ENDPOINT in .env
 *
 * Usage:
 *   npm install -D tsx @jup-ag/referral-sdk bs58
 *   npx tsx scripts/setup-jupiter-referral.ts
 *
 * Or with an existing keypair file:
 *   KEYPAIR_PATH=~/.config/solana/id.json npx tsx scripts/setup-jupiter-referral.ts
 *
 * Docs: https://dev.jup.ag/docs/swap/order-and-execute#referral-fees
 * Dashboard: https://referral.jup.ag/dashboard
 */

import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { ReferralProvider } from '@jup-ag/referral-sdk';
import bs58 from 'bs58';

const JUPITER_REFERRAL_PROJECT = new PublicKey('DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc');
const DEFAULT_REFERRAL_ACCOUNT = 'EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom';
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

  console.error('Provide KEYPAIR_PATH or BS58_PRIVATE_KEY');
  process.exit(1);
};

async function main() {
  const connection = new Connection(RPC_ENDPOINT!, 'confirmed');
  const wallet = loadWallet();
  const provider = new ReferralProvider(connection);

  console.log('Kedolik Swap — Jupiter Referral Setup');
  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('RPC:', RPC_ENDPOINT);
  console.log('');

  let referralAccount: PublicKey;

  try {
    const init = await provider.initializeReferralAccountWithName({
      payerPubKey: wallet.publicKey,
      partnerPubKey: wallet.publicKey,
      projectPubKey: JUPITER_REFERRAL_PROJECT,
      name: 'kedolik-swap',
    });
    const sig = await sendAndConfirmTransaction(connection, init.tx, [wallet]);
    referralAccount = init.referralAccountPubKey;
    console.log('Created referralAccount:', referralAccount.toBase58());
    console.log('Tx:', sig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('already in use')) {
      console.log('Referral account may already exist. Check https://referral.jup.ag/dashboard');
      console.log('Or pass REFERRAL_ACCOUNT=<pubkey> to only create token accounts.');
      const existing = process.env.REFERRAL_ACCOUNT || DEFAULT_REFERRAL_ACCOUNT;
      if (!existing) {
        process.exit(1);
      }
      referralAccount = new PublicKey(existing);
    } else {
      throw error;
    }
  }

  console.log('\nInitializing referral token accounts for fee mints...');
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

  console.log('\n--- Add to .env ---');
  console.log(`VITE_JUPITER_REFERRAL_ACCOUNT=${referralAccount.toBase58()}`);
  console.log('VITE_JUPITER_REFERRAL_FEE_BPS=100');
  console.log('\nFees collect on-chain in referral token accounts. View balances at:');
  console.log('https://referral.jup.ag/dashboard');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
