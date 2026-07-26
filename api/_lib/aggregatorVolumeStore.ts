import { get, put } from '@vercel/blob';

const BLOB_PATHNAME = 'kedolik/aggregator-trades.json';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;

export type AggregatorProvider = 'jupiter' | 'okx';

export interface AggregatorTradeRecord {
  signature: string;
  provider: AggregatorProvider;
  volumeUsd: number;
  timestamp: number;
}

interface TradeStore {
  trades: AggregatorTradeRecord[];
}

const emptyStore = (): TradeStore => ({ trades: [] });

const blobToken = (): string | undefined => process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;

const blobStoreId = (): string | undefined => process.env.BLOB_STORE_ID?.trim() || undefined;

const blobOptions = () => {
  const token = blobToken();
  const storeId = blobStoreId();
  return {
    access: 'private' as const,
    ...(token ? { token } : {}),
    ...(storeId ? { storeId } : {}),
  };
};

const pruneTrades = (trades: AggregatorTradeRecord[]) => {
  const cutoff = Date.now() - RETENTION_MS;
  const seen = new Set<string>();
  return trades
    .filter((trade) => trade.timestamp >= cutoff)
    .filter((trade) => {
      if (seen.has(trade.signature)) return false;
      seen.add(trade.signature);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
};

export const isBlobConfigured = (): boolean => Boolean(blobToken());

export const readTradeStore = async (): Promise<TradeStore> => {
  if (!isBlobConfigured()) {
    return emptyStore();
  }

  try {
    const result = await get(BLOB_PATHNAME, {
      ...blobOptions(),
      useCache: false,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return emptyStore();
    }

    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as TradeStore;
    if (!Array.isArray(parsed.trades)) {
      return emptyStore();
    }

    return { trades: pruneTrades(parsed.trades) };
  } catch (error) {
    console.error('Failed to read aggregator trade store:', error);
    return emptyStore();
  }
};

export const writeTradeStore = async (store: TradeStore): Promise<void> => {
  const token = blobToken();
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  const payload: TradeStore = {
    trades: pruneTrades(store.trades),
  };

  await put(BLOB_PATHNAME, JSON.stringify(payload), {
    ...blobOptions(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
};

export const getAggregatorVolume24h = async () => {
  const store = await readTradeStore();
  const cutoff = Date.now() - DAY_MS;
  const recent = store.trades.filter((trade) => trade.timestamp >= cutoff);

  let jupiterVolume24hUsd = 0;
  let okxVolume24hUsd = 0;
  let jupiterTradeCount24h = 0;
  let okxTradeCount24h = 0;

  recent.forEach((trade) => {
    if (trade.provider === 'okx') {
      okxVolume24hUsd += trade.volumeUsd;
      okxTradeCount24h += 1;
    } else {
      jupiterVolume24hUsd += trade.volumeUsd;
      jupiterTradeCount24h += 1;
    }
  });

  return {
    volume24hUsd: jupiterVolume24hUsd + okxVolume24hUsd,
    jupiterVolume24hUsd,
    okxVolume24hUsd,
    tradeCount24h: recent.length,
    jupiterTradeCount24h,
    okxTradeCount24h,
    storageEnabled: isBlobConfigured(),
  };
};

export const appendAggregatorTrade = async (trade: AggregatorTradeRecord): Promise<boolean> => {
  const store = await readTradeStore();
  if (store.trades.some((existing) => existing.signature === trade.signature)) {
    return false;
  }

  store.trades.unshift(trade);
  await writeTradeStore(store);
  return true;
};
