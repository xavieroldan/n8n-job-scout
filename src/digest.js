// Build the plain-text Telegram digest from scored offers.

const TELEGRAM_LIMIT = 4000;

function buildDigest(scored, minScore, dateLabel) {
  const matches = scored
    .filter((o) => !o.error && o.score >= minScore)
    .sort((a, b) => b.score - a.score);
  const failed = scored.filter((o) => o.error).length;

  const header = `Job Scout · ${dateLabel}\n${matches.length} match(es) >= ${minScore} out of ${scored.length} new offer(s)`;
  const footer = failed ? `\n\n${failed} offer(s) could not be scored.` : '';
  if (!matches.length) {
    return { text: `${header}\n\nNo offers above the threshold today.${footer}`, count: 0 };
  }

  let body = '';
  let shown = 0;
  for (const o of matches) {
    const company = o.company ? ` · ${o.company}` : '';
    const reasons = o.match_reasons.length ? `\n  + ${o.match_reasons.join('\n  + ')}` : '';
    const flags = o.red_flags.length ? `\n  - ${o.red_flags.join('\n  - ')}` : '';
    const entry = `\n\n[${o.score}] ${o.title}${company}${o.remote_ok ? ' · remote' : ''}\n${o.link}${reasons}${flags}`;
    if ((header + body + entry + footer).length > TELEGRAM_LIMIT) break;
    body += entry;
    shown += 1;
  }
  const more = shown < matches.length ? `\n\n…and ${matches.length - shown} more.` : '';
  return { text: header + body + more + footer, count: matches.length };
}

module.exports = { buildDigest };
