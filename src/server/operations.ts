import { type Business, type Counter, Counters, type Job, Jobs } from './db';
    import { DEFAULT_SERVICES } from './constants';
    import type { BookingInput } from './schemas';
    
    /** Reference prefix, e.g. `JF-0001`. */
    const referencePrefix = 'JF-';
    /**
     * Job references are a single app-wide sequence (the job `_id` is the primary
     * key, so two workspaces must never allocate the same number) kept in one
     * counter document.
     */
    const referenceCounterId = 'job-reference';
    
    /** The business's own service list, or the shared defaults when unset. */
    export function servicesFor(business: Pick<Business, 'services'>): string[] {
      return business.services?.length ? business.services : DEFAULT_SERVICES;
    }

    export interface PublicBusinessSummary {
      name: string;
      slug: string;
      timezone: string;
      services: string[];
    }

    /**
     * Formats and filters businesses for the public directory. Matches the free-text
     * query against the business name, URL slug, or any offered service (including
     * default services when a workspace has not customized its list), and optionally
     * narrows by an exact service name (case-insensitive).
     */
    export function filterPublicBusinesses(
      businesses: Pick<Business, 'name' | 'slug' | 'timezone' | 'services' | 'publicListed'>[],
      query = '',
      serviceFilter = ''
    ): PublicBusinessSummary[] {
      const q = query.trim().toLowerCase();
      const s = serviceFilter.trim().toLowerCase();

      return businesses
        .filter((b) => b.publicListed !== false)
        .map((b) => ({
          name: b.name,
          slug: b.slug,
          timezone: b.timezone || 'Africa/Lagos',
          services: servicesFor(b)
        }))
        .filter((b) => {
          if (s && !b.services.some((svc) => svc.toLowerCase() === s)) return false;
          if (!q) return true;
          return (
            b.name.toLowerCase().includes(q) ||
            b.slug.toLowerCase().includes(q) ||
            b.services.some((svc) => svc.toLowerCase().includes(q))
          );
        });
    }
    
    export function formatReference(value: number): string {
      return `${referencePrefix}${String(value).padStart(4, '0')}`;
    }
    
    /** Highest numeric reference already stored, so a new counter never reissues ids. */
    async function highestExistingReference(): Promise<number> {
      const [row] = await Jobs.aggregate<{ highest: number }>([
        { $match: { _id: new RegExp(`^${referencePrefix}\\d+$`) } },
        { $project: { value: { $toInt: { $substrBytes: ['$_id', referencePrefix.length, 16] } } } },
        { $group: { _id: null, highest: { $max: '$value' } } }
      ]);
      return row?.highest ?? 0;
    }
    
    /**
     * Seeds the shared counter above any existing references. Needed once for
     * databases created when each workspace numbered its own jobs, which produced
     * duplicate ids across workspaces. `$max` keeps this idempotent and safe if two
     * requests race.
     */
    async function ensureReferenceCounter(): Promise<void> {
      if (await Counters.exists({ _id: referenceCounterId })) return;
      const highest = await highestExistingReference();
      await Counters.updateOne({ _id: referenceCounterId }, { $max: { value: highest } }, { upsert: true });
    }
    
    async function allocateReference(): Promise<number> {
      const counter = await Counters.findOneAndUpdate(
        { _id: referenceCounterId },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after' }
      ).lean<Counter>();
      if (!counter) throw new Error('Could not allocate a job reference.');
      return counter.value;
    }
    
    /** Allocates the next reference and inserts a job. */
    export async function insertBooking(businessId: string, input: BookingInput, changedBy: string): Promise<Job> {
      await ensureReferenceCounter();
    
      // A duplicate key here means the counter fell behind the collection (for
      // example after a restore). Re-seed and take the next number, once.
      let job: Job | undefined;
      for (let attempt = 1; attempt <= 2 && !job; attempt += 1) {
        const now = new Date();
        const candidate: Job = {
          _id: formatReference(await allocateReference()),
          businessId,
          ...input,
          status: 'New',
          statusHistory: [{ status: 'New', changedAt: now, changedBy }],
          createdAt: now,
          updatedAt: now
        };
        try {
          await Jobs.create(candidate);
          job = candidate;
        } catch (error) {
          const duplicate = typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
          if (!duplicate || attempt === 2) throw error;
          await Counters.updateOne({ _id: referenceCounterId }, { $max: { value: await highestExistingReference() } }, { upsert: true });
        }
      }
      if (!job) throw new Error('Could not allocate a job reference.');
      return job;
    }
    