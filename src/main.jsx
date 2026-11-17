import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Orbit, Plus, Search, MessageSquare, SlidersHorizontal, ArrowUpRight, ChevronDown, ArrowUp, Paperclip, Mic, Monitor, Globe, FolderOpen, Terminal, Bell, ShieldCheck, X, Check, Settings2, Square, Download, Copy, Sparkles, Code2, Brain, PanelRightClose, ExternalLink, LoaderCircle, Trash2, Clock3, Command, LockKeyhole } from 'lucide-react';
import './styles.css';
const desktop = Boolean(window.desktop);
const initialPermissions = { files: false, screen: false, microphone: false, commands: false, internet: false, notifications: true };
const accessItems = [
  ['files', FolderOpen, 'Файлы и папки', 'Только выбранные вами файлы'],
  ['internet', Globe, 'Интернет', 'API моделей и Google Chrome'],
  ['screen', Monitor, 'Снимки экрана', 'Однократный захват экрана'],
  ['microphone', Mic, 'Микрофон', 'Запись только по нажатию'],
  ['commands', Terminal, 'Команды на ПК', 'С подтверждением каждого запуска'],
  ['notifications', Bell, 'Уведомления', 'Когда ответ будет готов']
];
const modes = [{ id: 'chat', label: 'Ассистент', icon: Sparkles, prompt: 'Ты полезный ассистент. Отвечай на русском. Не утверждай, что выполнил действия на ПК: у тебя нет автоматических инструментов.' }, { id: 'code', label: 'Код', icon: Code2, prompt: 'Ты помощник программиста. Отвечай на русском, давай проверяемый код. Команды выполняются пользователем отдельно; не утверждай, что выполнил их.' }, { id: 'analysis', label: 'Анализ', icon: Brain, prompt: 'Ты аналитик. Отвечай на русском, разделяй факты, предположения и выводы. Не выдумывай доступ к интернету или инструментам.' }];
function loadChats() { try { return JSON.parse(localStorage.getItem('orbit.chats') || '[]').filter(c => c.id && Array.isArray(c.messages)); } catch { return []; } }
async function native(name, payload) { if (!desktop) throw new Error('Эта функция доступна в установленном Windows-приложении. Веб-версия — предварительный просмотр.'); const result = await window.desktop[name](payload); if (!result.ok) throw new Error(result.error); return result.data; }
function App() {
  const [chats, setChats] = useState(loadChats), [current, setCurrent] = useState(null);
  const [input, setInput] = useState(''), [mode, setMode] = useState('chat'), [attachments, setAttachments] = useState([]);
  const [permissions, setPermissions] = useState(initialPermissions), [panel, setPanel] = useState(true);
  const [modal, setModal] = useState(null), [toast, setToast] = useState(''), [search, setSearch] = useState('');
  const [config, setConfig] = useState({ base: 'https://api.openai.com/v1', key: '' }), [model, setModel] = useState(''), [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false), [loadingModels, setLoadingModels] = useState(false), [recording, setRecording] = useState(false);
  const [command, setCommand] = useState('Get-Date'), [commandResult, setCommandResult] = useState(''), [running, setRunning] = useState(false), [url, setUrl] = useState('https://www.google.com');
  const [activity, setActivity] = useState([]); const recorder = useRef(null), bottom = useRef(null);
  const selected = chats.find(c => c.id === current); const messages = selected?.messages || [];
  useEffect(() => { try { localStorage.setItem('orbit.chats', JSON.stringify(chats)); } catch { setToast('История не сохранена: хранилище браузера заполнено. Экспортируйте диалог.'); } }, [chats]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, busy]);
  useEffect(() => () => { recorder.current?.stream?.getTracks().forEach(t => t.stop()); }, []);
  const log = text => setActivity(a => [{ text, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) }, ...a].slice(0, 20));
  async function action(fn) { try { await fn(); } catch (err) { setToast(err.message); } }
  function newChat() { if (busy) return; setCurrent(null); setInput(''); setAttachments([]); }
  async function togglePermission(key) {
    if (key === 'microphone' && recording) recorder.current?.stop();
    if (!desktop) { setToast('Разрешения ПК можно включить только в Windows-приложении.'); return; }
    await action(async () => { const p = await native('permissions', { [key]: !permissions[key] }); setPermissions(p); log(`${accessItems.find(x => x[0] === key)[2]}: ${p[key] ? 'разрешено' : 'отключено'}`); });
  }
  async function fetchModels() { setLoadingModels(true); await action(async () => { const list = await native('models', config); setModels(list); if (!list.includes(model)) setModel(list[0] || ''); setToast(`Получено моделей: ${list.length}`); log('Загружен список моделей'); }); setLoadingModels(false); }
  async function send() {
    if ((!input.trim() && !attachments.length) || busy) return;
    if (!desktop || !model || !permissions.internet) { setModal('settings'); setToast(!desktop ? 'Для реальных запросов установите Windows-приложение.' : 'Включите интернет и настройте модель.'); return; }
    const text = input.trim(); const id = current || crypto.randomUUID();
    const parts = [{ type: 'text', text: text + attachments.filter(a => a.text !== undefined).map(a => `\n\nФайл: ${a.name}\n${a.text}`).join('') }];
    attachments.filter(a => a.image).forEach(a => parts.push({ type: 'image_url', image_url: { url: a.image } }));
    const user = { role: 'user', content: parts.length > 1 ? parts : parts[0].text, display: text || 'Посмотри вложения', files: attachments.map(a => a.name) };
    const next = [...messages, user];
    setChats(cs => current ? cs.map(c => c.id === id ? { ...c, messages: next } : c) : [{ id, title: text.slice(0, 42) || 'Работа с файлами', messages: next }, ...cs]);
    setCurrent(id); setInput(''); setAttachments([]); setBusy(true);
    try {
      const answer = await native('chat', { config, model, messages: [{ role: 'system', content: modes.find(m => m.id === mode).prompt }, ...next.filter(m => !m.error).map(({ role, content }) => ({ role, content }))] });
      setChats(cs => cs.map(c => c.id === id ? { ...c, messages: [...c.messages, { role: 'assistant', content: answer, model }] } : c));
      log('Ответ модели получен');
      if (permissions.notifications) await native('notify', { title: 'Orbit AI • Ответ готов', body: 'Вернитесь к диалогу, чтобы прочитать ответ.' }).catch(() => {});
    } catch (err) { setChats(cs => cs.map(c => c.id === id ? { ...c, messages: [...c.messages, { role: 'assistant', content: err.message, error: true }] } : c)); log('Запрос остановлен или завершился ошибкой'); }
    finally { setBusy(false); }
  }
  async function importFile() { await action(async () => { if (attachments.length >= 4) throw new Error('Не более четырёх вложений за запрос.'); const f = await native('importFile'); if (f) { setAttachments(a => [...a, f]); log(`Выбран файл: ${f.name}`); } }); }
  async function screenshot() { await action(async () => { if (attachments.length >= 4) throw new Error('Не более четырёх вложений.'); const f = await native('screenshot'); setAttachments(a => [...a, f]); log('Снимок добавлен, ещё не отправлен'); }); }
  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    await action(async () => {
      if (!desktop || !permissions.microphone) throw new Error('Включите доступ к микрофону в Windows-приложении.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      let media;
      try { media = new MediaRecorder(stream); } catch (err) { stream.getTracks().forEach(t => t.stop()); throw err; }
      const chunks = []; recorder.current = media;
      media.ondataavailable = e => chunks.push(e.data);
      media.onstop = () => { clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); setRecording(false); const blob = new Blob(chunks, { type: media.mimeType }); downloadBlob(blob, `orbit-recording.${media.mimeType.includes('ogg') ? 'ogg' : 'webm'}`); log('Аудиозапись сохранена локально'); setToast('Запись сохранена. Она не отправляется модели; распознавание речи пока не подключено.'); };
      media.start(); setRecording(true); const timer = setTimeout(() => media.stop(), 120000);
    });
  }
  function downloadBlob(blob, name) { const link = document.createElement('a'), objectUrl = URL.createObjectURL(blob); link.href = objectUrl; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
  async function exportChat() { const text = messages.map(m => `## ${m.role === 'user' ? 'Вы' : 'Orbit AI'}\n\n${typeof m.content === 'string' ? m.content : m.display}\n`).join('\n'); if (!text) return setToast('Сначала начните диалог.'); await action(async () => { if (desktop) { if (await native('saveFile', { name: 'orbit-dialog.md', text })) setToast('Диалог сохранён'); } else downloadBlob(new Blob([text], { type: 'text/markdown' }), 'orbit-dialog.md'); }); }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); newChat(); }}><span className="brand-icon"><Orbit size={25}/></span><span>orbit<span className="brand-ai"> ai</span></span><span className="beta">BETA</span></a>
      <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={17}/>Новый диалог<span>＋</span></button>
      <label className="search"><Search size={16}/><input placeholder="Поиск диалогов" value={search} onChange={e => setSearch(e.target.value)}/><span>⌕</span></label>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <button className="nav-item active" onClick={() => setModal(null)}><MessageSquare size={18}/>Диалоги<span className="nav-count">{chats.length}</span></button>
      <button className="nav-item" onClick={() => setModal('settings')}><SlidersHorizontal size={18}/>Модели и подключения<ArrowUpRight size={14} className="muted-icon"/></button>
      <button className="nav-item" onClick={() => setModal('files')}><FolderOpen size={18}/>Мои файлы</button>
      <div className="history-head"><span className="nav-label">ИСТОРИЯ ДИАЛОГОВ</span><Clock3 size={13}/></div>
      <div className="history">
        {chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).map(c => <div className={`history-row ${current === c.id ? 'selected' : ''}`} key={c.id}><button disabled={busy} onClick={() => { setCurrent(c.id); setAttachments([]); }}><MessageSquare size={14}/><span>{c.title}</span></button><button className="delete" disabled={busy} title="Удалить диалог" onClick={() => { if (confirm('Удалить этот диалог из локальной истории?')) { setChats(cs => cs.filter(x => x.id !== c.id)); if (c.id === current) setCurrent(null); } }}><Trash2 size={13}/></button></div>)}
        {!chats.length && <div className="empty-history">Здесь появятся ваши диалоги.<br/>Всё важное — под рукой.</div>}
        {chats.length > 0 && !chats.some(c => c.title.toLowerCase().includes(search.toLowerCase())) && <div className="empty-history">Ничего не найдено</div>}
      </div>
      <div className="local-card"><span className="local-dot"/><div><strong>Ваше пространство</strong><p>История хранится на устройстве</p></div><LockKeyhole size={15}/></div>
      <button className="profile" onClick={() => setModal('about')}><span className="avatar">Я</span><span><strong>Личное пространство</strong><small>Orbit AI · Windows edition</small></span><Settings2 size={17}/></button>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb">Рабочее пространство<span>/</span><strong>{selected ? 'Диалог' : 'Новый диалог'}</strong></div><div className="header-actions"><span className="preview-badge"><span/>{desktop ? 'На вашем ПК' : 'Веб-превью'}</span><button title="Экспорт диалога" className="icon-button" onClick={exportChat}><Download size={17}/></button><div className="divider"/><button title="Панель доступа" className={`icon-button ${panel ? 'on' : ''}`} onClick={() => setPanel(!panel)}><PanelRightClose size={18}/></button></div></header>
      <div className="chat-top"><button className="model-picker" onClick={() => setModal('settings')}><span className="model-symbol"><Orbit size={17}/></span>{model || 'Выбрать модель'}<ChevronDown size={14}/></button><span className="session-label"><span/>{busy ? 'Готовим ответ' : 'Новый взгляд на привычные задачи'}</span></div>
      <section className={`chat-body ${messages.length ? 'has-messages' : ''}`}>
        {!messages.length ? <div className="welcome">
          <div className="welcome-orbit"><Orbit size={44} strokeWidth={1.25}/><span className="orbit-spark">✦</span></div>
          <div className="eyebrow">ВАШ ИНТЕЛЛЕКТУАЛЬНЫЙ ПОМОЩНИК</div>
          <h1>Меньше рутины.<br/><span>Больше возможностей.</span></h1>
          <p className="welcome-description">Идеи, файлы, код и задачи на компьютере —<br/>в одном пространстве, под вашим контролем.</p>
          <div className="suggestions">
            {[ [FolderOpen, 'Разобраться в файлах', 'Найти главное и навести порядок', 'Помоги составить безопасный план организации файлов в папке «Загрузки».', 'green'], [Code2, 'Написать код', 'От идеи до рабочего решения', 'Помоги написать Python-скрипт для поиска дубликатов файлов без их удаления.', 'purple'], [Globe, 'Исследовать тему', 'Структурировать и сравнить идеи', 'Сравни локальные и облачные нейросети: приватность, стоимость и возможности.', 'blue'], [Terminal, 'Помочь с компьютером', 'Автоматизировать привычные задачи', 'Предложи безопасные команды PowerShell для просмотра информации о моём ПК. Объясни каждую.', 'orange'] ].map(([Icon, title, desc, prompt, color]) => <button className="suggestion" key={title} onClick={() => { setInput(prompt); if (color === 'purple') setMode('code'); }}><div><span className={`tile-icon ${color}`}><Icon size={19}/></span><ArrowUpRight size={15}/></div><strong>{title}</strong><small>{desc}</small></button>)}
          </div>
          <div className="welcome-note"><ShieldCheck size={14}/>Вы решаете, к чему у AI есть доступ</div>
        </div> : <div className="message-list">{messages.map((m, i) => <article key={i} className={`message ${m.role} ${m.error ? 'error' : ''}`}><div className="message-avatar">{m.role === 'user' ? 'Я' : <Orbit size={20}/>}</div><div className="message-content"><div className="message-heading"><strong>{m.role === 'user' ? 'Вы' : 'Orbit AI'}</strong><span>{m.model || (m.error ? 'Не удалось получить ответ' : '')}</span></div><div className="message-text">{m.display || m.content}</div>{m.files?.length > 0 && <div className="message-files">{m.files.map((f, j) => <span key={j}><Paperclip size={12}/>{f}</span>)}</div>}{m.role === 'assistant' && !m.error && <button className="copy-button" onClick={() => action(async () => { await navigator.clipboard.writeText(m.content); setToast('Ответ скопирован'); })}><Copy size={13}/>Копировать</button>}</div></article>)}{busy && <div className="thinking"><LoaderCircle className="spin" size={16}/>Модель готовит ответ…</div>}<div ref={bottom}/></div>}
      </section>
      <div className="composer-wrap"><div className="composer">
        <div className="composer-modes">{modes.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={mode === m.id ? 'selected' : ''}><m.icon size={14}/>{m.label}</button>)}<span className="mode-hint">Ваш темп. Ваши правила.</span></div>
        {attachments.length > 0 && <div className="attachments">{attachments.map((a, i) => <span key={i}>{a.image ? <img src={a.image}/> : <Paperclip size={13}/>}<span>{a.name}</span><button title="Убрать вложение" onClick={() => setAttachments(xs => xs.filter((_, j) => i !== j))}><X size={13}/></button></span>)}</div>}
        <textarea aria-label="Сообщение" placeholder="Что сделаем сегодня?" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/>
        <div className="composer-bottom"><div className="composer-tools"><button title="Прикрепить текстовый файл" onClick={importFile}><Paperclip size={18}/></button><button title="Снимок экрана" onClick={screenshot}><Monitor size={18}/></button><button title="Открыть Chrome" onClick={() => setModal('browser')}><Globe size={18}/></button><span className="tool-divider"/><button title="Запись микрофона (до 2 минут)" className={recording ? 'recording' : ''} onClick={record}>{recording ? <Square size={17}/> : <Mic size={18}/>}</button>{recording && <small className="recording">Идёт запись</small>}</div><div className="send-area"><span>{busy ? 'Можно остановить' : 'Enter — отправить'}</span><button className="send-button" disabled={!busy && !input.trim() && !attachments.length} title={busy ? 'Остановить запрос' : 'Отправить'} onClick={() => busy ? action(() => native('cancel')) : send()}>{busy ? <Square size={17}/> : <ArrowUp size={20}/>}</button></div></div>
      </div><div className="composer-foot"><span>AI может ошибаться. Проверяйте важную информацию.</span><span><LockKeyhole size={11}/>Доступ только с вашего разрешения</span></div></div>
    </main>
    {panel && <aside className="access-panel"><div className="panel-title"><span><SlidersHorizontal size={16}/>Контроль доступа</span><button className="icon-button" title="Скрыть панель" onClick={() => setPanel(false)}><X size={16}/></button></div>
      <div className="safe-status"><span className="shield-box"><ShieldCheck size={22}/></span><div><strong>Вы управляете доступом</strong><p>Никаких скрытых действий</p></div><span className="status-dot"/></div>
      <div className="section-heading">ВОЗМОЖНОСТИ НА УСТРОЙСТВЕ<span>{Object.values(permissions).filter(Boolean).length}/6</span></div>
      <div className="permissions">{accessItems.map(([id, Icon, title, desc]) => <div className="permission" key={id}><span className={`permission-icon ${permissions[id] ? 'enabled' : ''}`}><Icon size={18}/></span><div><strong>{title}</strong><small>{desc}</small></div><button role="switch" aria-checked={permissions[id]} aria-label={title} className={`toggle ${permissions[id] ? 'enabled' : ''}`} onClick={() => togglePermission(id)}><span/></button></div>)}</div>
      <div className="permission-note"><ShieldCheck size={15}/><p>Файлы, снимки экрана и команды требуют вашего подтверждения. Разрешения можно отключить в любой момент.</p></div>
      <div className="panel-line"/><div className="section-heading">БЫСТРЫЕ ДЕЙСТВИЯ</div>
      <div className="quick-actions"><button onClick={importFile}><FolderOpen size={16}/>Открыть файл<ArrowUpRight size={14}/></button><button onClick={screenshot}><Monitor size={16}/>Сделать снимок экрана<ArrowUpRight size={14}/></button><button onClick={() => setModal('terminal')}><Terminal size={16}/>Выполнить команду<ArrowUpRight size={14}/></button></div>
      <div className="activity-title"><span className="section-heading">АКТИВНОСТЬ</span><span className="live-dot"/></div><div className="activity-list">{activity.length ? activity.map((a, i) => <div key={i}><span className="activity-dot"/><p>{a.text}<small>{a.time}</small></p></div>) : <div className="no-activity"><Clock3 size={18}/><p>Пока всё спокойно<small>Действия появятся здесь</small></p></div>}</div>
      <div className="device-card"><span><Monitor size={19}/></span><div><strong>{desktop ? 'Этот компьютер' : 'Предварительный просмотр'}</strong><small>{desktop ? 'Локальное приложение · Windows' : 'Функции ПК доступны после установки'}</small></div><span className="device-dot"/></div>
    </aside>}
    {toast && <div role="status" className="toast"><span>{toast}</span><button title="Закрыть" onClick={() => setToast('')}><X size={16}/></button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div className="modal-symbol"><Orbit size={23}/></div><button className="icon-button" title="Закрыть окно" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'settings' && <><h2 id="modal-title">Модели и подключения</h2><p className="modal-subtitle">Один интерфейс для ваших AI-провайдеров.</p><div className="info-box">Orbit — независимый клиент, не официальный продукт Arena. Модели доступны через ваш API-провайдер; подписка на сайт Arena не является API-ключом.</div><label className="field">Базовый URL API<input value={config.base} onChange={e => setConfig(c => ({ ...c, base: e.target.value }))} placeholder="https://api.openai.com/v1"/></label><label className="field">API-ключ<span className="field-note">Только в памяти этой сессии</span><input type="password" autoComplete="off" value={config.key} onChange={e => setConfig(c => ({ ...c, key: e.target.value }))} placeholder="sk-…"/></label><div className="field-row"><label className="field">ID модели<input list="models" value={model} onChange={e => setModel(e.target.value)} placeholder="Введите ID модели"/><datalist id="models">{models.map(m => <option key={m} value={m}/>)}</datalist></label><button className="secondary-button" disabled={loadingModels} onClick={fetchModels}>{loadingModels ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}Загрузить список</button></div><p className="fine-print">Поддерживается OpenAI-совместимый Chat Completions API, включая локальные серверы. Доступность изображений зависит от модели. История и вложения отправляются указанному провайдеру при каждом запросе.</p><button className="primary-button full" onClick={() => { setModal(null); setToast('Настройки применены к этой сессии. Для запросов включите «Интернет».'); }}><Check size={16}/>Применить настройки</button></>}
      {modal === 'terminal' && <><h2 id="modal-title">Команда на компьютере</h2><p className="modal-subtitle">PowerShell · права текущего пользователя</p><div className="warning-box">Команды могут изменять и удалять файлы. Проверьте текст перед запуском. Автоматическое выполнение ответов модели отключено.</div><label className="field">Команда<textarea className="code-input" value={command} onChange={e => setCommand(e.target.value)}/></label><button className="primary-button" disabled={running} onClick={() => action(async () => { setRunning(true); try { const r = await native('command', command); setCommandResult(`Код завершения: ${r.code}\n${r.output}`); log('Команда PowerShell завершена'); } finally { setRunning(false); } })}>{running ? <LoaderCircle size={16} className="spin"/> : <Terminal size={16}/>}Проверить и запустить</button>{commandResult && <pre className="command-output">{commandResult}</pre>}<p className="fine-print">Ограничение — 60 секунд, вывод до 100 КБ. Это не изолированная среда. Побочные действия команды могут сохраняться после её завершения.</p></>}
      {modal === 'browser' && <><h2 id="modal-title">Открыть в Google Chrome</h2><p className="modal-subtitle">Интернет — под вашим контролем</p><label className="field">Адрес страницы<input value={url} onChange={e => setUrl(e.target.value)}/></label><button className="primary-button" onClick={() => action(async () => { await native('openChrome', url); log('Ссылка открыта в Chrome'); setModal(null); })}><ExternalLink size={16}/>Открыть страницу</button><div className="info-box spaced">Chrome должен быть установлен. Приложение открывает ссылки, но не читает вкладки, пароли, cookies и историю браузера. Автономный веб-поиск модели в этой версии не подключён.</div></>}
      {modal === 'files' && <><h2 id="modal-title">Файлы в диалоге</h2><p className="modal-subtitle">Вы выбираете, чем поделиться с моделью.</p><div className="file-drop"><FolderOpen size={36}/><strong>Добавьте текст или код</strong><p>TXT, MD, JSON, CSV, JS, TS, PY и другие<br/>До 2 МБ на файл · до 4 вложений</p><button className="primary-button" onClick={importFile}><Plus size={16}/>Выбрать файл</button></div>{attachments.map((a, i) => <div className="file-row" key={i}><Paperclip size={16}/><span>{a.name}</span><button title="Удалить вложение" onClick={() => setAttachments(xs => xs.filter((_, j) => j !== i))}><X size={16}/></button></div>)}<p className="fine-print">Вложения сохраняются в локальной истории после отправки. Не загружайте пароли и секреты. Для PDF и офисных документов сначала экспортируйте текст.</p></>}
      {modal === 'about' && <><h2 id="modal-title">Ваш персональный Orbit</h2><p className="modal-subtitle">Версия 0.1.0 · независимое приложение</p><div className="info-box">Чат, файлы и действия на ПК в одном пространстве. Никаких скрытых записей, глобального перехвата клавиш или вмешательства в игры. Управление мышью, автономные агенты и инструменты сайта Arena не входят в эту версию.</div><h3>Установка на Windows 10/11</h3><p className="fine-print">Сборка установщика: <code>npm ci</code>, затем <code>npm run dist:win</code> на Windows. Готовый EXE появится в папке release. Node.js нужен только для сборки; Electron уже включён в приложение.</p><button className="secondary-button" onClick={() => { if (confirm('Удалить всю историю диалогов с этого устройства?')) { setChats([]); setCurrent(null); setModal(null); } }} disabled={busy}><Trash2 size={16}/>Очистить локальную историю</button></>}
    </section></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
