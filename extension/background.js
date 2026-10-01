// Toolbar button: open the board in its own tab, or focus it if it's already open.
const api = globalThis.browser ?? globalThis.chrome;
api.action.onClicked.addListener(async () => {
  const url = api.runtime.getURL('index.html');
  const [existing] = await api.tabs.query({ url });
  if (existing) {
    await api.tabs.update(existing.id, { active: true });
    await api.windows.update(existing.windowId, { focused: true });
  } else await api.tabs.create({ url });
});
