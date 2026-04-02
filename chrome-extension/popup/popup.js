document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('apiKey');
  const urlInput = document.getElementById('crmUrl');
  const saveBtn = document.getElementById('save');
  const statusEl = document.getElementById('status');
  const connEl = document.getElementById('conn-status');
  const cacheEl = document.getElementById('cache-count');

  // Load saved config
  const { apiKey, crmUrl } = await chrome.storage.sync.get(['apiKey', 'crmUrl']);
  if (apiKey) input.value = apiKey;
  if (crmUrl) urlInput.value = crmUrl;

  // Save
  saveBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    const url = urlInput.value.trim() || 'https://txb-unibox.vercel.app';
    if (!key) { statusEl.textContent = '■ ERROR: KEY REQUIRED'; statusEl.style.color = '#ff3333'; return; }
    await chrome.storage.sync.set({ apiKey: key, crmUrl: url });
    statusEl.textContent = '■ CONFIG SAVED';
    statusEl.style.color = '#00ff41';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    checkConnection(key, url, connEl);
  });

  // Session cache count
  const sessionData = await chrome.storage.session.get(null);
  cacheEl.textContent = Object.keys(sessionData).length + ' DOMAINS';

  // Check connection on load
  if (apiKey) {
    const url = crmUrl || 'https://txb-unibox.vercel.app';
    checkConnection(apiKey, url, connEl);
  } else {
    connEl.textContent = 'NO_KEY';
    connEl.classList.add('err');
  }
});

async function checkConnection(apiKey, baseUrl, el) {
  try {
    const res = await fetch(`${baseUrl}/api/ext/ping`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      el.textContent = '■ CONNECTED: ' + (data.user || 'OK');
      el.classList.remove('err');
      el.classList.add('ok');
    } else {
      el.textContent = '■ INVALID_KEY';
      el.classList.remove('ok');
      el.classList.add('err');
    }
  } catch {
    el.textContent = '■ NO_CONNECTION';
    el.classList.remove('ok');
    el.classList.add('err');
  }
}
