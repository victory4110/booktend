import { randomUUID } from 'node:crypto';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { type Business, connectToDatabase, type Job, type MailJob, MailOutbox } from './db';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const from = process.env.MAIL_FROM;
const authUser = process.env.SMTP_USER;
const authPass = process.env.SMTP_PASSWORD;

export const mailerConfigured = Boolean(
  host && from && Number.isInteger(port) && port > 0 && port < 65536 && ((!authUser && !authPass) || (authUser && authPass))
);

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    if (!host || !from) throw new Error('Email is not configured.');
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      ...(authUser && authPass ? { auth: { user: authUser, pass: authPass } } : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

async function sendEmail(message: Omit<SendMailOptions, 'from'>): Promise<void> {
  if (!from) throw new Error('Email is not configured.');
  await getTransporter().sendMail({ ...message, from });
}

/** Queues the customer confirmation and staff notification for a new job. */
export async function queueBookingEmails(job: Job, business: Business): Promise<boolean> {
  const staffAddress = business.notificationEmail || business.owner?.email;
  if (!mailerConfigured || !staffAddress) return false;

  const businessName = business.name;
  const createdAt = new Date();
  const messages: MailJob[] = [
    {
      _id: randomUUID(),
      businessId: job.businessId,
      jobId: job._id,
      kind: 'customer-confirmation',
      to: job.email,
      subject: `${businessName}: we received your service request`,
      text: `Hello ${job.customer},\n\nWe received your request for ${job.service} on ${job.date}. Your reference is ${job._id}. The team will contact you to confirm the details.\n\n${businessName}`,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: createdAt,
      createdAt
    },
    {
      _id: randomUUID(),
      businessId: job.businessId,
      jobId: job._id,
      kind: 'staff-notification',
      to: staffAddress,
      subject: `New service request ${job._id} · ${job.customer}`,
      text: `A new service request needs review.\n\nReference: ${job._id}\nCustomer: ${job.customer}\nEmail: ${job.email}\nPhone: ${job.phone}\nService: ${job.service}\nPreferred date: ${job.date}\nNotes: ${job.notes || 'None'}`,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: createdAt,
      createdAt
    }
  ];

  try {
    await MailOutbox.insertMany(messages, { ordered: true });
    return true;
  } catch (error) {
    console.error('Could not queue booking notifications.', error instanceof Error ? error.name : 'unknown error');
    return false;
  }
}

export function countFailedMail(): Promise<number> {
  return MailOutbox.countDocuments({ state: 'failed' });
}

export function countPendingMail(): Promise<number> {
  return MailOutbox.countDocuments({ state: { $in: ['pending', 'processing'] } });
}

let processing = false;
/** Claims and delivers one due message; reschedules with backoff on failure. */
export async function processOutbox(): Promise<void> {
  if (processing || !mailerConfigured) return;
  processing = true;
  try {
    const now = new Date();
    const message = await MailOutbox.findOneAndUpdate(
      { $or: [{ state: 'pending', nextAttemptAt: { $lte: now } }, { state: 'processing', lockUntil: { $lte: now } }] },
      { $set: { state: 'processing', lockUntil: new Date(now.getTime() + 60000) } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    ).lean<MailJob>();
    if (!message) return;

    try {
      await sendEmail({ to: message.to, subject: message.subject, text: message.text, messageId: `<${message._id}@booktend>` });
      await MailOutbox.updateOne({ _id: message._id }, { $set: { state: 'sent', sentAt: new Date() }, $unset: { lockUntil: '', lastError: '' }, $inc: { attempts: 1 } });
    } catch (error) {
      const attempts = message.attempts + 1;
      const terminal = attempts >= 5;
      const delayMs = Math.min(60 * 60 * 1000, 60000 * 2 ** (attempts - 1));
      await MailOutbox.updateOne(
        { _id: message._id },
        {
          $set: { state: terminal ? 'failed' : 'pending', nextAttemptAt: new Date(Date.now() + delayMs), lastError: error instanceof Error ? error.name : 'Email delivery error' },
          $unset: { lockUntil: '' },
          $inc: { attempts: 1 }
        }
      );
      console.error(`Email delivery ${terminal ? 'failed' : 'will retry'} for ${message._id}.`);
    }
  } catch (error) {
    console.error('Email outbox worker error.', error instanceof Error ? error.name : 'unknown error');
  } finally {
    processing = false;
  }
}

// Start the outbox worker once per server process. Lives here (not in
// instrumentation.ts) so nodemailer only ever enters the Node-runtime bundle via
// the route handlers that import this module — never the Edge/instrumentation
// bundle, which cannot resolve nodemailer's `node:` built-ins.
function startOutboxWorker(): void {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!mailerConfigured) return;
  const globalForWorker = globalThis as unknown as { _booktendMailWorker?: NodeJS.Timeout };
  if (globalForWorker._booktendMailWorker) return;
  globalForWorker._booktendMailWorker = setInterval(() => {
    connectToDatabase()
      .then(() => processOutbox())
      .catch((error) => console.error('Mail worker tick failed.', error instanceof Error ? error.name : 'unknown error'));
  }, 10000);
}

startOutboxWorker();
