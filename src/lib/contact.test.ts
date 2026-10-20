import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneHref, whatsappHref } from './contact';

test('phoneHref strips formatting and keeps a leading plus', () => {
  assert.equal(phoneHref('+234 801 555 0199'), 'tel:+2348015550199');
  assert.equal(phoneHref('+1 (555) 010-9999'), 'tel:+15550109999');
});

test('phoneHref leaves a locally written number local', () => {
  // Inventing a country code would dial the wrong person, so a local number stays
  // exactly the digits the customer wrote.
  assert.equal(phoneHref('0801 555 0200'), 'tel:08015550200');
  assert.equal(phoneHref('0801-555-0200'), 'tel:08015550200');
});

test('phoneHref survives junk instead of producing NaN or a broken href', () => {
  for (const value of ['', '   ', 'call me', '+']) {
    assert.match(phoneHref(value), /^tel:\+?\d*$/, `expected a dialable-shaped href for ${JSON.stringify(value)}`);
  }
});

test('whatsappHref builds a wa.me link for an international number', () => {
  assert.equal(whatsappHref('+234 801 555 0199'), 'https://wa.me/2348015550199');
  assert.equal(whatsappHref('+1 (555) 010-9999'), 'https://wa.me/15550109999');
});

test('whatsappHref refuses numbers that are not international', () => {
  // A local number would need a guessed country code, and a wa.me link built from
  // a guess messages a stranger.
  assert.equal(whatsappHref('0801 555 0200'), null);
  assert.equal(whatsappHref('8015550199'), null);
});

test('whatsappHref rejects implausible lengths', () => {
  assert.equal(whatsappHref('+1234567'), null, 'shorter than any E.164 number');
  assert.equal(whatsappHref('+1234567890123456'), null, 'longer than E.164 allows');
  assert.equal(whatsappHref(''), null);
  assert.equal(whatsappHref('   '), null);
  assert.equal(whatsappHref('+'), null);
});
