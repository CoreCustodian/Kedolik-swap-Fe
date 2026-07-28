import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStaleSwapVolume, getSwapVolume24h } from './_lib/swapVolumeScan.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getSwapVolume24h();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(stats);
  } catch (error) {
    console.error('pool-swap-volume GET failed:', error);

    // Serving stale data beats sending every visitor back to the RPC.
    const stale = await getStaleSwapVolume().catch(() => null);
    if (stale) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(200).json({ ...stale, stale: true });
    }

    const message = error instanceof Error ? error.message : 'Failed to load swap volume';
    return res.status(500).json({ error: message });
  }
}
