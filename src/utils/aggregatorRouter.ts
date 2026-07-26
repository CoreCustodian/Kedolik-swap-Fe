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
  userWallet?: string;
}): Promise<AggregatorQuoteResult | null> => {
  const candidates: AggregatorQuoteResult[] = [];

  const quotePromises: Promise<void>[] = [];

  if (isJupiterEnabled()) {
    quotePromises.push(
      (async () => {
        const order = await getJupiterQuote(
          params.inputMint,
          params.outputMint,
          params.amount,
          params.inputDecimals,
          params.slippagePercent
        );
        if (!order) return;
        candidates.push({
          provider: 'jupiter',
          amountOut: fromSmallestUnit(order.outAmount, params.outputDecimals),
          priceImpact: getJupiterPriceImpact(order),
          routeLabel: getJupiterRouteLabel(order),
          jupiterOrder: order,
        });
      })()
    );
  }

  if (isOkxEnabled() && params.userWallet) {
    quotePromises.push(
      (async () => {
        const swap = await getOkxSwapQuote(
          params.inputMint,
          params.outputMint,
          params.amount,
          params.inputDecimals,
          params.userWallet!,
          params.slippagePercent
        );
        if (!swap?.routerResult?.toTokenAmount) return;
        candidates.push({
          provider: 'okx',
          amountOut: fromSmallestUnit(swap.routerResult.toTokenAmount, params.outputDecimals),
          priceImpact: getOkxPriceImpact(swap),
          routeLabel: getOkxRouteLabel(swap),
          okxSwap: swap,
        });
      })()
    );
  }

  await Promise.all(quotePromises);

  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) =>
    current.amountOut > best.amountOut ? current : best
  );
};

export const isAnyAggregatorEnabled = (): boolean => isJupiterEnabled() || isOkxEnabled();
