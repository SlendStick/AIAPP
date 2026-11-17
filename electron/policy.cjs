const MAX_FILE_BYTES = 2 * 1024 * 1024;
function apiBase(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API требует HTTPS. HTTP разрешён только для локального сервера.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Укажите базовый URL без пароля, параметров и фрагмента.');
  return url.href.replace(/\/$/, '');
}
function webUrl(input) {
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Разрешены только веб-ссылки HTTP/HTTPS без учётных данных.');
  return u.href;
}
function commandText(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 8000 || input.includes('\0')) throw new Error('Введите команду длиной до 8000 символов.');
  return input;
}
module.exports = { apiBase, webUrl, commandText, MAX_FILE_BYTES };
