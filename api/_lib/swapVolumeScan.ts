import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  SignaturesForAddressOptions,
} from '@solana/web3.js';
import { readJsonBlob, writeJsonBlob } from './blobJsonCache.js';

const BLOB_PATHNAME = 'kedolik/pool-swap-volume.json';
const DAY_SECONDS = 24 * 60 * 60;
const SIGNATURE_PAGE_SIZE = 1000;
const TRANSACTION_BATCH_SIZE = 100;
/** Cap the scan so one cold request can never walk the whole program history. */
const MAX_SIGNATURE_PAGES = 5;
const SWAP_EVENT_DISCRIMINATOR = Buffer.from([64, 198, 205, 232, 38, 8, 113, 226]);

const DEFAULT_PROGRAM_ID = 'Hr4iqmE5wiStSiHGgzgUSryNG4hyqkSHUT7PDyAsE6Li';

/** Shared cache window — every visitor reads this instead of scanning the chain. */
export const SWAP_VOLUME_CACHE_TTL_MS = 10 * 60 * 1000;

export interface SwapVolumeByMint {
  /** Raw (base unit) input amount summed per input mint. */
  rawInputByMint: Record<string, string>;
  swapEvents24h: number;
  /** Swap events that came from multi-event (aggregator-style) transactions. */
  aggregatorSwapEvents24h: number;
  aggregatorRawInputByMint: Record<string, string>;
  scannedTransactions: number;
  reached24hBoundary: boolean;
  computedAt: number;
}

const programId = (): PublicKey =>
  new PublicKey(process.env.KEDOLIK_PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID);

const rpcUrl = (): string =>
  process.env.SOLANA_RPC_URL?.trim() ||
  process.env.VITE_RPC_ENDPOINT?.trim() ||
  'https://api.mainnet-beta.solana.com';

const decodeSwapEvent = (data: Buffer): { inputAmount: bigint; inputMint: string } | null => {
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

  const inputAmount = data.readBigUInt64LE(offset);
  offset += 8;
  offset += 8; // output_amount
  offset += 8; // input_transfer_fee
  offset += 8; // output_transfer_fee
  offset += 1; // base_input

  const inputMint = new PublicKey(data.subarray(offset, offset + 32)).toString();

  return { inputAmount, inputMint };
};

const getSwapEvents = (transaction: ParsedTransactionWithMeta | null) => {
  const logs = transaction?.meta?.logMessages ?? [];
  const events: Array<{ inputAmount: bigint; inputMint: string }> = [];

  logs.forEach((log) => {
    if (!log.startsWith('Program data: ')) return;

    try {
      const event = decodeSwapEvent(Buffer.from(log.slice('Program data: '.length), 'base64'));
      if (event) events.push(event);
    } catch {
      // Other programs can emit log lines with the same prefix.
    }
  });

  return events;
};

const addRaw = (target: Record<string, string>, mint: string, amount: bigint) => {
  const current = BigInt(target[mint] ?? '0');
  target[mint] = (current + amount).toString();
};

const scanSwapVolume = async (): Promise<SwapVolumeByMint> => {
  const connection = new Connection(rpcUrl(), 'confirmed');
  const program = programId();
  const cutoff = Math.floor(Date.now() / 1000) - DAY_SECONDS;

  const signatures: string[] = [];
  let before: string | undefined;
  let reached24hBoundary = false;

  for (let page = 0; page < MAX_SIGNATURE_PAGES && !reached24hBoundary; page += 1) {
    const options: SignaturesForAddressOptions = { limit: SIGNATURE_PAGE_SIZE, before };
    const batch = await connection.getSignaturesForAddress(program, options, 'confirmed');

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

  const rawInputByMint: Record<string, string> = {};
  const aggregatorRawInputByMint: Record<string, string> = {};
  let swapEvents24h = 0;
  let aggregatorSwapEvents24h = 0;

  for (let index = 0; index < signatures.length; index += TRANSACTION_BATCH_SIZE) {
    const batch = signatures.slice(index, index + TRANSACTION_BATCH_SIZE);
    const parsed = await connection.getParsedTransactions(batch, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    parsed.forEach((transaction) => {
      const events = getSwapEvents(transaction);
      const isAggregator = events.length > 1;

      events.forEach((event) => {
        swapEvents24h += 1;
        addRaw(rawInputByMint, event.inputMint, event.inputAmount);
        if (isAggregator) {
          aggregatorSwapEvents24h += 1;
          addRaw(aggregatorRawInputByMint, event.inputMint, event.inputAmount);
        }
      });
    });
  }

  return {
    rawInputByMint,
    aggregatorRawInputByMint,
    swapEvents24h,
    aggregatorSwapEvents24h,
    scannedTransactions: signatures.length,
    reached24hBoundary,
    computedAt: Date.now(),
  };
};

let inflight: Promise<SwapVolumeByMint> | null = null;

export const getSwapVolume24h = async (force = false): Promise<SwapVolumeByMint> => {
  if (!force) {
    const cached = await readJsonBlob<SwapVolumeByMint>(BLOB_PATHNAME);
    if (cached && Date.now() - cached.computedAt < SWAP_VOLUME_CACHE_TTL_MS) {
      return cached;
    }
  }

  // Collapse concurrent cold requests on the same warm lambda into one scan.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const stats = await scanSwapVolume();
      await writeJsonBlob(BLOB_PATHNAME, stats).catch(() => undefined);
      return stats;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

export const getStaleSwapVolume = async (): Promise<SwapVolumeByMint | null> =>
  readJsonBlob<SwapVolumeByMint>(BLOB_PATHNAME);
