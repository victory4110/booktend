export const DEFAULT_SERVICES = ['Home cleaning', 'Appliance repair', 'Plumbing', 'Electrical work', 'Other'];

export const JOB_STATUSES = ['New', 'In progress', 'Scheduled', 'Completed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Current date (YYYY-MM-DD) in the given IANA time zone. */
export function todayInBusinessTimezone(timezone = 'Africa/Lagos'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
