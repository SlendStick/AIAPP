const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Exercise IPC contracts without downloading Electron or granting OS access.
function harness({ response = 1, fetchImpl } = {}) {
  const handlers = new Map(); let window; let captures = 0;
  class Window {
    constructor() { this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} }; window = this; }
    loadFile() {}
  }
  const electron = {
    app: { whenReady: () => ({ then: fn => fn() }), setAppUserModelId() {}, on() {}, getPath: () => '/tmp' },
    BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showMessageBox: async () => ({ response }) },
    Notification: class { static isSupported() { return true; } show() {} },
    desktopCapturer: { getSources: async () => { captures++; return [{ thumbnail: { toDataURL: () => 'data:image/png;base64,test' } }]; } },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, webRequest: { onHeadersReceived() {} } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === './policy.cjs' ? require('../electron/policy.cjs') : require(name),
    __dirname: path.join(__dirname, '../electron'), process, AbortController, AbortSignal, setTimeout, clearTimeout,
    fetch: fetchImpl || (async () => { throw new Error('Unexpected network request'); })
  });
  return {
    call: (name, payload) => handlers.get(name)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, payload),
    handler: name => handlers.get(name), window: () => window, captures: () => captures
  };
}

test('native actions are denied until individually enabled', async () => {
  const h = harness();
  for (const [name, payload] of [['importFile'], ['screenshot'], ['command', 'Get-Date'], ['openChrome', 'https://example.com'], ['models', { base: 'https://example.com' }]]) {
    const r = await h.call(name, payload); assert.equal(r.ok, false, name); assert.match(r.error, /разрешение/);
  }
  assert.equal(h.captures(), 0);
});
test('IPC rejects other windows and subframes', async () => {
  const h = harness();
  await assert.rejects(h.handler('permissions')({ sender: {}, senderFrame: {} }, {}), /Недоверенный/);
  await assert.rejects(h.handler('permissions')({ sender: h.window().webContents, senderFrame: {} }, {}), /Недоверенный/);
});
test('denying a permission leaves it disabled', async () => {
  const h = harness({ response: 0 });
  assert.equal((await h.call('permissions', { screen: true })).ok, false);
  assert.equal((await h.call('screenshot')).ok, false);
  assert.equal(h.captures(), 0);
});
test('screenshots are returned as attachments, never uploaded implicitly', async () => {
  const h = harness();
  assert.equal((await h.call('permissions', { screen: true })).data.screen, true);
  const r = await h.call('screenshot');
  assert.equal(r.ok, true); assert.match(r.data.image, /^data:image/); assert.equal(h.captures(), 1);
  await h.call('permissions', { screen: false });
  assert.equal((await h.call('screenshot')).ok, false);
});
test('model request uses bearer auth and forbids redirects', async () => {
  let request;
  const h = harness({ fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ data: [{ id: 'model-b' }, { id: 'model-a' }] }) }; } });
  await h.call('permissions', { internet: true });
  const r = await h.call('models', { base: 'https://example.com/v1/', key: 'test-key' });
  assert.equal(r.ok, true); assert.deepEqual([...r.data], ['model-a', 'model-b']);
  assert.equal(request.url, 'https://example.com/v1/models');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.options.redirect, 'error');
});
test('API errors do not reflect server secrets into UI', async () => {
  const h = harness({ fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'private-provider-detail' }) });
  await h.call('permissions', { internet: true });
  const r = await h.call('models', { base: 'https://example.com/v1', key: 'test-key' });
  assert.equal(r.ok, false); assert.match(r.error, /401/); assert.doesNotMatch(r.error, /test-key|private-provider-detail/);
});
test('chat forwards only completion request and returns a text answer', async () => {
  let body;
  const h = harness({ fetchImpl: async (url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [{ message: { content: 'Ответ' } }] }) }; } });
  await h.call('permissions', { internet: true });
  const r = await h.call('chat', { config: { base: 'https://example.com/v1' }, model: 'example', messages: [{ role: 'user', content: 'Привет' }] });
  assert.equal(r.data, 'Ответ'); assert.equal(body.stream, false); assert.equal(body.model, 'example'); assert.equal(body.tools, undefined);
});
