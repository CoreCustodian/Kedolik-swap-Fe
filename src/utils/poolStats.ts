import { getMint } from '@solana/spl-token';
import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  SignaturesForAddressOptions,
} from '@solana/web3.js';
import { PROGRAM_ID } from '../config/addresses';
import { fetchAllLockerEscrows } from '../services/kedolikLocker';
import { getTokenPrices, getTokenUsdPrice } from './prices';
import { PoolInfo } from './amm';

const DAY_SECONDS = 24 * 60 * 60;
const MAX_SIGNATURE_PAGES = 3;
const SIGNATURE_PAGE_SIZE = 1000;
const TRANSACTION_BATCH_SIZE = 100;
const SWAP_EVENT_DISCRIMINATOR = Buffer.from([64, 198, 205, 232, 38, 8, 113, 226]);

interface DecodedSwapEvent {
  inputAmount: string;
  inputMint: string;
}

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

const getPoolSymbolForMint = (pools: PoolInfo[], mint: string) => {
  const pool = pools.find(
    (candidate) =>
      candidate.token0Mint.toString() === mint || candidate.token1Mint.toString() === mint
  );

  if (!pool) {
    return undefined;
  }

  return pool.token0Mint.toString() === mint ? pool.token0Symbol : pool.token1Symbol;
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
  connection: Connection,
  pools: PoolInfo[],
  mintAddresses: string[]
) => {
  const uniqueMints = [...new Set(mintAddresses)];
  const prices = await getTokenPrices(uniqueMints);
  const missingMints = uniqueMints.filter((mint) => !prices.has(mint));

  await Promise.all(
    missingMints.map(async (mint) => {
      const fallbackPrice = await getTokenUsdPrice(
        connection,
        mint,
        getPoolSymbolForMint(pools, mint)
      );

      if (fallbackPrice > 0) {
        prices.set(mint, fallbackPrice);
      }
    })
  );

  return prices;
};

const decodeU64 = (data: Buffer, offset: number) => ({
  value: data.readBigUInt64LE(offset),
  nextOffset: offset + 8,
});

const decodePublicKey = (data: Buffer, offset: number) => ({
  value: new PublicKey(data.subarray(offset, offset + 32)).toString(),
  nextOffset: offset + 32,
});

const decodeSwapEvent = (data: Buffer): DecodedSwapEvent | null => {
  if (
    data.length < 154 ||
    !data.subarray(0, SWAP_EVENT_DISCRIMINATOR.length).equals(SWAP_EVENT_DISCRIMINATOR)
  ) {
    return null;
  }

  let offset = 8;
  offset += 32; // pool_id
  offset += 8; // input_vault_before
  offset += 8; // output_vault_before

  const inputAmount = decodeU64(data, offset);
  offset = inputAmount.nextOffset;
  offset += 8; // output_amount
  offset += 8; // input_transfer_fee
  offset += 8; // output_transfer_fee
  offset += 1; // base_input

  const inputMint = decodePublicKey(data, offset);

  return {
    inputAmount: inputAmount.value.toString(),
    inputMint: inputMint.value,
  };
};

const getSwapEventsFromTransaction = (transaction: ParsedTransactionWithMeta | null) => {
  const logs = transaction?.meta?.logMessages ?? [];
  const events: DecodedSwapEvent[] = [];

  logs.forEach((log) => {
    const encodedData = log.startsWith('Program data: ')
      ? log.slice('Program data: '.length)
      : null;

    if (!encodedData) {
      return;
    }

    try {
      const event = decodeSwapEvent(Buffer.from(encodedData, 'base64'));
      if (event) {
        events.push(event);
      }
    } catch {
      // Non-Kedolik program data logs can share the same prefix.
    }
  });

  return events;
};

const fetchRecentProgramTransactions = async (connection: Connection) => {
  const cutoff = Math.floor(Date.now() / 1000) - DAY_SECONDS;
  const signatures: string[] = [];
  let before: string | undefined;
  let reached24hBoundary = false;

  for (let page = 0; page < MAX_SIGNATURE_PAGES; page += 1) {
    const options: SignaturesForAddressOptions = {
      limit: SIGNATURE_PAGE_SIZE,
      before,
    };
    const batch = await connection.getSignaturesForAddress(PROGRAM_ID, options, 'confirmed');

    if (batch.length === 0) {
      reached24hBoundary = true;
      break;
    }

    for (const item of batch) {
      if (item.blockTime && item.blockTime < cutoff) {
        reached24hBoundary = true;
        break;
      }

      if (!item.err && item.blockTime && item.blockTime >= cutoff) {
        signatures.push(item.signature);
      }
    }

    if (reached24hBoundary || batch.length < SIGNATURE_PAGE_SIZE) {
      reached24hBoundary = true;
      break;
    }

    before = batch[batch.length - 1].signature;
  }

  const transactions: Array<ParsedTransactionWithMeta | null> = [];

  for (let index = 0; index < signatures.length; index += TRANSACTION_BATCH_SIZE) {
    const batch = signatures.slice(index, index + TRANSACTION_BATCH_SIZE);
    const parsed = await connection.getParsedTransactions(batch, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    transactions.push(...parsed);
  }

  return {
    transactions,
    scannedTransactions: signatures.length,
    reached24hBoundary,
  };
};

const fetchVolume24h = async (
  connection: Connection,
  prices: Map<string, number>,
  decimalsByMint: Map<string, number>
) => {
  const { transactions, scannedTransactions, reached24hBoundary } =
    await fetchRecentProgramTransactions(connection);
  let volume24hUsd = 0;
  let directVolume24hUsd = 0;
  let aggregatorVolume24hUsd = 0;
  let swapEvents24h = 0;
  let unpricedVolumeEvents = 0;

  transactions.forEach((transaction) => {
    const events = getSwapEventsFromTransaction(transaction);
    let transactionVolumeUsd = 0;
    let transactionUnpricedEvents = 0;

    events.forEach((event) => {
      swapEvents24h += 1;
      const decimals = decimalsByMint.get(event.inputMint);
      const price = prices.get(event.inputMint) ?? 0;
      const eventVolumeUsd = rawToUiAmount(event.inputAmount, decimals) * price;

      if (eventVolumeUsd > 0) {
        transactionVolumeUsd += eventVolumeUsd;
      } else {
        transactionUnpricedEvents += 1;
      }
    });

    volume24hUsd += transactionVolumeUsd;
    unpricedVolumeEvents += transactionUnpricedEvents;

    if (events.length > 1) {
      aggregatorVolume24hUsd += transactionVolumeUsd;
    } else {
      directVolume24hUsd += transactionVolumeUsd;
    }
  });

  return {
    volume24hUsd,
    directVolume24hUsd,
    aggregatorVolume24hUsd,
    swapEvents24h,
    scannedTransactions,
    reached24hBoundary,
    unpricedVolumeEvents,
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

  const volume = await fetchVolume24h(connection, prices, decimalsByMint).catch(() => ({
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
