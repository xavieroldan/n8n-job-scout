const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDigest } = require('../src/digest');

const mk = (score, extra = {}) => ({
  title: `Role ${score}`, company: 'Acme', link: `https://x/${score}`, score,
  match_reasons: ['fit'], red_flags: [], remote_ok: true, error: false, ...extra,
});

test('buildDigest lists matches above threshold sorted by score', () => {
  const { text, count } = buildDigest([mk(60), mk(90), mk(75)], 70, '2026-10-06');
  assert.equal(count, 2);
  assert.ok(text.indexOf('[90]') < text.indexOf('[75]'));
  assert.ok(!text.includes('[60]'));
});

test('buildDigest reports when nothing matches and counts failures', () => {
  const { text, count } = buildDigest([mk(10), mk(0, { error: true })], 70, '2026-10-06');
  assert.equal(count, 0);
  assert.match(text, /No offers above the threshold/);
  assert.match(text, /1 offer\(s\) could not be scored/);
});

test('buildDigest stays under the Telegram limit', () => {
  const many = Array.from({ length: 200 }, (_, i) => mk(80, { title: 'X'.repeat(80) + i }));
  const { text } = buildDigest(many, 70, 'd');
  assert.ok(text.length <= 4000);
  assert.match(text, /more\./);
});
