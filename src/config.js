// Parse the feeds file: one URL per line, ignoring blanks and comments.
function parseFeedList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => /^https?:\/\//i.test(line));
}

module.exports = { parseFeedList };
