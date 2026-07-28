import { getMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { USDC_MINT, USDT_MINT } from '../config/addresses';
import { fetchAllLockerEscrows } from '../services/kedolikLocker';
import { PoolInfo } from './amm';
import { fetchSwapVolumeByMint } from './poolVolumeApi';

export interface PoolStats {
  totalTvlUsd: number;
  poolLiquidityUsd: number;
  lockedAssetsUsd: number;
  lockedTokenUsd: number;
  lockedLiquidityUsd: number;
  volume24hUsd: number;
  directVolume24hUsd: number;
  aggregatorVolume24hUsd: number;
  swapEvents24h: number;
  scannedTransactions: number;
  reached24hBoundary: boolean;
  unpricedVolumeEvents: number;
}

const POOL_STATS_CACHE_KEY = 'kedolik-pool-stats-cache';
const POOL_STATS_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedPoolStatsPayload {
  stats: PoolStats;
  cachedAt: number;
}

// localStorage (not sessionStorage) so extra tabs and repeat visits reuse the same
// snapshot instead of each paying for a full pool + price refresh.
const readCachePayload = (): CachedPoolStatsPayload | null => {
  try {
    const raw = localStorage.getItem(POOL_STATS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPoolStatsPayload;
  } catch {
    return null;
  }
};

export const readCachedPoolStats = (): PoolStats | null => readCachePayload()?.stats ?? null;

export const isPoolStatsCacheFresh = (): boolean => {
  const payload = readCachePayload();
  if (!payload?.cachedAt) return false;
  return Date.now() - payload.cachedAt < POOL_STATS_CACHE_TTL_MS;
};

export const writeCachedPoolStats = (stats: PoolStats) => {
  try {
    const payload: CachedPoolStatsPayload = { stats, cachedAt: Date.now() };
    localStorage.setItem(POOL_STATS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (private mode / quota).
  }
};

export const formatUsdCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(value) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 100_000 ? 2 : 2,
  }).format(Number.isFinite(value) ? value : 0);

const rawToUiAmount = (value: string | bigint, decimals: number | null | undefined) => {
  if (decimals === null || decimals === undefined) {
    return 0;
  }

  const raw = typeof value === 'bigint' ? value : BigInt(value || '0');
  const text = raw.toString().padStart(decimals + 1, '0');

  if (decimals === 0) {
    return Number(text);
  }

  const whole = text.slice(0, -decimals) || '0';
  const fraction = text.slice(-decimals).slice(0, 12);
  return Number(`${whole}.${fraction}`);
};

const getPoolLiquidityUsd = (
  pool: PoolInfo,
  prices: Map<string, number>
) => {
  const token0Price = prices.get(pool.token0Mint.toString()) ?? 0;
  const token1Price = prices.get(pool.token1Mint.toString()) ?? 0;
  return pool.token0Reserve * token0Price + pool.token1Reserve * token1Price;
};

const getKnownDecimals = (pools: PoolInfo[]) => {
  const decimalsByMint = new Map<string, number>();

  pools.forEach((pool) => {
    decimalsByMint.set(pool.token0Mint.toString(), pool.token0Decimals);
    decimalsByMint.set(pool.token1Mint.toString(), pool.token1Decimals);
    decimalsByMint.set(pool.lpMint.toString(), pool.lpMintDecimals);
  });

  return decimalsByMint;
};

const getPrices = async (
  _connection: Connection,
  pools: PoolInfo[],
  mintAddresses: string[]
) => {
  const uniqueMints = [...new Set(mintAddresses)];
  const prices = new Map<string, number>();
  const stableMints = new Set([USDC_MINT.toString(), USDT_MINT.toString()]);

  uniqueMints.forEach((mint) => {
    if (stableMints.has(mint)) {
      prices.set(mint, 1);
    }
  });

  // Derive token prices from Kedolik pool reserves. This keeps pool stats based on
  // deployed pool/vault contract data and makes new meme pools priceable as soon as
  // they have a path to USDC/USDT through Kedolik liquidity.
  for (let pass = 0; pass < pools.length; pass += 1) {
    let updated = false;

    pools.forEach((pool) => {
      if (pool.token0Reserve <= 0 || pool.token1Reserve <= 0) {
        return;
      }

      const token0Mint = pool.token0Mint.toString();
      const token1Mint = pool.token1Mint.toString();
      const token0Price = prices.get(token0Mint);
      const token1Price = prices.get(token1Mint);

      if (token0Price && !token1Price) {
        prices.set(token1Mint, (pool.token0Reserve * token0Price) / pool.token1Reserve);
        updated = true;
      }

      if (token1Price && !token0Price) {
        prices.set(token0Mint, (pool.token1Reserve * token1Price) / pool.token0Reserve);
        updated = true;
      }
    });

    if (!updated) {
      break;
    }
  }

  return prices;
};

const priceRawTotals = (
  rawByMint: Record<string, string>,
  prices: Map<string, number>,
  decimalsByMint: Map<string, number>
) => {
  let volumeUsd = 0;
  let unpricedMints = 0;

  Object.entries(rawByMint).forEach(([mint, rawAmount]) => {
    const decimals = decimalsByMint.get(mint);
    const price = prices.get(mint) ?? 0;
    const usd = rawToUiAmount(rawAmount, decimals) * price;

    if (usd > 0) {
      volumeUsd += usd;
    } else {
      unpricedMints += 1;
    }
  });

  return { volumeUsd, unpricedMints };
};

const fetchVolume24h = async (
  prices: Map<string, number>,
  decimalsByMint: Map<string, number>
) => {
  const remote = await fetchSwapVolumeByMint();

  if (!remote) {
    return {
      volume24hUsd: 0,
      directVolume24hUsd: 0,
      aggregatorVolume24hUsd: 0,
      swapEvents24h: 0,
      scannedTransactions: 0,
      reached24hBoundary: false,
      unpricedVolumeEvents: 0,
    };
  }

  const total = priceRawTotals(remote.rawInputByMint, prices, decimalsByMint);
  const aggregator = priceRawTotals(remote.aggregatorRawInputByMint, prices, decimalsByMint);

  return {
    volume24hUsd: total.volumeUsd,
    directVolume24hUsd: Math.max(0, total.volumeUsd - aggregator.volumeUsd),
    aggregatorVolume24hUsd: aggregator.volumeUsd,
    swapEvents24h: remote.swapEvents24h,
    scannedTransactions: remote.scannedTransactions,
    reached24hBoundary: remote.reached24hBoundary,
    unpricedVolumeEvents: total.unpricedMints,
  };
};

export const fetchPoolStats = async (
  connection: Connection,
  pools: PoolInfo[]
): Promise<PoolStats> => {
  const decimalsByMint = getKnownDecimals(pools);
  const poolMints = pools.flatMap((pool) => [
    pool.token0Mint.toString(),
    pool.token1Mint.toString(),
  ]);
  const escrows = await fetchAllLockerEscrows(connection).catch(() => []);
  const activeEscrows = escrows.filter((escrow) => !escrow.isCancelled);
  const lockerMints = activeEscrows.map((escrow) => escrow.tokenMint);
  const prices = await getPrices(connection, pools, [...poolMints, ...lockerMints]);
  const poolLiquidityByLpMint = new Map<string, number>();
  let poolLiquidityUsd = 0;

  pools.forEach((pool) => {
    const liquidityUsd = getPoolLiquidityUsd(pool, prices);
    poolLiquidityUsd += liquidityUsd;
    poolLiquidityByLpMint.set(pool.lpMint.toString(), liquidityUsd);
  });

  let lockedTokenUsd = 0;
  let lockedLiquidityUsd = 0;

  await Promise.all(
    activeEscrows.map(async (escrow) => {
      if (!decimalsByMint.has(escrow.tokenMint)) {
        try {
          const mintInfo = await getMint(connection, new PublicKey(escrow.tokenMint), 'confirmed');
          decimalsByMint.set(escrow.tokenMint, mintInfo.decimals);
        } catch {
          return;
        }
      }

      const lpPool = pools.find((pool) => pool.lpMint.toString() === escrow.tokenMint);
      const lockedAmount = rawToUiAmount(escrow.lockedAmount, decimalsByMint.get(escrow.tokenMint));

      if (lockedAmount <= 0) {
        return;
      }

      if (lpPool) {
        const lpSupplyUi = lpPool.lpSupply / Math.pow(10, lpPool.lpMintDecimals);
        const poolLiquidityUsdForLp = poolLiquidityByLpMint.get(escrow.tokenMint) ?? 0;
        lockedLiquidityUsd +=
          lpSupplyUi > 0 ? (lockedAmount / lpSupplyUi) * poolLiquidityUsdForLp : 0;
        return;
      }

      lockedTokenUsd += lockedAmount * (prices.get(escrow.tokenMint) ?? 0);
    })
  );

  const volume = await fetchVolume24h(prices, decimalsByMint).catch(() => ({
    volume24hUsd: 0,
    directVolume24hUsd: 0,
    aggregatorVolume24hUsd: 0,
    swapEvents24h: 0,
    scannedTransactions: 0,
    reached24hBoundary: false,
    unpricedVolumeEvents: 0,
  }));

  const lockedAssetsUsd = lockedTokenUsd + lockedLiquidityUsd;

  return {
    totalTvlUsd: poolLiquidityUsd + lockedAssetsUsd,
    poolLiquidityUsd,
    lockedAssetsUsd,
    lockedTokenUsd,
    lockedLiquidityUsd,
    ...volume,
  };
};
