import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Business, Businesses, connectToDatabase } from '../src/server/db';
import { hashPassword } from '../src/server/password';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const businessName = process.env.BUSINESS_NAME?.trim() || 'Oak & Alder';
const businessSlug = process.env.BUSINESS_SLUG?.trim().toLowerCase() || 'oak-and-alder';
const adminName = process.env.ADMIN_NAME?.trim() || 'Workspace owner';

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI || !email || !password) {
    console.error('Set MONGODB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD before running create-admin.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }
  if (password.length > 200 || !z.email().safeParse(email).success) {
    console.error('Use a valid email address and a password of 12 to 200 characters.');
    process.exit(1);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    console.error('BUSINESS_SLUG must contain lowercase letters, numbers, and single hyphens.');
    process.exit(1);
  }

  const mongoose = await connectToDatabase();
  try {
    await Businesses.createIndexes();
    const existing = await Businesses.findOne({ slug: businessSlug }).lean();
    if (existing?.owner) {
      console.error(`A workspace owner is already set up for ${businessSlug}.`);
      process.exitCode = 1;
      return;
    }
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const owner = { _id: randomUUID(), email, name: adminName, passwordHash, createdAt: now };
    if (existing) {
      await Businesses.updateOne({ _id: existing._id }, { $set: { owner, notificationEmail: email } });
    } else {
      const business: Business = {
        _id: randomUUID(),
        name: businessName,
        slug: businessSlug,
        timezone: process.env.BUSINESS_TIMEZONE || 'Africa/Lagos',
        owner,
        notificationEmail: email,
        createdAt: now
      };
      await Businesses.create(business);
    }
    console.log(`Owner account created for ${email} in ${businessName}.`);
  } finally {
    await mongoose.disconnect();
  }
}

void main();
