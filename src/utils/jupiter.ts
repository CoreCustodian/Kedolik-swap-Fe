// Jupiter Swap API v2 — routes swaps through Jupiter when Kedolik pools are unavailable.
// Docs: https://dev.jup.ag/docs/swap

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TokenInfo } from '../config/tokens';
import { sendViaWallet, SendCapableWallet } from './txSender';
import {
  getJupiterReferralAccount,
  getJupiterReferralFeeBps,
  isJupiterReferralFeeEnabled,
} from '../config/jupiterFees';

const JUPITER_API_BASE = 'https://api.jup.ag';
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

export type JupiterRouter = 'metis' | 'jupiterz' | 'dflow' | 'okx';

export interface JupiterRouteStep {
  swapInfo: {
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
  };
}

export interface JupiterPlatformFee {
  amount: string;
  feeBps: number;
  feeMint: string;
}

export interface JupiterOrderResponse {
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: JupiterRouteStep[];
  router?: JupiterRouter;
  swapType?: string;
  transaction: string | null;
  gasless?: boolean;
  feeBps?: number;
  feeMint?: string;
  platformFee?: JupiterPlatformFee;
  referralAccount?: string;
}

export interface JupiterExecuteResponse {
  status: 'Success' | 'Failed';
  code: number;
  signature?: string;
  error?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
  totalInputAmount?: string;
  totalOutputAmount?: string;
}

export interface JupiterTokenResult {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  isVerified?: boolean;
}

const getApiKey = (): string | undefined =>
  import.meta.env.VITE_JUPITER_API_KEY?.trim() || undefined;

export const isJupiterEnabled = (): boolean =>
  import.meta.env.VITE_NETWORK !== 'devnet' && Boolean(getApiKey());

const jupiterHeaders = (): HeadersInit => {
  const headers: HeadersInit = { Accept: 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
};

const jupiterFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${JUPITER_API_BASE}${path}`, {
    ...init,
    headers: {
      ...jupiterHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 429) {
    throw new Error('Jupiter rate limit reached. Free tier allows 1 request every 2 seconds — please wait and retry.');
  }

  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `Jupiter API error (${response.status})`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.error || parsed.message || message;
    } catch {
      // keep text fallback
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

/** Normalize mint for Jupiter (native SOL uses wrapped SOL mint). */
export const toJupiterMint = (mint: PublicKey): string => mint.toString();

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

/**
 * Fetch a Jupiter swap quote (no transaction). Omit taker for read-only preview.
 */
const buildJupiterOrderSearch = (
  params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
    taker?: string;
  },
  includeReferral: boolean
): URLSearchParams => {
  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
  });

  // Omit slippageBps to use Jupiter RTSE (recommended for volatile tokens).
  if (params.slippageBps !== undefined) {
    search.set('slippageBps', String(params.slippageBps));
  }

  if (params.taker) {
    search.set('taker', params.taker);
  }

  if (includeReferral) {
    const referralAccount = getJupiterReferralAccount();
    if (referralAccount) {
      search.set('referralAccount', referralAccount.toString());
      search.set('referralFee', String(getJupiterReferralFeeBps()));
    }
  }

  return search;
};

const isReferralSetupError = (message: string): boolean =>
  /referralAccount/i.test(message) && /initializ/i.test(message);

export const getJupiterOrder = async (params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
  taker?: string;
}): Promise<JupiterOrderResponse> => {
  const path = '/swap/v2/order';
  const withReferral = buildJupiterOrderSearch(params, true);

  try {
    return await jupiterFetch<JupiterOrderResponse>(`${path}?${withReferral.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!getJupiterReferralAccount() || !isReferralSetupError(message)) {
      throw error;
    }

    console.warn(
      'Jupiter referral account is not initialized for this project; retrying quote without integrator fee.',
      message
    );
    const withoutReferral = buildJupiterOrderSearch(params, false);
    return jupiterFetch<JupiterOrderResponse>(`${path}?${withoutReferral.toString()}`);
  }
};

/** Default UI slippage — Jupiter uses RTSE instead of this fixed value. */
export const JUPITER_DEFAULT_UI_SLIPPAGE = '0.5';

/**
 * Map UI slippage to Jupiter bps. Returns undefined to use Jupiter RTSE (auto).
 * Fixed 0.5% overrides RTSE and often fails on volatile memecoins.
 */
export const jupiterSlippageBpsFromUi = (slippagePercent: string): number | undefined => {
  const trimmed = slippagePercent.trim();
  if (!trimmed || trimmed === JUPITER_DEFAULT_UI_SLIPPAGE) {
    return undefined;
  }
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return Math.min(10000, Math.round(n * 100));
};

export const isJupiterSlippageError = (message: string): boolean =>
  /slippage/i.test(message);

export const getJupiterQuote = async (
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  inputDecimals: number,
  slippagePercent: string = JUPITER_DEFAULT_UI_SLIPPAGE
): Promise<JupiterOrderResponse | null> => {
  if (!isJupiterEnabled()) return null;

  try {
    const slippageBps = jupiterSlippageBpsFromUi(slippagePercent);
    return await getJupiterOrder({
      inputMint: toJupiterMint(inputMint),
      outputMint: toJupiterMint(outputMint),
      amount: toSmallestUnit(amount, inputDecimals),
      ...(slippageBps !== undefined ? { slippageBps } : {}),
    });
  } catch (error) {
    console.error('Error fetching Jupiter quote:', error);
    return null;
  }
};

export const executeJupiterOrder = async (
  signedTransactionBase64: string,
  requestId: string
): Promise<JupiterExecuteResponse> => {
  return jupiterFetch<JupiterExecuteResponse>('/swap/v2/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: signedTransactionBase64, requestId }),
  });
};

/**
 * Full Jupiter swap: order → sign → execute via Jupiter managed landing.
 */
export const executeJupiterSwap = async (
  connection: Connection,
  wallet: SendCapableWallet,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: number,
  inputDecimals: number,
  slippagePercent: string
): Promise<{ signature: string; order: JupiterOrderResponse }> => {
  const amount = toSmallestUnit(amountIn, inputDecimals);

  // Self-landing: hand the UNSIGNED Jupiter transaction to the wallet's
  // signAndSendTransaction flow (so Phantom can inject its Lighthouse guards)
  // instead of signing it here and posting it back to Jupiter's execute endpoint.
  const signAndExecute = async (
    order: JupiterOrderResponse
  ): Promise<{ signature: string; order: JupiterOrderResponse }> => {
    if (!order.transaction) {
      throw new Error('Jupiter did not return a swap transaction. Try again with a fresh quote.');
    }

    const transaction = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, 'base64')
    );

    const signature = await sendViaWallet(wallet, connection, transaction, { maxRetries: 3 });

    try {
      await connection.confirmTransaction(signature, 'confirmed');
    } catch {
      // Confirmation is best-effort; the tx may still land.
    }

    return { signature, order };
  };

  if (!wallet.publicKey) {
    throw new Error('Connect a wallet before swapping via Jupiter.');
  }
  const taker = wallet.publicKey.toString();

  const fetchOrder = (slippageBps?: number) =>
    getJupiterOrder({
      inputMint: toJupiterMint(inputMint),
      outputMint: toJupiterMint(outputMint),
      amount,
      ...(slippageBps !== undefined ? { slippageBps } : {}),
      taker,
    });

  const initialSlippageBps = jupiterSlippageBpsFromUi(slippagePercent);

  const attemptSwap = async (slippageBps?: number) => {
    const order = await fetchOrder(slippageBps);
    return signAndExecute(order);
  };

  try {
    return await attemptSwap(initialSlippageBps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isJupiterSlippageError(message)) {
      throw error;
    }
    console.warn('Jupiter slippage exceeded; retrying with a fresh automatic quote...');
    return await attemptSwap(undefined);
  }
};

export const searchJupiterTokens = async (query: string): Promise<TokenInfo[]> => {
  if (!query.trim()) return [];

  try {
    const results = await jupiterFetch<JupiterTokenResult[]>(
      `/tokens/v2/search?query=${encodeURIComponent(query.trim())}`
    );

    return results.slice(0, 50).map((token) => ({
      mint: new PublicKey(token.id),
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoURI: token.icon,
    }));
  } catch (error) {
    console.error('Error searching Jupiter tokens:', error);
    return [];
  }
};

export const getJupiterTrendingTokens = async (): Promise<TokenInfo[]> => {
  try {
    const results = await jupiterFetch<JupiterTokenResult[]>('/tokens/v2/toptrending/24h');
    return results.slice(0, 100).map((token) => ({
      mint: new PublicKey(token.id),
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoURI: token.icon,
    }));
  } catch (error) {
    console.error('Error fetching Jupiter trending tokens:', error);
    return [];
  }
};

/** @deprecated Use searchJupiterTokens or getJupiterTrendingTokens */
export const getJupiterTokenList = searchJupiterTokens;

export const getJupiterRouteLabel = (order: JupiterOrderResponse): string => {
  const labels = order.routePlan?.map((step) => step.swapInfo?.label).filter(Boolean) ?? [];
  return labels.length > 0 ? labels.join(' → ') : 'Jupiter';
};

/** Price impact as a percentage (Jupiter returns a decimal fraction, e.g. 0.02 = 2%). */
export const getJupiterPriceImpact = (order: JupiterOrderResponse): number => {
  const impact = parseFloat(order.priceImpactPct || '0');
  return Number.isFinite(impact) ? Math.abs(impact) * 100 : 0;
};

export interface JupiterIntegratorFeeEstimate {
  feeBps: number;
  feeMint: string;
  feeAmountRaw: string;
  feeAmountUi: number;
  feeSymbol?: string;
  referralActive: boolean;
  /** Your share after Jupiter's 20% cut on referral fees */
  integratorShareBps: number;
}

/**
 * Estimate integrator fee from a Jupiter order response.
 * When referral is active, feeBps includes your referral fee (Jupiter takes 20%).
 */
export const estimateIntegratorFee = (
  order: JupiterOrderResponse,
  inputDecimals: number,
  outputDecimals: number,
  inputSymbol?: string,
  outputSymbol?: string
): JupiterIntegratorFeeEstimate | null => {
  if (!isJupiterReferralFeeEnabled()) return null;

  const referralAccount = getJupiterReferralAccount();
  if (!referralAccount || order.referralAccount !== referralAccount.toString()) {
    return null;
  }

  const configuredBps = getJupiterReferralFeeBps();
  const feeBps = order.feeBps ?? configuredBps;
  const feeMint = order.feeMint || order.outputMint;
  const inAmount = BigInt(order.inAmount || '0');
  const outAmount = BigInt(order.outAmount || '0');

  let feeAmountRaw = 0n;
  if (feeMint === order.inputMint) {
    feeAmountRaw = (inAmount * BigInt(feeBps)) / 10000n;
  } else if (feeMint === order.outputMint) {
    feeAmountRaw = (outAmount * BigInt(feeBps)) / 10000n;
  } else if (order.platformFee?.amount) {
    feeAmountRaw = BigInt(order.platformFee.amount);
  }

  const decimals = feeMint === order.inputMint ? inputDecimals : outputDecimals;
  const feeSymbol = feeMint === order.inputMint ? inputSymbol : outputSymbol;

  return {
    feeBps,
    feeMint,
    feeAmountRaw: feeAmountRaw.toString(),
    feeAmountUi: fromSmallestUnit(feeAmountRaw.toString(), decimals),
    feeSymbol,
    referralActive: true,
    integratorShareBps: Math.round(configuredBps * 0.8),
  };
};

export { isJupiterReferralFeeEnabled, getJupiterReferralFeeBps, getJupiterReferralAccount };

export { NATIVE_SOL_MINT };
