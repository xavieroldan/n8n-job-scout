// Turn raw RSS items into a common offer shape and drop already-seen offers.

const MAX_DESCRIPTION_CHARS = 3000;
const SEEN_TTL_DAYS = 30;

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonical id: link without query string, hash or trailing slash.
function offerId(link, title, company) {
  if (link) {
    return String(link).toLowerCase().split('#')[0].split('?')[0].replace(/\/+$/, '');
  }
  return `${String(company || '').toLowerCase()}|${String(title || '').toLowerCase()}`.trim();
}

// Many boards publish titles as "Company: Role".
function splitTitle(rawTitle) {
  const title = String(rawTitle || '').trim();
  const match = title.match(/^([^:]{2,60}):\s+(.+)$/);
  return match ? { company: match[1].trim(), title: match[2].trim() } : { company: '', title };
}

function normalizeOffer(raw, source) {
  const parts = splitTitle(raw.title);
  const company = String(raw.company || raw.creator || parts.company || '').trim();
  const title = parts.title;
  const link = String(raw.link || raw.guid || '').trim();
  const description = stripHtml(raw.content || raw['content:encoded'] || raw.contentSnippet || raw.description)
    .slice(0, MAX_DESCRIPTION_CHARS);
  const location = String(raw.location || raw.region || '').trim();
  return {
    id: offerId(link, title, company),
    title,
    company,
    location,
    link,
    description,
    source: source || '',
    publishedAt: raw.isoDate || raw.pubDate || '',
  };
}

// Returns fresh offers and the updated seen map ({ id: epochMs }), pruning old entries.
function dedupeOffers(offers, seen, nowMs, maxOffers) {
  const ttlMs = SEEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  const nextSeen = {};
  for (const [id, ts] of Object.entries(seen || {})) {
    if (nowMs - ts < ttlMs) nextSeen[id] = ts;
  }
  const fresh = [];
  for (const offer of offers) {
    if (!offer.id || !offer.title || nextSeen[offer.id]) continue;
    if (fresh.length >= maxOffers) break;
    nextSeen[offer.id] = nowMs;
    fresh.push(offer);
  }
  return { fresh, seen: nextSeen };
}

module.exports = { stripHtml, offerId, splitTitle, normalizeOffer, dedupeOffers };
