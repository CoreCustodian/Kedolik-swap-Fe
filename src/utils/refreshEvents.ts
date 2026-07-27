/** Cross-app refresh signals — no polling; invalidate caches on meaningful events only. */

export const REFRESH_EVENTS = {
  BALANCES: 'kedolik:balances-invalidate',
  POOLS: 'kedolik:pools-invalidate',
  STAKING: 'kedolik:staking-invalidate',
  LOCKS: 'kedolik:locks-invalidate',
  SWAP_SUCCESS: 'kedolik:swap-success',
} as const;

export type RefreshEventName = (typeof REFRESH_EVENTS)[keyof typeof REFRESH_EVENTS];

export const dispatchBalanceInvalidation = (wallet?: string): void => {
  window.dispatchEvent(
    new CustomEvent(REFRESH_EVENTS.BALANCES, { detail: { wallet } }),
  );
};

export const dispatchSwapSuccess = (wallet?: string): void => {
  dispatchBalanceInvalidation(wallet);
  window.dispatchEvent(
    new CustomEvent(REFRESH_EVENTS.SWAP_SUCCESS, { detail: { wallet } }),
  );
};

export const dispatchStakingInvalidation = (): void => {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENTS.STAKING));
};

export const dispatchLocksInvalidation = (): void => {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENTS.LOCKS));
};

export const dispatchPoolsInvalidation = (): void => {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENTS.POOLS));
};

export const onRefreshEvent = (
  event: RefreshEventName,
  handler: (detail?: { wallet?: string }) => void,
): (() => void) => {
  const listener = (e: Event) => {
    const custom = e as CustomEvent<{ wallet?: string }>;
    handler(custom.detail);
  };
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
};
