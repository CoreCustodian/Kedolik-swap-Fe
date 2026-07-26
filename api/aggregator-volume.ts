import { getAggregatorVolume24h } from './_lib/aggregatorVolumeStore';

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  try {
    const stats = await getAggregatorVolume24h();
    return Response.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('aggregator-volume GET failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to load aggregator volume';
    return Response.json({ error: message }, { status: 500 });
  }
}
