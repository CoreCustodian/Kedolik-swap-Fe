/**
 * 24h swap volume is scanned server-side and shared by every visitor.
 * Doing it in the browser meant one full `getSignaturesForAddress` walk per user.
 */

export interface SwapVolumeByMintResponse {
  rawInputByMint: Record<string, string>;
  aggregatorRawInputByMint: Record<string, string>;
  swapEvents24h: number;
  aggregatorSwapEvents24h: number;
  scannedTransactions: number;
  reached24hBoundary: boolean;
  computedAt: number;
}

const apiBase = (): string => import.meta.env.VITE_AGGREGATOR_VOLUME_API?.trim() || '';

export const fetchSwapVolumeByMint = async (): Promise<SwapVolumeByMintResponse | null> => {
  try {
    const response = await fetch(`${apiBase()}/api/pool-swap-volume`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as SwapVolumeByMintResponse;
    if (!data || typeof data.rawInputByMint !== 'object') {
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to fetch pool swap volume:', error);
    return null;
  }
};
