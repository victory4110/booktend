import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeCsvField, jobsToCsv } from './csv';
import type { Job } from './types';

test('escapeCsvField wraps strings in quotes and escapes internal quotes', () => {
  assert.equal(escapeCsvField('hello'), '"hello"');
  assert.equal(escapeCsvField('hello, world'), '"hello, world"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField(null), '""');
  assert.equal(escapeCsvField(undefined), '""');
  assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
});

test('jobsToCsv produces valid CSV with headers and row values', () => {
  const dummyJobs: Job[] = [
    {
      _id: 'JF-0001',
      businessId: 'biz-1',
      customer: 'Amara Okafor',
      email: 'amara@example.com',
      phone: '+1 555-0100',
      service: 'Deep Cleaning',
      date: '2026-10-15',
      status: 'New',
      notes: 'Front porch key under mat, please.',
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z'
    }
  ];

  const csv = jobsToCsv(dummyJobs);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Reference,Customer,Email,Phone,Service,Date,Status,Notes,Created At');
  assert.equal(
    lines[1],
    '"JF-0001","Amara Okafor","amara@example.com","+1 555-0100","Deep Cleaning","2026-10-15","New","Front porch key under mat, please.","2026-10-14T10:00:00.000Z"'
  );
});
