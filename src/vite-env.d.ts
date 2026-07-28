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
  /**
   * WebSocket RPC endpoint. Optional — derived from VITE_RPC_ENDPOINT when unset.
   * Used for account/signature subscriptions so updates are pushed instead of polled.
   */
  readonly VITE_RPC_ENDPOINT_WS?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_JUPITER_API_KEY?: string;
  readonly VITE_JUPITER_REFERRAL_ACCOUNT?: string;
  readonly VITE_JUPITER_REFERRAL_FEE_BPS?: string;
  readonly VITE_MAX_DEX_PRICE_IMPACT_PERCENT?: string;
  readonly VITE_OKX_API_KEY?: string;
  readonly VITE_OKX_SECRET_KEY?: string;
  readonly VITE_OKX_PASSPHRASE?: string;
  readonly VITE_OKX_PROJECT_ID?: string;
  readonly VITE_OKX_API_BASE?: string;
  readonly VITE_OKX_FEE_PERCENT?: string;
  readonly VITE_OKX_REFERRER_WALLET?: string;
  readonly VITE_AGGREGATOR_VOLUME_API?: string;
  readonly VITE_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

