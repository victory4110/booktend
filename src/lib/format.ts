import type { Status } from './types';

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function statusClass(status: Status): string {
  return (
    { New: 'status-new', 'In progress': 'status-progress', Scheduled: 'status-scheduled', Completed: 'status-completed' } as Record<Status, string>
  )[status];
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', options).format(date);
}
