/**
 * OKX Web3 DEX API configuration (Solana).
 *
 * Get credentials: https://web3.okx.com/onchainos/dev-docs/waas/introduction-to-developer-portal-interface
 * 1. Create a project in the OKX Developer Portal
 * 2. Generate API Key, Secret Key, and Passphrase
 * 3. Copy the Project ID
 *
 * SECURITY: Secret + passphrase in VITE_* vars are visible in the client bundle.
 * For production, proxy OKX requests through your backend.
 */

export const OKX_SOLANA_CHAIN_INDEX = '501';

/** OKX uses 32× "1" for native SOL (not wrapped SOL mint). */
export const OKX_NATIVE_SOL_ADDRESS = '11111111111111111111111111111111';

export const getOkxApiBase = (): string =>
  import.meta.env.VITE_OKX_API_BASE?.trim() || 'https://web3.okx.com';

export const getOkxCredentials = () => ({
  apiKey: import.meta.env.VITE_OKX_API_KEY?.trim() || '',
  secretKey: import.meta.env.VITE_OKX_SECRET_KEY?.trim() || '',
  passphrase: import.meta.env.VITE_OKX_PASSPHRASE?.trim() || '',
  projectId: import.meta.env.VITE_OKX_PROJECT_ID?.trim() || '',
});

export const isOkxEnabled = (): boolean => {
  if (import.meta.env.VITE_NETWORK === 'devnet') return false;
  const { apiKey, secretKey, passphrase } = getOkxCredentials();
  return Boolean(apiKey && secretKey && passphrase);
};

/** Optional integrator fee (0–10% on Solana). */
export const getOkxFeePercent = (): string | undefined => {
  const raw = import.meta.env.VITE_OKX_FEE_PERCENT?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return String(Math.min(10, parsed));
};

export const getOkxReferrerWallet = (): string | undefined =>
  import.meta.env.VITE_OKX_REFERRER_WALLET?.trim() || undefined;
