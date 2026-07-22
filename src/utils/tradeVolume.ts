// Platform trade volume tracking for swaps routed through Kedolik DEX or Jupiter.
// Persists to localStorage (per-browser). For production-wide analytics, add a backend.

export type SwapProvider = 'kedolik' | 'jupiter';

export interface TradeRecord {
  id: string;
  provider: SwapProvider;
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  inputAmount: number;
  outputAmount: number;
  volumeUsd: number;
  platformFeeUsd?: number;
  platformFeeAmount?: number;
  platformFeeMint?: string;
  platformFeeSymbol?: string;
  timestamp: number;
  txSignature: string;
}

export interface PlatformVolumeStats {
  volume24hUsd: number;
  kedolikVolume24hUsd: number;
  jupiterVolume24hUsd: number;
  platformFees24hUsd: number;
  tradeCount24h: number;
  kedolikTradeCount24h: number;
  jupiterTradeCount24h: number;
}

const STORAGE_KEY = 'kedolik-platform-trades';
const MAX_RECORDS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const readTrades = (): TradeRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TradeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeTrades = (trades: TradeRecord[]) => {
  try {
    const trimmed = trades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('kedolik-trade-recorded'));
  } catch (error) {
    console.error('Failed to persist trade record:', error);
  }
};

export const recordTrade = (trade: Omit<TradeRecord, 'id' | 'timestamp'> & { timestamp?: number }) => {
  const trades = readTrades();
  const record: TradeRecord = {
    ...trade,
    id: trade.txSignature,
    timestamp: trade.timestamp ?? Date.now(),
  };

  if (trades.some((existing) => existing.id === record.id)) {
    return;
  }

  writeTrades([record, ...trades]);
};

export const getRecentTrades = (limit = 50): TradeRecord[] =>
  readTrades().slice(0, limit);

export const getPlatformVolumeStats = (sinceMs: number = DAY_MS): PlatformVolumeStats => {
  const cutoff = Date.now() - sinceMs;
  const recent = readTrades().filter((trade) => trade.timestamp >= cutoff);

  let kedolikVolume24hUsd = 0;
  let jupiterVolume24hUsd = 0;
  let platformFees24hUsd = 0;
  let kedolikTradeCount24h = 0;
  let jupiterTradeCount24h = 0;

  recent.forEach((trade) => {
    platformFees24hUsd += trade.platformFeeUsd ?? 0;
    if (trade.provider === 'jupiter') {
      jupiterVolume24hUsd += trade.volumeUsd;
      jupiterTradeCount24h += 1;
    } else {
      kedolikVolume24hUsd += trade.volumeUsd;
      kedolikTradeCount24h += 1;
    }
  });

  return {
    volume24hUsd: kedolikVolume24hUsd + jupiterVolume24hUsd,
    kedolikVolume24hUsd,
    jupiterVolume24hUsd,
    platformFees24hUsd,
    tradeCount24h: recent.length,
    kedolikTradeCount24h,
    jupiterTradeCount24h,
  };
};

export const formatTradeTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString();
