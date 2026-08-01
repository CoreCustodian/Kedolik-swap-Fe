// OKX Web3 DEX API — Solana token search + swap routing.
// Docs: https://web3.okx.com/onchainos/dev-docs/trade/dex-get-tokens

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { sendViaWallet, SendCapableWallet } from './txSender';
import { SOL_MINT } from '../config/addresses';
import {
  getOkxApiBase,
  getOkxCredentials,
  getOkxFeePercent,
  getOkxReferrerWallet,
  isOkxEnabled,
  OKX_NATIVE_SOL_ADDRESS,
  OKX_SOLANA_CHAIN_INDEX,
} from '../config/okx';
import { TokenInfo } from '../config/tokens';

const WRAPPED_SOL_MINT = SOL_MINT.toString();

interface OkxApiResponse<T> {
  code: string;
  msg: string;
  data: T;
}

export interface OkxTokenResult {
  chainIndex?: string;
  tokenName: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  tokenLogoUrl?: string;
  decimal: string;
}

export interface OkxSwapResponse {
  routerResult: {
    fromTokenAmount: string;
    toTokenAmount: string;
    priceImpactPercent?: string;
    dexRouterList?: Array<{
      router?: string;
      dexProtocol?: { dexName?: string };
    }>;
  };
  tx?: {
    data?: string;
    from?: string;
    minReceiveAmount?: string;
    slippagePercent?: string;
  };
}

const hmacSha256Base64 = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message) as BufferSource
  );
  const bytes = new Uint8Array(signature);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const buildAuthHeaders = async (
  method: string,
  requestPath: string,
  queryString: string
): Promise<HeadersInit> => {
  const { apiKey, secretKey, passphrase, projectId } = getOkxCredentials();
  const timestamp = new Date().toISOString();
  const sign = await hmacSha256Base64(secretKey, timestamp + method.toUpperCase() + requestPath + queryString);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
  };

  if (projectId) {
    headers['OK-ACCESS-PROJECT'] = projectId;
  }

  return headers;
};

const okxFetch = async <T>(requestPath: string, params: Record<string, string>): Promise<T> => {
  const queryString = '?' + new URLSearchParams(params).toString();
  const url = `${getOkxApiBase()}${requestPath}${queryString}`;
  const headers = await buildAuthHeaders('GET', requestPath, queryString);

  const response = await fetch(url, { method: 'GET', headers });
  const raw = await response.text();

  let parsed: OkxApiResponse<T>;
  try {
    parsed = JSON.parse(raw) as OkxApiResponse<T>;
  } catch {
    throw new Error(raw || `OKX API error (${response.status})`);
  }

  if (!response.ok || parsed.code !== '0') {
    throw new Error(parsed.msg || `OKX API error (${response.status})`);
  }

  return parsed.data;
};

/** Map SPL / native mints to OKX token address format. */
export const toOkxTokenAddress = (mint: PublicKey): string => {
  const mintStr = mint.toString();
  if (mintStr === WRAPPED_SOL_MINT) {
    return OKX_NATIVE_SOL_ADDRESS;
  }
  return mintStr;
};

/** Map OKX token address back to Solana mint used in the app. */
export const fromOkxTokenAddress = (address: string): PublicKey => {
  if (address === OKX_NATIVE_SOL_ADDRESS) {
    return SOL_MINT;
  }
  return new PublicKey(address);
};

const mapOkxToken = (token: OkxTokenResult): TokenInfo | null => {
  try {
    const mint = fromOkxTokenAddress(token.tokenContractAddress);
    const decimals = Number.parseInt(token.decimal, 10);
    return {
      mint,
      symbol: token.tokenSymbol || 'UNKNOWN',
      name: token.tokenName || token.tokenSymbol || 'Unknown Token',
      decimals: Number.isFinite(decimals) ? decimals : 9,
      logoURI: token.tokenLogoUrl,
    };
  } catch {
    return null;
  }
};

export const toSmallestUnit = (amount: number, decimals: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return Math.floor(amount * Math.pow(10, decimals)).toString();
};

export const fromSmallestUnit = (raw: string, decimals: number): number => {
  const value = BigInt(raw || '0');
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return Number(whole);
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(`${whole}.${fractionStr}`);
};

/** Search tokens via OKX Market API (broader coverage than Jupiter for long-tail tokens). */
export const searchOkxTokens = async (query: string): Promise<TokenInfo[]> => {
  if (!isOkxEnabled() || !query.trim()) return [];

  try {
    const data = await okxFetch<OkxTokenResult[]>('/api/v6/dex/market/token/search', {
      chains: OKX_SOLANA_CHAIN_INDEX,
      search: query.trim(),
    });

    const tokens: TokenInfo[] = [];
    const seen = new Set<string>();

    for (const item of data ?? []) {
      const mapped = mapOkxToken(item);
      if (!mapped) continue;
      const key = mapped.mint.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(mapped);
    }

    return tokens.slice(0, 50);
  } catch (error) {
    console.error('OKX token search error:', error);
    return [];
  }
};

/** Load curated OKX token list for Solana (major tokens). */
export const getOkxTokenList = async (): Promise<TokenInfo[]> => {
  if (!isOkxEnabled()) return [];

  try {
    const data = await okxFetch<OkxTokenResult[]>('/api/v6/dex/aggregator/all-tokens', {
      chainIndex: OKX_SOLANA_CHAIN_INDEX,
    });

    const tokens: TokenInfo[] = [];
    const seen = new Set<string>();

    for (const item of data ?? []) {
      const mapped = mapOkxToken(item);
      if (!mapped) continue;
      const key = mapped.mint.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(mapped);
    }

    return tokens;
  } catch (error) {
    console.error('OKX token list error:', error);
    return [];
  }
};

export const getOkxSwapQuote = async (
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  inputDecimals: number,
  userWallet: string,
  slippagePercent: number = 0.5
): Promise<OkxSwapResponse | null> => {
  if (!isOkxEnabled()) return null;

  try {
    const params: Record<string, string> = {
      chainIndex: OKX_SOLANA_CHAIN_INDEX,
      amount: toSmallestUnit(amount, inputDecimals),
      fromTokenAddress: toOkxTokenAddress(inputMint),
      toTokenAddress: toOkxTokenAddress(outputMint),
      userWalletAddress: userWallet,
      slippagePercent: String(slippagePercent),
    };

    const feePercent = getOkxFeePercent();
    const referrer = getOkxReferrerWallet();
    if (feePercent && referrer) {
      params.feePercent = feePercent;
      params.toTokenReferrerWalletAddress = referrer;
    }

    const data = await okxFetch<OkxSwapResponse[]>('/api/v6/dex/aggregator/swap', params);
    return data?.[0] ?? null;
  } catch (error) {
    console.error('OKX quote error:', error);
    return null;
  }
};

export const getOkxPriceImpact = (swap: OkxSwapResponse): number => {
  const impact = Number.parseFloat(swap.routerResult?.priceImpactPercent ?? '0');
  return Number.isFinite(impact) ? Math.abs(impact) : 0;
};

export const getOkxRouteLabel = (swap: OkxSwapResponse): string => {
  const names =
    swap.routerResult?.dexRouterList
      ?.map((hop) => hop.dexProtocol?.dexName || hop.router)
      .filter(Boolean) ?? [];
  return names.length > 0 ? names.join(' → ') : 'OKX DEX';
};

const deserializeOkxTransaction = async (
  connection: Connection,
  callData: string
): Promise<VersionedTransaction | Transaction> => {
  const decoded = bs58.decode(callData);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  try {
    const versioned = VersionedTransaction.deserialize(decoded);
    versioned.message.recentBlockhash = blockhash;
    return versioned;
  } catch {
    const legacy = Transaction.from(decoded);
    legacy.recentBlockhash = blockhash;
    return legacy;
  }
};

export const executeOkxSwap = async (
  connection: Connection,
  wallet: SendCapableWallet,
  swap: OkxSwapResponse
): Promise<string> => {
  const callData = swap.tx?.data;
  if (!callData) {
    throw new Error('OKX did not return swap transaction data.');
  }

  const transaction = await deserializeOkxTransaction(connection, callData);

  // Hand the UNSIGNED transaction to the wallet's signAndSendTransaction flow so
  // Phantom can inject its Lighthouse guard instructions.
  const signature = await sendViaWallet(wallet, connection, transaction, { maxRetries: 3 });

  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
};

export { isOkxEnabled };
