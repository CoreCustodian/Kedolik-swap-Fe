/**
 * Verify Jupiter swap quotes and referral fee params.
 *
 * Usage:
 *   npx tsx scripts/test-jupiter-fee.ts
 *
 * Requires in .env:
 *   VITE_JUPITER_API_KEY
 *   VITE_JUPITER_REFERRAL_ACCOUNT (optional — tests fee params when set)
 */

import fs from 'fs';
import path from 'path';

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

const API_KEY = process.env.VITE_JUPITER_API_KEY;
const REFERRAL_ACCOUNT = process.env.VITE_JUPITER_REFERRAL_ACCOUNT;
const REFERRAL_FEE_BPS = process.env.VITE_JUPITER_REFERRAL_FEE_BPS || '100';

if (!API_KEY) {
  console.error('Missing VITE_JUPITER_API_KEY in .env');
  process.exit(1);
}

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function fetchOrder(label: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const url = `https://api.jup.ag/swap/v2/order?${search}`;
  console.log(`\n[${label}] GET /swap/v2/order`);

  const response = await fetch(url, {
    headers: { 'x-api-key': API_KEY!, Accept: 'application/json' },
  });

  if (!response.ok) {
    console.error('  FAILED:', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  console.log('  outAmount:', data.outAmount);
  console.log('  feeBps:', data.feeBps);
  console.log('  feeMint:', data.feeMint);
  console.log('  referralAccount:', data.referralAccount ?? '(none)');
  console.log('  platformFee:', data.platformFee ? JSON.stringify(data.platformFee) : '(none)');
  console.log('  router:', data.router);
  return data;
}

async function main() {
  console.log('Jupiter fee integration test');
  console.log('Referral account:', REFERRAL_ACCOUNT || '(not configured)');

  const baseParams = {
    inputMint: SOL,
    outputMint: USDC,
    amount: '100000000',
    slippageBps: '50',
  };

  await fetchOrder('quote-only', baseParams);

  if (REFERRAL_ACCOUNT) {
    await fetchOrder('with-referral-fee', {
      ...baseParams,
      referralAccount: REFERRAL_ACCOUNT,
      referralFee: REFERRAL_FEE_BPS,
    });
    console.log('\nIf referralAccount in response matches yours, integrator fees are active.');
    console.log('If fees fall back to default platform fee only, initialize referral token accounts:');
    console.log('  npx tsx scripts/setup-jupiter-referral.ts');
  } else {
    console.log('\nNo VITE_JUPITER_REFERRAL_ACCOUNT — swaps work but Kedolik earns no fee.');
    console.log('Run: npx tsx scripts/setup-jupiter-referral.ts');
  }

  console.log('\nToken search test...');
  const tokenRes = await fetch('https://api.jup.ag/tokens/v2/search?query=BONK', {
    headers: { 'x-api-key': API_KEY!, Accept: 'application/json' },
  });
  if (tokenRes.ok) {
    const tokens = await tokenRes.json();
    console.log('  BONK search:', tokens[0]?.symbol, tokens[0]?.id?.slice(0, 12) + '...');
  } else {
    console.error('  Token search failed:', tokenRes.status);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
