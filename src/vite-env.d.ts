/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * RPC Endpoint - REQUIRED
   * Set this in your .env file with your QuickNode (or other) RPC endpoint
   * Example: VITE_RPC_ENDPOINT=https://your-endpoint.solana-mainnet.quiknode.pro/your-key/
   * 
   * ⚠️ IMPORTANT: This will be exposed in the client bundle. Never commit .env to git.
   */
  readonly VITE_RPC_ENDPOINT: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_JUPITER_API_KEY?: string;
  readonly VITE_JUPITER_REFERRAL_ACCOUNT?: string;
  readonly VITE_JUPITER_REFERRAL_FEE_BPS?: string;
  readonly VITE_MAX_DEX_PRICE_IMPACT_PERCENT?: string;
  readonly VITE_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

