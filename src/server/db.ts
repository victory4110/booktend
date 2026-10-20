import mongoose, { type Model, Schema } from 'mongoose';
import type { JobStatus } from './constants';

export interface Owner {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl?: string | null;
  createdAt: Date;
}

export interface Business {
  _id: string;
  name: string;
  slug: string;
  timezone?: string;
  services?: string[];
  publicListed?: boolean;
  owner?: Owner;
  notificationEmail?: string;
  createdAt: Date;
}

export interface StaffUser {
  _id: string;
  businessId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'staff';
  avatarUrl?: string | null;
  createdAt: Date;
}

export interface StatusChange {
  status: JobStatus;
  changedAt: Date;
  changedBy: string;
}

export interface Job {
  _id: string;
  businessId: string;
  customer: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  status: JobStatus;
  notes: string;
  statusHistory: StatusChange[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Counter {
  _id: string;
  value: number;
}

export type MailKind = 'customer-confirmation' | 'staff-notification';
export type MailState = 'pending' | 'processing' | 'sent' | 'failed';

export interface MailJob {
  _id: string;
  businessId: string;
  jobId: string;
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  state: MailState;
  attempts: number;
  nextAttemptAt: Date;
  lockUntil?: Date;
  createdAt: Date;
  sentAt?: Date;
  lastError?: string;
}

const businessSchema = new Schema<Business>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    timezone: String,
    services: { type: [String], default: undefined },
    publicListed: { type: Boolean, default: true },
    owner: { type: Object },
    notificationEmail: String,
    createdAt: { type: Date, required: true }
  },
  { collection: 'businesses', versionKey: false }
);
businessSchema.index({ slug: 1 }, { unique: true });
businessSchema.index({ 'owner.email': 1 }, { unique: true, sparse: true });

const staffUserSchema = new Schema<StaffUser>(
  {
    _id: { type: String, required: true },
    businessId: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, default: 'staff' },
    avatarUrl: { type: String, default: null },
    createdAt: { type: Date, required: true }
  },
  { collection: 'staff_users', versionKey: false }
);
staffUserSchema.index({ businessId: 1, email: 1 }, { unique: true });

const jobSchema = new Schema<Job>(
  {
    _id: { type: String, required: true },
    businessId: { type: String, required: true },
    customer: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    service: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, required: true },
    notes: { type: String, default: '' },
    statusHistory: { type: [Object], default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { collection: 'jobs', versionKey: false }
);
jobSchema.index({ businessId: 1, createdAt: -1, _id: -1 });
jobSchema.index({ businessId: 1, _id: -1 });
jobSchema.index({ businessId: 1, date: 1, status: 1 });
jobSchema.index({ businessId: 1, email: 1, date: -1 });

const counterSchema = new Schema<Counter>(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, default: 0 }
  },
  { collection: 'counters', versionKey: false }
);

const mailJobSchema = new Schema<MailJob>(
  {
    _id: { type: String, required: true },
    businessId: { type: String, required: true },
    jobId: { type: String, required: true },
    kind: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    state: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true },
    lockUntil: Date,
    createdAt: { type: Date, required: true },
    sentAt: Date,
    lastError: String
  },
  { collection: 'mail_outbox', versionKey: false }
);
mailJobSchema.index({ state: 1, nextAttemptAt: 1, createdAt: 1 });
mailJobSchema.index({ lockUntil: 1 });

// Reuse models across Next.js hot reloads to avoid "OverwriteModelError",
// while ensuring schema fields added during hot reloads are registered.
function model<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing) {
    existing.schema.add(schema);
    return existing;
  }
  return mongoose.model<T>(name, schema);
}

export const Businesses = model<Business>('Business', businessSchema);
export const StaffUsers = model<StaffUser>('StaffUser', staffUserSchema);
export const Jobs = model<Job>('Job', jobSchema);
export const Counters = model<Counter>('Counter', counterSchema);
export const MailOutbox = model<MailJob>('MailJob', mailJobSchema);

// Cache the connection promise on the global object so every route handler and
// the mail worker share one connection across hot reloads.
const globalForMongoose = globalThis as unknown as { _booktendMongoose?: Promise<typeof mongoose> };

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI must be set before starting Booktend.');
  if (!globalForMongoose._booktendMongoose) {
    globalForMongoose._booktendMongoose = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DATABASE || 'jobflow',
      appName: 'Booktend'
    });
  }
  return globalForMongoose._booktendMongoose;
}
