const test = require('node:test');
const assert = require('node:assert/strict');
const { stripHtml, offerId, splitTitle, normalizeOffer, dedupeOffers } = require('../src/normalize');

test('stripHtml removes tags, scripts and entities', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b> &amp; co</p><script>x()</script>'), 'Hello world & co');
});

test('offerId canonicalises links', () => {
  assert.equal(offerId('https://Example.com/job/1/?utm=x#top'), 'https://example.com/job/1');
  assert.equal(offerId('', 'Dev', 'Acme'), 'acme|dev');
});

test('splitTitle extracts "Company: Role"', () => {
  assert.deepEqual(splitTitle('Acme Corp: Senior .NET Developer'), { company: 'Acme Corp', title: 'Senior .NET Developer' });
  assert.deepEqual(splitTitle('Senior Java Engineer'), { company: '', title: 'Senior Java Engineer' });
});

test('normalizeOffer builds the common shape', () => {
  const offer = normalizeOffer({
    title: 'Acme: Team Lead', link: 'https://x.dev/j/9?ref=rss', content: '<p>Remote EU</p>', isoDate: '2026-10-01T00:00:00Z',
  }, 'https://x.dev/rss');
  assert.equal(offer.id, 'https://x.dev/j/9');
  assert.equal(offer.company, 'Acme');
  assert.equal(offer.title, 'Team Lead');
  assert.equal(offer.description, 'Remote EU');
  assert.equal(offer.source, 'https://x.dev/rss');
});

test('dedupeOffers skips seen ids, prunes old entries and respects the limit', () => {
  const now = Date.UTC(2026, 9, 6);
  const day = 24 * 60 * 60 * 1000;
  const seen = { a: now - day, old: now - 40 * day };
  const offers = [
    { id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'b', title: 'B dup' },
    { id: 'c', title: 'C' }, { id: 'd', title: 'D' },
  ];
  const { fresh, seen: next } = dedupeOffers(offers, seen, now, 2);
  assert.deepEqual(fresh.map((o) => o.id), ['b', 'c']);
  assert.ok(!('old' in next));
  assert.equal(next.b, now);
  assert.ok(!('d' in next), 'offers over the limit stay unseen for the next run');
});
