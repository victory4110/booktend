import { Businesses } from '@/server/db';
import { defineRoute, jsonOk } from '@/server/http';
import { filterPublicBusinesses } from '@/server/operations';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  const service = searchParams.get('service') ?? '';

  const docs = (await Businesses.collection
    .find({ publicListed: { $ne: false } }, { projection: { name: 1, slug: 1, timezone: 1, services: 1, publicListed: 1 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray()) as unknown as { name: string; slug: string; timezone?: string; services?: string[]; publicListed?: boolean }[];

  const businesses = filterPublicBusinesses(docs, query, service);
  const serviceSet = new Map<string, string>();
  for (const doc of docs) {
    for (const svc of filterPublicBusinesses([doc])[0]?.services ?? []) {
      const key = svc.toLowerCase();
      if (!serviceSet.has(key)) serviceSet.set(key, svc);
    }
  }

  return jsonOk({
    businesses,
    services: [...serviceSet.values()]
  });
});
