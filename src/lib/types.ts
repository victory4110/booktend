export type Status = 'New' | 'In progress' | 'Scheduled' | 'Completed';
export const STATUSES: Status[] = ['New', 'In progress', 'Scheduled', 'Completed'];

export interface Job {
  _id: string;
  businessId: string;
  customer: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  status: Status;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  customer: string;
  email: string;
  phone: string;
  lastService: string;
  count: number;
}

export interface CustomerDetail {
  customer: Customer & { firstBookingAt: string; lastBookingAt: string };
  jobs: Job[];
}

export interface Overview {
  counts: Partial<Record<Status, number>>;
  recent: Job[];
  today: Job[];
}

export interface SessionUser {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

export interface Workspace {
  name: string;
  slug: string;
}
