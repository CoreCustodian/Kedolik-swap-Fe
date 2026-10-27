/** Parts per million, matching the existing Kedolik discount quote model. */
export const DISCOUNT_TRADE_FEE_RATE = 2000;

export const getSwapTradeFeeRate = (poolFeeRate: number, useDiscount = false): number =>
  useDiscount ? DISCOUNT_TRADE_FEE_RATE : poolFeeRate;

export const calculateSwapOutput = (
  amountIn: number, reserveIn: number, reserveOut: number, tradeFeeRate = 100,
): { amountOut: number; priceImpact: number; fee: number } => {
  if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) return { amountOut: 0, priceImpact: 0, fee: 0 };
  const fee = amountIn * tradeFeeRate / 1000000;
  const amountInAfterFee = amountIn - fee;
  const amountOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee);
  const priceImpact = Math.abs(((amountIn / reserveIn) / (amountOut / reserveOut) - 1) * 100);
  return { amountOut, priceImpact, fee };
};

export const validateSwapMinimum = (expectedOutput: number, minimumOutput: number): void => {
  if (!Number.isFinite(expectedOutput) || expectedOutput <= 0
    || !Number.isFinite(minimumOutput) || minimumOutput <= 0) {
    throw new Error('Unable to calculate a valid swap quote. Refresh the quote and try again.');
  }
  if (expectedOutput < minimumOutput) {
    throw new Error('The price changed beyond your slippage limit. Review the refreshed quote and try again.');
  }
};
