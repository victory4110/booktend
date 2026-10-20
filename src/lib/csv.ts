import type { Job } from './types';

/** Escapes a single field value for RFC 4180-compliant CSV output. */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

/** Formats an array of jobs as a CSV string with a standard header row. */
export function jobsToCsv(jobs: Job[]): string {
  const headers = ['Reference', 'Customer', 'Email', 'Phone', 'Service', 'Date', 'Status', 'Notes', 'Created At'];
  const rows = jobs.map((j) =>
    [
      escapeCsvField(j._id),
      escapeCsvField(j.customer),
      escapeCsvField(j.email),
      escapeCsvField(j.phone),
      escapeCsvField(j.service),
      escapeCsvField(j.date),
      escapeCsvField(j.status),
      escapeCsvField(j.notes),
      escapeCsvField(j.createdAt)
    ].join(',')
  );
  return [headers.join(','), ...rows].join('\r\n');
}
