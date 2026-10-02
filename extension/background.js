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
