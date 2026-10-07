const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeedList } = require('../src/config');

test('parseFeedList ignores comments, blanks and non-URLs', () => {
  const text = '# comment\n\nhttps://a.example/rss\n  http://b.example/feed  \nnot-a-url\r\n';
  assert.deepEqual(parseFeedList(text), ['https://a.example/rss', 'http://b.example/feed']);
});

test('parseFeedList handles empty input', () => {
  assert.deepEqual(parseFeedList(undefined), []);
});
