// Generate workflows/job-scout.json from the tested modules in src/.
// Usage: node scripts/build-workflow.js [--check]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'workflows', 'job-scout.json');

// Inline a module's source without its CommonJS export line.
function inline(name) {
  const src = fs.readFileSync(path.join(ROOT, 'src', `${name}.js`), 'utf8');
  return src.replace(/^module\.exports\s*=.*$/m, '').trim();
}

const CODE = {
  loadFeeds: `const fs = require('fs');
${inline('config')}

const text = fs.readFileSync('/data/config/feeds.txt', 'utf8');
const urls = parseFeedList(text);
if (!urls.length) throw new Error('No feeds configured in config/feeds.txt');
return urls.map((url) => ({ json: { url } }));`,

  normalize: `const fs = require('fs');
${inline('normalize')}

${inline('score')}

function hostOf(link) {
  const match = String(link || '').match(/^https?:\\/\\/([^/]+)/i);
  return match ? match[1] : '';
}

const model = $env.JOBSCOUT_MODEL || 'claude-haiku-4-5-20251001';
const maxOffers = parseInt($env.JOBSCOUT_MAX_OFFERS || '40', 10);
const profile = fs.readFileSync('/data/config/profile.md', 'utf8');
const template = fs.readFileSync('/data/prompts/score-offer.md', 'utf8').replace(/^<!--[\\s\\S]*?-->\\s*/, '');

const raw = $input.all().map((i) => i.json).filter((j) => j && !j.error && (j.title || j.link));
const offers = raw.map((r) => normalizeOffer(r, hostOf(r.link)));

const staticData = $getWorkflowStaticData('global');
const { fresh, seen } = dedupeOffers(offers, staticData.seen || {}, Date.now(), maxOffers);
staticData.seen = seen;

return fresh.map((offer) => ({
  json: { offer, requestBody: buildRequestBody(fillTemplate(template, profile, offer), model) },
}));`,

  parseScores: `${inline('score')}

const offers = $('Normalize & dedupe').all().map((i) => i.json.offer);
const staticData = $getWorkflowStaticData('global');

return $input.all().map((item, idx) => {
  const offer = offers[idx] || {};
  const result = parseScoreResponse(item.json);
  // Let failed offers be retried on the next run
  if (result.error && staticData.seen && offer.id) delete staticData.seen[offer.id];
  return { json: { ...offer, ...result } };
});`,

  digest: `${inline('digest')}

const minScore = parseInt($env.JOBSCOUT_MIN_SCORE || '70', 10);
const date = new Date().toISOString().slice(0, 10);
return [{ json: buildDigest($input.all().map((i) => i.json), minScore, date) }];`,
};

function codeNode(id, name, jsCode, position) {
  return { parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position };
}

function buildWorkflow() {
  const nodes = [
    {
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * *' }] } },
      id: 'a1b2c3d4-0001-4000-8000-000000000001',
      name: 'Every day 08:00',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
    },
    {
      parameters: {},
      id: 'a1b2c3d4-0002-4000-8000-000000000002',
      name: 'Run manually',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 200],
    },
    codeNode('a1b2c3d4-0003-4000-8000-000000000003', 'Load feeds', CODE.loadFeeds, [220, 100]),
    {
      parameters: { url: '={{ $json.url }}', options: {} },
      id: 'a1b2c3d4-0004-4000-8000-000000000004',
      name: 'Read RSS feeds',
      type: 'n8n-nodes-base.rssFeedRead',
      typeVersion: 1.1,
      position: [440, 100],
      onError: 'continueRegularOutput',
    },
    codeNode('a1b2c3d4-0005-4000-8000-000000000005', 'Normalize & dedupe', CODE.normalize, [660, 100]),
    {
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.requestBody) }}',
        options: { batching: { batch: { batchSize: 5, batchInterval: 1000 } } },
      },
      id: 'a1b2c3d4-0006-4000-8000-000000000006',
      name: 'Score with Claude',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [880, 100],
      onError: 'continueRegularOutput',
    },
    codeNode('a1b2c3d4-0007-4000-8000-000000000007', 'Parse scores', CODE.parseScores, [1100, 100]),
    codeNode('a1b2c3d4-0008-4000-8000-000000000008', 'Build digest', CODE.digest, [1320, 100]),
    {
      parameters: {
        chatId: '={{ $env.TELEGRAM_CHAT_ID }}',
        text: '={{ $json.text }}',
        additionalFields: { appendAttribution: false },
      },
      id: 'a1b2c3d4-0009-4000-8000-000000000009',
      name: 'Send Telegram digest',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1540, 100],
    },
  ];

  const link = (to) => ({ main: [[{ node: to, type: 'main', index: 0 }]] });
  const connections = {
    'Every day 08:00': link('Load feeds'),
    'Run manually': link('Load feeds'),
    'Load feeds': link('Read RSS feeds'),
    'Read RSS feeds': link('Normalize & dedupe'),
    'Normalize & dedupe': link('Score with Claude'),
    'Score with Claude': link('Parse scores'),
    'Parse scores': link('Build digest'),
    'Build digest': link('Send Telegram digest'),
  };

  return {
    name: 'n8n Job Scout',
    nodes,
    connections,
    settings: { executionOrder: 'v1', timezone: 'Europe/Madrid' },
    pinData: {},
    active: false,
    meta: { templateCredsSetupCompleted: false },
  };
}

function main() {
  const json = `${JSON.stringify(buildWorkflow(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== json) {
      console.error('workflows/job-scout.json is out of date. Run: npm run build');
      process.exit(1);
    }
    console.log('Workflow is up to date');
    return;
  }
  fs.writeFileSync(OUT, json);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) main();

module.exports = { buildWorkflow, CODE };
