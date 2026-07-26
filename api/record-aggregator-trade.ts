import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  appendAggregatorTrade,
  isBlobConfigured,
  verifySuccessfulTransaction,
  type AggregatorProvider,
} from './_lib/aggregatorVolumeStore';

interface RecordTradeBody {
  signature?: string;
  provider?: AggregatorProvider;
  volumeUsd?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isBlobConfigured()) {
    return res.status(503).json({ error: 'Aggregator volume storage is not configured' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as RecordTradeBody;
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
      return res.status(400).json({ error: 'Transaction not confirmed on-chain' });
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
    return res.status(500).json({ error: 'Failed to record trade' });
  }
}
