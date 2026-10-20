import type { Job } from './db';
    
    /**
     * Keyset-pagination cursor for the jobs list.
     *
     * The list is sorted by `createdAt` (newest first) with the job id as a
     * tiebreaker, so the cursor carries both. Encoding the pair as one opaque token
     * keeps the ordering stable even when ids are not lexicographically ordered
     * (e.g. `JF-10000` sorts before `JF-9999` as a string).
     */
    const separator = '|';
    
    export interface JobCursor {
      createdAt: Date;
      id: string;
    }
    
    export function encodeJobCursor(job: Pick<Job, 'createdAt' | '_id'>): string {
      return Buffer.from(`${job.createdAt.toISOString()}${separator}${job._id}`, 'utf8').toString('base64url');
    }
    
    /** Returns null for anything that is not a cursor this app produced. */
    export function decodeJobCursor(value: string): JobCursor | null {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      const index = decoded.indexOf(separator);
      if (index <= 0) return null;
      const createdAt = new Date(decoded.slice(0, index));
      const id = decoded.slice(index + 1);
      if (!id || Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id };
    }
    
    /** Mongo filter selecting everything that sorts after the cursor. */
    export function jobCursorFilter(cursor: JobCursor): Record<string, unknown> {
      return {
        $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }]
      };
    }
    
    /** Sort order that matches the cursor. */
    export const JOB_SORT = { createdAt: -1, _id: -1 } as const;
    