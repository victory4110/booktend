import assert from 'node:assert/strict';
    import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';
    import mongoose from 'mongoose';
    import { Counters, connectToDatabase, Jobs, type Job } from './db';
    import { formatReference, filterPublicBusinesses, insertBooking, servicesFor } from './operations';
    import type { BookingInput } from './schemas';
    
    // Point at a throwaway database before the first connection is opened.
    process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
    process.env.MONGODB_DATABASE = `booktend_test_${process.pid}`;
    
    const BUSINESS_A = 'business-a';
    const BUSINESS_B = 'business-b';
    
    const input: BookingInput = {
      customer: 'Amara Okafor',
      email: 'amara@example.test',
      phone: '+2348000000000',
      service: 'Home cleaning',
      date: '2030-01-01',
      notes: ''
    };
    
    let connected = false;
    
    before(async () => {
      try {
        await connectToDatabase();
        connected = true;
      } catch {
        connected = false;
      }
    });
    
    after(async () => {
      if (!connected) return;
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    
    beforeEach(async () => {
      if (!connected) return;
      await Jobs.deleteMany({});
      await Counters.deleteMany({});
    });
    
    /** Skips a test when MongoDB is not reachable on this machine. */
    function needsMongo(t: TestContext): boolean {
      if (connected) return true;
      t.skip('MongoDB is not reachable, so the reference allocation tests are skipped.');
      return false;
    }
    
    async function seedLegacyJob(id: string, businessId: string): Promise<void> {
      const now = new Date();
      const job: Job = { _id: id, businessId, ...input, status: 'New', statusHistory: [], createdAt: now, updatedAt: now };
      await Jobs.create(job);
    }
    
    describe('formatReference', () => {
      test('pads to four digits and keeps counting past them', () => {
        assert.equal(formatReference(1), 'JF-0001');
        assert.equal(formatReference(9999), 'JF-9999');
        assert.equal(formatReference(10000), 'JF-10000');
      });
    });
    
    describe('servicesFor', () => {
      test('falls back to the shared defaults when a business has none', () => {
        assert.ok(servicesFor({}).includes('Home cleaning'));
        assert.deepEqual(servicesFor({ services: [] }), servicesFor({}));
      });
    
      test('uses the business list when it has one', () => {
        assert.deepEqual(servicesFor({ services: ['Gutter clearing'] }), ['Gutter clearing']);
      });
    });

    describe('filterPublicBusinesses', () => {
      const sample = [
        { name: 'Oak & Alder', slug: 'oak-and-alder', timezone: 'UTC', services: ['Gutter clearing', 'Window washing'] },
        { name: 'Victory Guest House', slug: 'victory-guest-house', timezone: 'Africa/Lagos', services: undefined }
      ];

      test('returns all businesses with resolved default services when query is empty', () => {
        const result = filterPublicBusinesses(sample);
        assert.equal(result.length, 2);
        assert.ok(result[1].services.includes('Plumbing'));
      });

      test('matches by service keyword or business name case-insensitively', () => {
        assert.equal(filterPublicBusinesses(sample, 'gutter').length, 1);
        assert.equal(filterPublicBusinesses(sample, 'gutter')[0].slug, 'oak-and-alder');
        assert.equal(filterPublicBusinesses(sample, 'plumbing').length, 1);
        assert.equal(filterPublicBusinesses(sample, 'plumbing')[0].slug, 'victory-guest-house');
        assert.equal(filterPublicBusinesses(sample, 'victory').length, 1);
      });

      test('narrows by exact service filter', () => {
        assert.equal(filterPublicBusinesses(sample, '', 'Window washing').length, 1);
        assert.equal(filterPublicBusinesses(sample, '', 'Nonexistent').length, 0);
      });

      test('excludes businesses that opted out of public listing', () => {
        const withUnlisted = [
          ...sample,
          { name: 'Private Co', slug: 'private-co', timezone: 'UTC', services: ['Plumbing'], publicListed: false }
        ];
        assert.equal(filterPublicBusinesses(withUnlisted).length, 2);
      });
    });
    
    describe('insertBooking', () => {
      test('numbers jobs across workspaces, not within them', async (t) => {
        if (!needsMongo(t)) return;
        await seedLegacyJob('JF-0001', BUSINESS_A);
    
        const first = await insertBooking(BUSINESS_A, input, 'owner-a');
        const second = await insertBooking(BUSINESS_B, input, 'owner-b');
    
        assert.equal(first._id, 'JF-0002');
        assert.equal(second._id, 'JF-0003');
        assert.notEqual(first._id, second._id, 'two workspaces must not share a reference');
        assert.equal(first.businessId, BUSINESS_A);
        assert.equal(second.businessId, BUSINESS_B);
        // The bug this replaced: a second workspace started its own count at 1 and
        // collided on the jobs primary key.
        assert.equal(await Jobs.countDocuments({ _id: 'JF-0002' }), 1);
      });
    
      test('keeps one shared counter document', async (t) => {
        if (!needsMongo(t)) return;
        await insertBooking(BUSINESS_A, input, 'owner-a');
        await insertBooking(BUSINESS_B, input, 'owner-b');
    
        const counters = await Counters.find({}).lean();
        assert.equal(counters.length, 1);
        assert.equal(counters[0]._id, 'job-reference');
        assert.equal(counters[0].value, 2);
      });
    
      test('seeds the counter above references that already exist', async (t) => {
        if (!needsMongo(t)) return;
        await seedLegacyJob('JF-0005', BUSINESS_A);
        await seedLegacyJob('JF-0042', BUSINESS_B);
    
        const job = await insertBooking(BUSINESS_A, input, 'owner-a');
        assert.equal(job._id, 'JF-0043', 'a new workspace must not reissue an existing reference');
      });
    
      test('recovers when the counter points at a reference already in use', async (t) => {
        if (!needsMongo(t)) return;
        await seedLegacyJob('JF-0001', BUSINESS_A);
        await seedLegacyJob('JF-0002', BUSINESS_B);
        // A restored database can leave the counter behind the collection, so the
        // next number it hands out is already taken.
        await Counters.create({ _id: 'job-reference', value: 0 });
    
        const job = await insertBooking(BUSINESS_A, input, 'owner-a');
        assert.equal(job._id, 'JF-0003', 'the taken reference must not be reused');
        assert.equal(await Jobs.countDocuments({ _id: 'JF-0001' }), 1);
        assert.equal(await Jobs.countDocuments({}), 3);
        const counter = await Counters.findById('job-reference').lean();
        assert.equal(counter?.value, 3);
      });
    
      test('never issues the same reference twice', async (t) => {
        if (!needsMongo(t)) return;
        // Two workspaces booking alternately must not collide on the shared key.
        const ids: string[] = [];
        for (let index = 0; index < 6; index += 1) {
          const businessId = index % 2 === 0 ? BUSINESS_A : BUSINESS_B;
          ids.push((await insertBooking(businessId, input, 'actor'))._id);
        }
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(await Jobs.countDocuments({}), 6);
      });
    
      test('records the first status and who created it', async (t) => {
        if (!needsMongo(t)) return;
        const job = await insertBooking(BUSINESS_A, input, 'owner-a');
    
        assert.equal(job.status, 'New');
        assert.equal(job.statusHistory.length, 1);
        assert.equal(job.statusHistory[0].status, 'New');
        assert.equal(job.statusHistory[0].changedBy, 'owner-a');
        assert.equal(job.customer, input.customer);
      });
    
      test('gives every job a reference that parses as JF- plus digits', async (t) => {
        if (!needsMongo(t)) return;
        const ids: string[] = [];
        for (let index = 0; index < 5; index += 1) {
          ids.push((await insertBooking(BUSINESS_A, input, 'owner-a'))._id);
        }
        assert.deepEqual(ids, ['JF-0001', 'JF-0002', 'JF-0003', 'JF-0004', 'JF-0005']);
        for (const id of ids) assert.match(id, /^JF-\d{4,}$/);
      });
    });
    