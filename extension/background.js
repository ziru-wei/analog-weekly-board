// Toolbar button and Firefox's _execute_action shortcut share the same open/focus behavior.
const api = globalThis.browser ?? globalThis.chrome;
api.action.onClicked.addListener(async () => {
  const url = api.runtime.getURL('index.html');
  const [existing] = await api.tabs.query({ url });
  if (existing) {
    await api.tabs.update(existing.id, { active: true });
    await api.windows.update(existing.windowId, { focused: true });
  } else await api.tabs.create({ url });
});

// YouTube requires a client Referer; extension schemes do not supply an HTTPS one.
// This rule identifies our app only on player frames initiated by our own extension.
const appUrl = api.runtime.getURL('index.html');
// Firefox supports blocking request headers in MV3. Check the originating page
// directly: extension UUIDs are not ordinary DNS initiator domains.
if (api.webRequest?.onBeforeSendHeaders) {
  api.webRequest.onBeforeSendHeaders.addListener(details => {
    if (details.documentUrl !== appUrl && details.originUrl !== appUrl) return {};
    const headers = (details.requestHeaders ?? []).filter(header => header.name.toLowerCase() !== 'referer');
    headers.push({ name: 'Referer', value: 'https://ziru-wei.github.io/analog-weekly-board/' });
    return { requestHeaders: headers };
  }, { urls: ['https://www.youtube-nocookie.com/embed/*'], types: ['sub_frame'] }, ['blocking', 'requestHeaders']);
}
let playerSetup;
function preparePlayer() {
  if (api.webRequest?.onBeforeSendHeaders) return Promise.resolve({ ok: true });
  playerSetup ??= api.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://ziru-wei.github.io/analog-weekly-board/' }] },
      condition: {
        urlFilter: '|https://www.youtube-nocookie.com/embed/',
        initiatorDomains: [new URL(api.runtime.getURL('index.html')).hostname],
        resourceTypes: ['sub_frame'],
      },
    }],
  }).catch(error => { playerSetup = undefined; throw error; });
  return playerSetup.then(() => ({ ok: true }), () => ({ ok: false }));
}
api.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'prepare-youtube-player' || sender.id !== api.runtime.id || sender.url !== appUrl) return;
  return api.permissions.contains({ origins: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] })
    .then(granted => granted ? preparePlayer() : { ok: false, needsPermission: true });
});

// Fetch only a link explicitly requested by our own board; never use account cookies.
api.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'link-preview' || sender.id !== api.runtime.id || sender.url !== appUrl) return;
  let url;
  try { url = new URL(message.url); } catch { return Promise.resolve({ ok: false }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return Promise.resolve({ ok: false });
  return (async () => {
    // The public Bilibili API returns the actual title and cover even when the
    // player document has only a generic title. Never send account cookies.
    let bvid = '', aid = '';
    if (['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
      const id = /^\/video\/(BV[\dA-Za-z]{10}|av[1-9]\d{0,15})\/?$/.exec(url.pathname)?.[1] ?? '';
      if (id.startsWith('BV')) bvid = id; else if (id) aid = id.slice(2);
    } else if (url.hostname === 'player.bilibili.com' && url.pathname === '/player.html') {
      bvid = url.searchParams.get('bvid') ?? ''; aid = url.searchParams.get('aid') ?? '';
    }
    const apiUrl = new URL('https://api.bilibili.com/x/web-interface/view');
    if (/^BV[\dA-Za-z]{10}$/.test(bvid)) apiUrl.searchParams.set('bvid', bvid);
    else if (/^[1-9]\d{0,15}$/.test(aid)) apiUrl.searchParams.set('aid', aid);
    if (apiUrl.search && await api.permissions.contains({ origins: ['https://api.bilibili.com/*'] })) {
      try {
        const response = await fetch(apiUrl.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6000) });
        const result = response.ok ? await response.json() : null;
        if (result?.code === 0 && typeof result.data?.title === 'string' && result.data.title.trim()) {
          const { title, desc, pic } = result.data;
          let image = ''; try { const cover = new URL(pic); if (['http:', 'https:'].includes(cover.protocol) && !cover.username && !cover.password) { cover.protocol = 'https:'; image = cover.href; } } catch { /* No cover available. */ }
          return { ok: true, preview: { title: title.slice(0, 500), description: typeof desc === 'string' ? desc.slice(0, 700) : '', image } };
        }
      } catch { /* Fall back to the public page with the user's site permission. */ }
      url = new URL(`https://www.bilibili.com/video/${apiUrl.searchParams.get('bvid') ?? `av${apiUrl.searchParams.get('aid')}`}/`);
    }
    if (!await api.permissions.contains({ origins: [`${url.origin}/*`] })) return { ok: false, needsPermission: true };
    const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
    const finalUrl = new URL(response.url);
    if (/\/(?:login|signin|accounts)(?:\/|$)/i.test(finalUrl.pathname)) return { ok: false, restricted: true };
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return { ok: false };
    const reader = response.body?.getReader(); if (!reader) return { ok: false };
    const decoder = new TextDecoder(); let html = '', size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); return { ok: false }; }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally { reader.releaseLock(); }
    return { ok: true, html, url: response.url };
  })().catch(() => ({ ok: false }));
});
