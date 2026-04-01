const BASE_URL = 'https://txb-unibox.vercel.app';

async function getApiKey() {
  return (await chrome.storage.local.get('apiKey')).apiKey;
}

async function saveApiKey(key) {
  await chrome.storage.local.set({ apiKey: key });
}

async function verifyApiKey(apiKey) {
  try {
    const res = await fetch(`${BASE_URL}/api/extension/me`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function checkClientExists(apiKey, { email, phone, name }) {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  else if (phone) params.set('phone', phone);
  else if (name) params.set('name', name);
  try {
    const res = await fetch(`${BASE_URL}/api/extension/clients?${params}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return await res.json();
  } catch { return { error: 'Network error' }; }
}

async function createClient(apiKey, clientData) {
  try {
    const res = await fetch(`${BASE_URL}/api/extension/clients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clientData)
    });
    return await res.json();
  } catch { return { error: 'Network error' }; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const apiKey = await getApiKey();
    switch (message.type) {
      case 'VERIFY_KEY':
        sendResponse(await verifyApiKey(message.apiKey));
        break;
      case 'SAVE_API_KEY':
        await saveApiKey(message.apiKey);
        sendResponse({ success: true });
        break;
      case 'GET_API_KEY':
        sendResponse({ apiKey });
        break;
      case 'CHECK_CLIENT':
        sendResponse(await checkClientExists(apiKey, message.data));
        break;
      case 'CREATE_CLIENT':
        sendResponse(await createClient(apiKey, message.data));
        break;
      case 'LOGOUT':
        await chrome.storage.local.remove('apiKey');
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});
