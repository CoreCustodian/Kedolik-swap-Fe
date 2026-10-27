/** Custom error numbers are program-specific. Only decode 6005 on Kedolik routes. */
export const isSwapSlippageError = (error: unknown, provider: string): boolean => {
  const value = error as { message?: string; logs?: string[] };
  const message = `${value?.message ?? ''} ${Array.isArray(value?.logs) ? value.logs.join(' ') : ''}`;
  if (/slippage/i.test(message)) return true;
  return provider === 'kedolik' && (
    /"Custom"\s*:\s*6005\b/i.test(message)
    || /custom program error:\s*0x1775\b/i.test(message)
    || /Error Number:\s*6005\b/i.test(message)
  );
};
