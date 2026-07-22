import { PublicKey } from '@solana/web3.js';

/**
 * Jupiter integrator fee config (Referral Program).
 * Docs: https://dev.jup.ag/docs/swap/order-and-execute#referral-fees
 *
 * Setup (one-time):
 *   1. Run: npx tsx scripts/setup-jupiter-referral.ts
 *   2. Add printed VITE_JUPITER_REFERRAL_ACCOUNT to .env
 *   3. Fees accumulate on-chain in referral token accounts per mint
 */

/** Jupiter Ultra / Swap API v2 referral project */
export const JUPITER_REFERRAL_PROJECT = new PublicKey(
  'DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc'
);

/** Kedolik Jupiter integrator fee receiver (referral account) */
export const KEDOLIK_JUPITER_REFERRAL_ACCOUNT = new PublicKey(
  'EGX4XLHooJ8vtMeyu6JRzudPMv39Cy91bJV49oaHqHom'
);

const parseFeeBps = (): number => {
  const raw = import.meta.env.VITE_JUPITER_REFERRAL_FEE_BPS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 100;
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(255, Math.max(50, parsed));
};

export const getJupiterReferralAccount = (): PublicKey | null => {
  if (!isJupiterEnabled()) return null;

  const raw = import.meta.env.VITE_JUPITER_REFERRAL_ACCOUNT?.trim();
  if (raw) {
    try {
      return new PublicKey(raw);
    } catch {
      console.warn('Invalid VITE_JUPITER_REFERRAL_ACCOUNT, using default');
    }
  }

  return KEDOLIK_JUPITER_REFERRAL_ACCOUNT;
};

export const getJupiterReferralFeeBps = (): number => parseFeeBps();

export const isJupiterReferralFeeEnabled = (): boolean =>
  Boolean(getJupiterReferralAccount());

const isJupiterEnabled = (): boolean =>
  import.meta.env.VITE_NETWORK !== 'devnet' &&
  Boolean(import.meta.env.VITE_JUPITER_API_KEY?.trim());

/** Human-readable fee percent, e.g. 1 for 100 bps */
export const getJupiterReferralFeePercent = (): number =>
  getJupiterReferralFeeBps() / 100;

/** Mints to pre-create referral token accounts for (setup script + docs) */
export const JUPITER_FEE_MINTS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
] as const;
