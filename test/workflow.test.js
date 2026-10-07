// Runs the exact jsCode embedded in each Code node with stubbed n8n globals.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { buildWorkflow, CODE } = require('../scripts/build-workflow');

const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'score-offer.md'), 'utf8');
const FILES = {
  '/data/config/feeds.txt': '# feeds\nhttps://board.example/rss\nhttps://other.example/feed\n',
  '/data/config/profile.md': 'Senior .NET developer, remote EU',
  '/data/prompts/score-offer.md': PROMPT,
};

function run(code, { input = [], env = {}, staticData = {}, nodes = {} } = {}) {
  const fakeFs = { readFileSync: (p) => { if (!(p in FILES)) throw new Error(`ENOENT ${p}`); return FILES[p]; } };
  const context = {
    require: (m) => { if (m === 'fs') return fakeFs; throw new Error(`module not allowed: ${m}`); },
    $input: { all: () => input.map((json) => ({ json })) },
    $env: env,
    $getWorkflowStaticData: () => staticData,
    $: (name) => ({ all: () => (nodes[name] || []).map((json) => ({ json })) }),
  };
  // Round-trip through JSON so results use this realm's prototypes
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function () {\n${code}\n})()`, context)));
}

test('every Code node compiles', () => {
  for (const node of buildWorkflow().nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new vm.Script(`(function () {\n${node.parameters.jsCode}\n})`), node.name);
  }
});

test('all connections point to existing nodes', () => {
  const wf = buildWorkflow();
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, conn] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), from);
    for (const target of conn.main.flat()) assert.ok(names.has(target.node), target.node);
  }
});

test('end-to-end: feeds -> normalize -> parse -> digest', () => {
  const feeds = run(CODE.loadFeeds);
  assert.deepEqual(feeds.map((i) => i.json.url), ['https://board.example/rss', 'https://other.example/feed']);

  const rssItems = [
    { title: 'Acme: Senior .NET Developer', link: 'https://board.example/job/1?utm=rss', content: '<p>Remote EU</p>' },
    { title: 'Junior PHP Dev', link: 'https://other.example/j/2', contentSnippet: 'On-site Madrid' },
    { error: { message: 'feed timeout' } },
  ];
  const staticData = { seen: { 'https://other.example/j/2': Date.now() } };
  const normalized = run(CODE.normalize, { input: rssItems, env: { JOBSCOUT_MAX_OFFERS: '10' }, staticData });
  assert.equal(normalized.length, 1, 'seen offer and errored feed are skipped');
  const { offer, requestBody } = normalized[0].json;
  assert.equal(offer.company, 'Acme');
  assert.equal(requestBody.model, 'claude-haiku-4-5-20251001');
  assert.match(requestBody.messages[0].content, /Senior \.NET developer, remote EU/);
  assert.ok(!requestBody.messages[0].content.includes('prompt-version'), 'version comment is stripped');
  assert.ok(staticData.seen['https://board.example/job/1']);

  const responses = [{ content: [{ type: 'text', text: '{"score": 88, "match_reasons": [".NET", "Remote"], "red_flags": [], "seniority_fit": "fit", "remote_ok": true}' }] }];
  const scored = run(CODE.parseScores, {
    input: responses, staticData, nodes: { 'Normalize & dedupe': normalized.map((i) => i.json) },
  });
  assert.equal(scored[0].json.score, 88);
  assert.equal(scored[0].json.title, 'Senior .NET Developer');

  const digest = run(CODE.digest, { input: scored.map((i) => i.json), env: { JOBSCOUT_MIN_SCORE: '70' } });
  assert.equal(digest[0].json.count, 1);
  assert.match(digest[0].json.text, /\[88\] Senior \.NET Developer · Acme · remote/);
});

test('failed scoring removes the offer from seen so it is retried', () => {
  const staticData = { seen: { 'https://x.example/a': 1 } };
  const scored = run(CODE.parseScores, {
    input: [{ error: { message: '529 overloaded' } }],
    staticData,
    nodes: { 'Normalize & dedupe': [{ offer: { id: 'https://x.example/a', title: 'A', link: 'https://x.example/a' } }] },
  });
  assert.equal(scored[0].json.error, true);
  assert.ok(!('https://x.example/a' in staticData.seen));
});
