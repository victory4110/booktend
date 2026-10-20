import assert from 'node:assert/strict';
    import test from 'node:test';
    import { decodeJobCursor, encodeJobCursor, JOB_SORT, jobCursorFilter } from './cursor';
    
    const job = { _id: 'JF-0007', createdAt: new Date('2026-10-13T09:00:00.000Z') };
    
    test('a cursor round-trips the created time and id', () => {
      const cursor = decodeJobCursor(encodeJobCursor(job));
      assert.ok(cursor);
      assert.equal(cursor.id, 'JF-0007');
      assert.equal(cursor.createdAt.toISOString(), '2026-10-13T09:00:00.000Z');
    });
    
    test('cursors are opaque, not raw ids', () => {
      const encoded = encodeJobCursor(job);
      assert.ok(!encoded.includes('JF-0007'));
      assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    });
    
    test('malformed cursors decode to null instead of throwing', () => {
      for (const value of ['', 'JF-0007', 'not-a-cursor', Buffer.from('nope').toString('base64url'), Buffer.from('|JF-1').toString('base64url'), Buffer.from('2026-10-13T09:00:00.000Z|').toString('base64url')]) {
        assert.equal(decodeJobCursor(value), null, `expected null for ${JSON.stringify(value)}`);
      }
    });
    
    test('a cursor with an unparsable date decodes to null', () => {
      assert.equal(decodeJobCursor(Buffer.from('whenever|JF-0007').toString('base64url')), null);
    });
    
    test('the filter selects strictly older jobs, then lower ids at the same instant', () => {
      const cursor = { createdAt: new Date('2026-10-13T09:00:00.000Z'), id: 'JF-0007' };
      assert.deepEqual(jobCursorFilter(cursor), {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: 'JF-0007' } }
        ]
      });
    });
    
    test('the sort order matches the cursor fields', () => {
      assert.deepEqual(JOB_SORT, { createdAt: -1, _id: -1 });
    });
    
    // The bug this cursor replaced: string ids are not numerically ordered, so
    // paging on the id alone skips and repeats rows past JF-9999.
    test('id ordering differs from numeric ordering past four digits', () => {
      assert.ok('JF-10000' < 'JF-9999');
      const older = { _id: 'JF-9999', createdAt: new Date('2026-10-13T09:00:00.000Z') };
      const newer = { _id: 'JF-10000', createdAt: new Date('2026-10-13T10:00:00.000Z') };
      assert.notEqual(encodeJobCursor(newer), encodeJobCursor(older));
    });
    