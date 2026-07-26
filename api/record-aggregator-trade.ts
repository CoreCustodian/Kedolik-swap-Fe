import {
  appendAggregatorTrade,
  isBlobConfigured,
  type AggregatorProvider,
} from './_lib/aggregatorVolumeStore';
import { verifySuccessfulTransaction } from './_lib/verifyTransaction';

interface RecordTradeBody {
  signature?: string;
  provider?: AggregatorProvider;
  volumeUsd?: number;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  if (!isBlobConfigured()) {
    return Response.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured on Vercel' },
      { status: 503 },
    );
  }

  let body: RecordTradeBody;
  try {
    body = (await request.json()) as RecordTradeBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const signature = body.signature?.trim();
  const provider = body.provider;
  const volumeUsd = Number(body.volumeUsd);

  if (!signature || (provider !== 'jupiter' && provider !== 'okx')) {
    return Response.json({ error: 'Invalid signature or provider' }, { status: 400 });
  }

  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0 || volumeUsd > 1_000_000_000) {
    return Response.json({ error: 'Invalid volumeUsd' }, { status: 400 });
  }

  try {
    const verified = await verifySuccessfulTransaction(signature);
    if (!verified) {
      return Response.json({ error: 'Transaction not confirmed on-chain yet' }, { status: 400 });
    }

    const recorded = await appendAggregatorTrade({
      signature,
      provider,
      volumeUsd,
      timestamp: Date.now(),
    });

    return Response.json({ ok: true, recorded }, { status: recorded ? 201 : 200 });
  } catch (error) {
    console.error('record-aggregator-trade failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to record trade';
    return Response.json({ error: message }, { status: 500 });
  }
}
