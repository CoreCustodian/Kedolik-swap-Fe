import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  appendAggregatorTrade,
  isBlobConfigured,
  type AggregatorProvider,
} from './lib/aggregatorVolumeStore';
import { verifySuccessfulTransaction } from './lib/verifyTransaction';

interface RecordTradeBody {
  signature?: string;
  provider?: AggregatorProvider;
  volumeUsd?: number;
}

const parseBody = (req: VercelRequest): RecordTradeBody => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as RecordTradeBody;
    } catch {
      return {};
    }
  }
  return req.body as RecordTradeBody;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isBlobConfigured()) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN is not configured on Vercel' });
  }

  const body = parseBody(req);
  const signature = body.signature?.trim();
  const provider = body.provider;
  const volumeUsd = Number(body.volumeUsd);

  if (!signature || (provider !== 'jupiter' && provider !== 'okx')) {
    return res.status(400).json({ error: 'Invalid signature or provider' });
  }

  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0 || volumeUsd > 1_000_000_000) {
    return res.status(400).json({ error: 'Invalid volumeUsd' });
  }

  try {
    const verified = await verifySuccessfulTransaction(signature);
    if (!verified) {
      return res.status(400).json({ error: 'Transaction not confirmed on-chain yet' });
    }

    const recorded = await appendAggregatorTrade({
      signature,
      provider,
      volumeUsd,
      timestamp: Date.now(),
    });

    return res.status(recorded ? 201 : 200).json({ ok: true, recorded });
  } catch (error) {
    console.error('record-aggregator-trade failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to record trade';
    return res.status(500).json({ error: message });
  }
}
