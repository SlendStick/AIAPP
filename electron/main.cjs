const { app, BrowserWindow, ipcMain, dialog, Notification, desktopCapturer, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { apiBase, webUrl, commandText, MAX_FILE_BYTES } = require('./policy.cjs');
let win;
let permissions = { files: false, screen: false, microphone: false, commands: false, internet: false, notifications: true };
let activeRequest;
async function confirm(title, message, detail = '') {
  const result = await dialog.showMessageBox(win, { type: 'question', title, message, detail, buttons: ['Отмена', 'Разрешить один раз'], defaultId: 0, cancelId: 0, noLink: true });
  if (result.response !== 1) throw new Error('Действие отменено.');
}
function requirePermission(name) { if (!permissions[name]) throw new Error('Сначала включите разрешение в панели доступа: ' + name); }
function handle(name, fn) {
  ipcMain.handle(name, async (event, payload) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Недоверенный источник.');
    try { return { ok: true, data: await fn(payload) }; } catch (error) { return { ok: false, error: error.message }; }
  });
}
async function api(config, route, body, signal) {
  requirePermission('internet');
  const base = apiBase(config.base);
  const res = await fetch(`${base}/${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: signal || AbortSignal.timeout(30000), redirect: 'error' });
  if (!res.ok) throw new Error(`API вернул HTTP ${res.status}. Проверьте URL, ключ и баланс провайдера.`);
  return res.json();
}
app.whenReady().then(() => {
  app.setAppUserModelId('app.orbit.workspace');
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const allowed = contents === win?.webContents && permission === 'media' && permissions.microphone && details.mediaTypes?.every(t => t === 'audio');
    callback(Boolean(allowed));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => Boolean(contents === win?.webContents && permission === 'media' && permissions.microphone && details.mediaType === 'audio'));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'"] } }));
  win = new BrowserWindow({ width: 1480, height: 960, minWidth: 960, minHeight: 680, backgroundColor: '#101114', autoHideMenuBar: true, title: 'Orbit AI', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  handle('permissions', async next => {
    for (const key of Object.keys(permissions)) {
      if (typeof next?.[key] !== 'boolean' || next[key] === permissions[key]) continue;
      if (next[key]) await confirm('Разрешение доступа', `Включить: ${key}?`, 'Доступ действует только до закрытия приложения. Файлы, экран и команды требуют дополнительного подтверждения.');
      permissions[key] = next[key];
    }
    return permissions;
  });
  handle('models', async config => (await api(config, 'models')).data.map(m => m.id).filter(x => typeof x === 'string').sort());
  handle('chat', async ({ config, model, messages }) => {
    if (activeRequest) throw new Error('Дождитесь завершения текущего запроса.');
    if (!model || !Array.isArray(messages) || JSON.stringify(messages).length > 12e6) throw new Error('Некорректный или слишком большой запрос.');
    const controller = new AbortController(); activeRequest = controller;
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const data = await api(config, 'chat/completions', { model, messages, stream: false }, controller.signal);
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new Error('Провайдер не вернул текстовый ответ.');
      return text;
    } finally { clearTimeout(timer); activeRequest = null; }
  });
  handle('cancel', () => activeRequest?.abort());
  handle('importFile', async () => {
    requirePermission('files');
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Выберите текстовый файл для отправки модели', properties: ['openFile'], filters: [{ name: 'Текст и код', extensions: ['txt', 'md', 'json', 'csv', 'js', 'ts', 'py', 'html', 'css', 'log'] }] });
    if (canceled) return null;
    const stat = await fs.stat(filePaths[0]);
    if (stat.size > MAX_FILE_BYTES) throw new Error('Максимальный размер файла — 2 МБ.');
    return { name: path.basename(filePaths[0]), text: await fs.readFile(filePaths[0], 'utf8') };
  });
  handle('saveFile', async ({ name, text }) => {
    requirePermission('files');
    if (typeof text !== 'string' || text.length > 12e6) throw new Error('Некорректный файл.');
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.basename(name || 'orbit-export.md') });
    if (canceled) return false;
    await fs.writeFile(filePath, text, 'utf8'); return true;
  });
  handle('notify', ({ title, body }) => {
    requirePermission('notifications');
    if (!Notification.isSupported()) throw new Error('Уведомления недоступны в этой системе.');
    new Notification({ title: String(title).slice(0, 100), body: String(body).slice(0, 300) }).show(); return true;
  });
  handle('screenshot', async () => {
    requirePermission('screen');
    await confirm('Снимок экрана', 'Снять первый доступный экран?', 'Снимок появится во вложениях. Он уйдёт провайдеру только после нажатия «Отправить». Уберите с экрана пароли и другие секреты.');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (!sources.length) throw new Error('Не удалось получить экран.');
    return { name: 'screen.png', image: sources[0].thumbnail.toDataURL() };
  });
  handle('command', async input => {
    requirePermission('commands'); const command = commandText(input);
    if (process.platform !== 'win32') throw new Error('Выполнение команд доступно только в Windows-приложении.');
    await confirm('Выполнение PowerShell', 'Выполнить команду с вашими правами?', command + '\n\nКоманда может изменять или удалять файлы. Запускайте только понятные вам команды.');
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, cwd: app.getPath('home'), env: process.env });
      let output = ''; let truncated = false;
      const append = data => { if (output.length < 100000) output += data.toString().slice(0, 100000 - output.length); else truncated = true; };
      child.stdout.on('data', append); child.stderr.on('data', append);
      const timer = setTimeout(() => { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); }, 60000);
      child.on('error', err => { clearTimeout(timer); reject(err); });
      child.on('close', code => { clearTimeout(timer); resolve({ code, output: output + (truncated ? '\n[Вывод обрезан]' : '') }); });
    });
  });
  handle('openChrome', async input => {
    requirePermission('internet'); const url = webUrl(input);
    if (process.platform !== 'win32') throw new Error('Запуск Chrome доступен в Windows-приложении.');
    await confirm('Google Chrome', 'Открыть страницу в Chrome?', url);
    const candidates = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).map(p => path.join(p, 'Google/Chrome/Application/chrome.exe'));
    for (const exe of candidates) {
      try { await fs.access(exe); } catch { continue; }
      await new Promise((resolve, reject) => { const child = spawn(exe, [url], { detached: true, stdio: 'ignore' }); child.on('error', reject); child.on('spawn', () => { child.unref(); resolve(); }); });
      return true;
    }
    throw new Error('Chrome не найден. Установите его с официального сайта Google.');
  });
});
app.on('window-all-closed', () => { activeRequest?.abort(); app.quit(); });
