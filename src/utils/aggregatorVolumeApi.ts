export interface AggregatorVolumeStats {
  volume24hUsd: number;
  jupiterVolume24hUsd: number;
  okxVolume24hUsd: number;
  tradeCount24h: number;
  jupiterTradeCount24h: number;
  okxTradeCount24h: number;
  storageEnabled?: boolean;
}

const EMPTY_STATS: AggregatorVolumeStats = {
  volume24hUsd: 0,
  jupiterVolume24hUsd: 0,
  okxVolume24hUsd: 0,
  tradeCount24h: 0,
  jupiterTradeCount24h: 0,
  okxTradeCount24h: 0,
};

const apiBase = (): string => import.meta.env.VITE_AGGREGATOR_VOLUME_API?.trim() || '';

export const fetchAggregatorVolume24h = async (): Promise<AggregatorVolumeStats> => {
  try {
    const response = await fetch(`${apiBase()}/api/aggregator-volume`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return EMPTY_STATS;
    }

    const data = (await response.json()) as AggregatorVolumeStats;
    return {
      volume24hUsd: Number(data.volume24hUsd) || 0,
      jupiterVolume24hUsd: Number(data.jupiterVolume24hUsd) || 0,
      okxVolume24hUsd: Number(data.okxVolume24hUsd) || 0,
      tradeCount24h: Number(data.tradeCount24h) || 0,
      jupiterTradeCount24h: Number(data.jupiterTradeCount24h) || 0,
      okxTradeCount24h: Number(data.okxTradeCount24h) || 0,
      storageEnabled: data.storageEnabled,
    };
  } catch (error) {
    console.warn('Failed to fetch global aggregator volume:', error);
    return EMPTY_STATS;
  }
};

export const recordAggregatorTradeRemote = async (params: {
  signature: string;
  provider: 'jupiter' | 'okx';
  volumeUsd: number;
}): Promise<boolean> => {
  if (!Number.isFinite(params.volumeUsd) || params.volumeUsd <= 0) {
    return false;
  }

  try {
    const response = await fetch(`${apiBase()}/api/record-aggregator-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.warn('Aggregator volume API rejected trade:', await response.text());
      return false;
    }

    window.dispatchEvent(new CustomEvent('kedolik-aggregator-volume-updated'));
    return true;
  } catch (error) {
    console.warn('Failed to record aggregator trade remotely:', error);
    return false;
  }
};
