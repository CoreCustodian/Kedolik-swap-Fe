import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAggregatorVolume24h } from './_lib/aggregatorVolumeStore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getAggregatorVolume24h();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(stats);
  } catch (error) {
    console.error('aggregator-volume GET failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to load aggregator volume';
    return res.status(500).json({ error: message });
  }
}
