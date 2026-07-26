/**
 * Create a Solana keypair JSON file from an exported private key.
 *
 * Use this when you have EGX4... in Phantom/Solflare but no keypair.json on disk.
 *
 * 1. In Phantom: Settings → Security → Export Private Key (copy the base58 string)
 * 2. Run ONCE locally (never commit the key):
 *      BS58_PRIVATE_KEY=your_private_key npx tsx scripts/create-keypair-file.ts
 * 3. Then run Jupiter setup:
 *      KEYPAIR_PATH=./kedolik-fee-keypair.json npm run setup-jupiter-referral
 *
 * Optional:
 *   OUTPUT_PATH=./my-wallet.json
 *   EXPECTED_PUBKEY=EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom
 *
 * To generate a BRAND NEW wallet (not EGX4):
 *   npx tsx scripts/create-keypair-file.ts --generate
 */

import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
};

loadEnv();

const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'kedolik-fee-keypair.json');
const EXPECTED_FEE_WALLET = 'EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom';

const generateNew = process.argv.includes('--generate');

let keypair: Keypair;

if (generateNew) {
  keypair = Keypair.generate();
  console.log('Generated a NEW wallet (not your existing EGX4 treasury):');
} else {
  const bs58Key = process.env.BS58_PRIVATE_KEY?.trim();
  if (!bs58Key) {
    console.error(`
No private key provided.

Export your EGX4 wallet private key from Phantom/Solflare, then run:

  BS58_PRIVATE_KEY=your_exported_key npx tsx scripts/create-keypair-file.ts

Or generate a new wallet (only if you do NOT need EGX4):

  npx tsx scripts/create-keypair-file.ts --generate
`);
    process.exit(1);
  }

  try {
    keypair = Keypair.fromSecretKey(bs58.decode(bs58Key));
  } catch {
    console.error('Invalid BS58_PRIVATE_KEY — paste the full exported private key from your wallet.');
    process.exit(1);
  }
}

const outputPath = path.resolve(process.cwd(), process.env.OUTPUT_PATH || DEFAULT_OUTPUT);
const expected = process.env.EXPECTED_PUBKEY || EXPECTED_FEE_WALLET;

if (fs.existsSync(outputPath)) {
  console.error(`Refusing to overwrite existing file: ${outputPath}`);
  console.error('Delete it first or set OUTPUT_PATH to a different path.');
  process.exit(1);
}

const secretArray = Array.from(keypair.secretKey);
fs.writeFileSync(outputPath, JSON.stringify(secretArray), { mode: 0o600 });

console.log('Public key: ', keypair.publicKey.toBase58());
console.log('Saved to:   ', outputPath);
console.log('');

if (expected && keypair.publicKey.toBase58() !== expected) {
  console.warn('⚠️  This public key does NOT match the expected fee wallet:');
  console.warn('   Expected:', expected);
  console.warn('   Got:     ', keypair.publicKey.toBase58());
  console.warn('   Use the private key exported from the EGX4 wallet, or update EXPECTED_PUBKEY.');
} else if (expected) {
  console.log('✅ Matches fee wallet', expected);
}

console.log('');
console.log('Next step:');
console.log(`  KEYPAIR_PATH="${outputPath}" npm run setup-jupiter-referral`);
console.log('');
console.log('Keep this file secret. It is gitignored.');
