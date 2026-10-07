// Build the Claude request for an offer and parse its structured answer.

const MAX_TOKENS = 400;

function fillTemplate(template, profile, offer) {
  const values = {
    PROFILE: profile,
    TITLE: offer.title,
    COMPANY: offer.company || 'Unknown',
    LOCATION: offer.location || 'Unknown',
    LINK: offer.link,
    DESCRIPTION: offer.description || 'No description',
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, (all, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : all);
}

function buildRequestBody(prompt, model) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  };
}

function clampScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Accepts the raw Anthropic Messages API response; never throws.
function parseScoreResponse(response) {
  const fallback = (reason) => ({
    score: 0, match_reasons: [], red_flags: [reason], seniority_fit: 'unknown', remote_ok: false, error: true,
  });
  if (!response || response.error) {
    return fallback(`API error: ${response && response.error ? JSON.stringify(response.error).slice(0, 200) : 'empty response'}`);
  }
  const block = Array.isArray(response.content) ? response.content.find((c) => c.type === 'text') : null;
  if (!block) return fallback('No text in model response');
  const text = block.text.trim();
  const jsonText = (text.match(/\{[\s\S]*\}/) || [''])[0];
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    return fallback('Model response was not valid JSON');
  }
  const list = (v) => (Array.isArray(v) ? v.map(String).slice(0, 3) : []);
  return {
    score: clampScore(data.score),
    match_reasons: list(data.match_reasons),
    red_flags: list(data.red_flags),
    seniority_fit: ['under', 'fit', 'over'].includes(data.seniority_fit) ? data.seniority_fit : 'unknown',
    remote_ok: data.remote_ok === true,
    error: false,
  };
}

module.exports = { fillTemplate, buildRequestBody, clampScore, parseScoreResponse };
