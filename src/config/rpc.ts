import { KEDOLIK_STAKE_LOCK_V1 } from './kedolikStakeLockV1';

/**
 * Single source of truth for RPC endpoints.
 *
 * The WebSocket endpoint matters for quota: account/signature subscriptions are
 * pushed by the provider instead of being polled, so anything that can listen
 * should listen rather than re-query on a timer.
 */

export const RPC_HTTP_ENDPOINT: string =
  import.meta.env.VITE_RPC_ENDPOINT?.trim() || KEDOLIK_STAKE_LOCK_V1.preferredRpcEndpoint || '';

const deriveWsEndpoint = (httpEndpoint: string): string => {
  if (!httpEndpoint) return '';
  if (httpEndpoint.startsWith('https://')) return `wss://${httpEndpoint.slice('https://'.length)}`;
  if (httpEndpoint.startsWith('http://')) return `ws://${httpEndpoint.slice('http://'.length)}`;
  return '';
};

export const RPC_WS_ENDPOINT: string =
  import.meta.env.VITE_RPC_ENDPOINT_WS?.trim() || deriveWsEndpoint(RPC_HTTP_ENDPOINT);

/** Connection config to use everywhere a `new Connection(...)` is created. */
export const getConnectionConfig = () =>
  ({
    commitment: 'confirmed' as const,
    ...(RPC_WS_ENDPOINT ? { wsEndpoint: RPC_WS_ENDPOINT } : {}),
  });

export const hasWebsocketEndpoint = (): boolean => Boolean(RPC_WS_ENDPOINT);
