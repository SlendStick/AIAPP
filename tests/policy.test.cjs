const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apiBase, webUrl, commandText } = require('../electron/policy.cjs');
test('API requires TLS except loopback', () => {
  assert.equal(apiBase('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(apiBase('http://localhost:11434/v1'), 'http://localhost:11434/v1');
  for (const x of ['http://example.com', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com?key=secret']) assert.throws(() => apiBase(x));
});
test('Chrome only receives web URLs', () => {
  assert.equal(webUrl('https://example.com'), 'https://example.com/');
  for (const x of ['javascript:alert(1)', 'file:///C:/Windows', '--remote-debugging-port=9222', 'https://user:pass@example.com']) assert.throws(() => webUrl(x));
});
test('command payload validation', () => {
  assert.equal(commandText('Get-Date'), 'Get-Date');
  for (const x of ['', null, 'a'.repeat(8001), '\0']) assert.throws(() => commandText(x));
});
