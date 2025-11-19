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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

