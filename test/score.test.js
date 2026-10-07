const test = require('node:test');
const assert = require('node:assert/strict');
const { fillTemplate, buildRequestBody, clampScore, parseScoreResponse } = require('../src/score');

const offer = { title: 'Dev', company: '', location: '', link: 'https://x', description: '' };

test('fillTemplate replaces known placeholders and keeps unknown ones', () => {
  const out = fillTemplate('{{PROFILE}}|{{TITLE}}|{{COMPANY}}|{{OTHER}}', 'me', offer);
  assert.equal(out, 'me|Dev|Unknown|{{OTHER}}');
});

test('buildRequestBody targets the Messages API shape', () => {
  const body = buildRequestBody('hi', 'claude-haiku-4-5-20251001');
  assert.equal(body.model, 'claude-haiku-4-5-20251001');
  assert.equal(body.messages[0].content, 'hi');
  assert.equal(body.temperature, 0);
});

test('clampScore bounds and rounds', () => {
  assert.equal(clampScore(120), 100);
  assert.equal(clampScore(-3), 0);
  assert.equal(clampScore('71.6'), 72);
  assert.equal(clampScore('x'), 0);
});

test('parseScoreResponse reads valid JSON, even wrapped in text', () => {
  const res = { content: [{ type: 'text', text: 'Here:\n{"score": 82, "match_reasons": ["a","b","c","d"], "red_flags": [], "seniority_fit": "fit", "remote_ok": true}' }] };
  const parsed = parseScoreResponse(res);
  assert.equal(parsed.score, 82);
  assert.equal(parsed.match_reasons.length, 3);
  assert.equal(parsed.remote_ok, true);
  assert.equal(parsed.error, false);
});

test('parseScoreResponse never throws on bad input', () => {
  assert.equal(parseScoreResponse(null).error, true);
  assert.equal(parseScoreResponse({ error: { message: 'rate limit' } }).error, true);
  assert.equal(parseScoreResponse({ content: [{ type: 'text', text: 'not json' }] }).error, true);
  assert.equal(parseScoreResponse({ content: [{ type: 'text', text: '{"score":50,"seniority_fit":"weird"}' }] }).seniority_fit, 'unknown');
});
