// Compare Jupiter vs OKX aggregator quotes and pick the best output.

import { PublicKey } from '@solana/web3.js';
import {
  getJupiterPriceImpact,
  getJupiterQuote,
  getJupiterRouteLabel,
  JupiterOrderResponse,
  isJupiterEnabled,
} from './jupiter';
import {
  fromSmallestUnit,
  getOkxPriceImpact,
  getOkxRouteLabel,
  getOkxSwapQuote,
  isOkxEnabled,
  OkxSwapResponse,
} from './okx';
import {
  buildQuoteCacheKey,
  getCachedQuote,
  setCachedQuote,
} from './quoteCache';

export type AggregatorProvider = 'jupiter' | 'okx';

export interface AggregatorQuoteResult {
  provider: AggregatorProvider;
  amountOut: number;
  priceImpact: number;
  routeLabel: string;
  jupiterOrder?: JupiterOrderResponse;
  okxSwap?: OkxSwapResponse;
}

export const fetchBestAggregatorQuote = async (params: {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  inputDecimals: number;
  outputDecimals: number;
  slippagePercent: number;
  slippageSetting: string;
  userWallet?: string;
  compareAllProviders?: boolean;
  signal?: AbortSignal;
}): Promise<AggregatorQuoteResult | null> => {
  if (params.signal?.aborted) {
    return null;
  }

  const cacheKey = buildQuoteCacheKey({
    inputMint: params.inputMint.toString(),
    outputMint: params.outputMint.toString(),
    amount: params.amount,
    slippageSetting: params.slippageSetting,
    userWallet: params.userWallet,
    compareAllProviders: params.compareAllProviders,
  });

  const cached = getCachedQuote(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const candidates: AggregatorQuoteResult[] = [];
  const compareAll = params.compareAllProviders ?? false;

  if (isJupiterEnabled()) {
    const order = await getJupiterQuote(
      params.inputMint,
      params.outputMint,
      params.amount,
      params.inputDecimals,
      params.slippageSetting,
    );

    if (params.signal?.aborted) {
      return null;
    }

    if (order) {
      candidates.push({
        provider: 'jupiter',
        amountOut: fromSmallestUnit(order.outAmount, params.outputDecimals),
        priceImpact: getJupiterPriceImpact(order),
        routeLabel: getJupiterRouteLabel(order),
        jupiterOrder: order,
      });
    }
  }

  const shouldQuoteOkx =
    isOkxEnabled() &&
    params.userWallet &&
    (compareAll || candidates.length === 0);

  if (shouldQuoteOkx) {
    const swap = await getOkxSwapQuote(
      params.inputMint,
      params.outputMint,
      params.amount,
      params.inputDecimals,
      params.userWallet!,
      params.slippagePercent,
    );

    if (params.signal?.aborted) {
      return null;
    }

    if (swap?.routerResult?.toTokenAmount) {
      candidates.push({
        provider: 'okx',
        amountOut: fromSmallestUnit(swap.routerResult.toTokenAmount, params.outputDecimals),
        priceImpact: getOkxPriceImpact(swap),
        routeLabel: getOkxRouteLabel(swap),
        okxSwap: swap,
      });
    }
  }

  const result =
    candidates.length === 0
      ? null
      : candidates.reduce((best, current) =>
          current.amountOut > best.amountOut ? current : best,
        );

  setCachedQuote(cacheKey, result);
  return result;
};

export const isAnyAggregatorEnabled = (): boolean => isJupiterEnabled() || isOkxEnabled();
