import { get, put } from '@vercel/blob';
import { Connection } from '@solana/web3.js';

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

export const isBlobConfigured = (): boolean =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

export const readTradeStore = async (): Promise<TradeStore> => {
  if (!isBlobConfigured()) {
    return emptyStore();
  }

  try {
    const blob = await get(BLOB_PATHNAME, { access: 'private' });
    const text = await new Response(blob as BodyInit).text();
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
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  const payload: TradeStore = {
    trades: pruneTrades(store.trades),
  };

  await put(BLOB_PATHNAME, JSON.stringify(payload), {
    access: 'private',
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

export const verifySuccessfulTransaction = async (signature: string): Promise<boolean> => {
  const rpcUrl =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.VITE_RPC_ENDPOINT?.trim() ||
    'https://api.mainnet-beta.solana.com';

  const connection = new Connection(rpcUrl, 'confirmed');
  const { value } = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = value[0];
  if (!status || status.err) {
    return false;
  }

  return (
    status.confirmationStatus === 'confirmed' ||
    status.confirmationStatus === 'finalized' ||
    status.confirmations === null
  );
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
