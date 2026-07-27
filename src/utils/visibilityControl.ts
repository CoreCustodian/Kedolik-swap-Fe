/** Pause background work when the tab is hidden (saves ~20–40% RPC/API). */

export const isPageVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

export const onPageVisibilityChange = (handler: (visible: boolean) => void): (() => void) => {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  const listener = () => handler(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};
