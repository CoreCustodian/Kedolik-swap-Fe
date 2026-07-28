import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isBlobConfigured } from './_lib/blobJsonCache.js';
import { getSwapVolume24h } from './_lib/swapVolumeScan.js';

/**
 * Protected refresh endpoint for a scheduled job.
 *
 * Keeping this separate from the public read endpoint guarantees that page
 * traffic can never trigger historical RPC scans. Configure CRON_SECRET and
 * call this endpoint with `Authorization: Bearer <CRON_SECRET>`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.authorization;

  if (!secret || authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isBlobConfigured()) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN is not configured' });
  }

  try {
    const stats = await getSwapVolume24h(true);
    return res.status(200).json(stats);
  } catch (error) {
    console.error('refresh-pool-swap-volume failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to refresh swap volume';
    return res.status(500).json({ error: message });
  }
}
