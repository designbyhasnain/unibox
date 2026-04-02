chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_FACEBOOK') {
    handleFacebookScrape(message.fbUrl, sendResponse);
    return true;
  }
  if (message.type === 'SCRAPE_INSTAGRAM') {
    handleInstagramScrape(message.igUrl, sendResponse);
    return true;
  }
  if (message.type === 'ADD_TO_CRM') {
    handleAddToCRM(message.data, sendResponse);
    return true;
  }
});

async function handleFacebookScrape(fbUrl, sendResponse) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: fbUrl, active: false });
    await waitForTabLoad(tab.id);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['fallbacks/facebook_scraper.js']
    });
    sendResponse(results?.[0]?.result || {});
  } catch (e) {
    console.error('[Unibox] FB scrape failed:', e);
    sendResponse({});
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function handleInstagramScrape(igUrl, sendResponse) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: igUrl, active: false });
    await waitForTabLoad(tab.id);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['fallbacks/instagram_scraper.js']
    });
    sendResponse(results?.[0]?.result || {});
  } catch (e) {
    console.error('[Unibox] IG scrape failed:', e);
    sendResponse({});
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 8000);
  });
}

async function handleAddToCRM(data, sendResponse) {
  try {
    const { apiKey, crmUrl } = await chrome.storage.sync.get(['apiKey', 'crmUrl']);
    const baseUrl = crmUrl || 'https://txb-unibox.vercel.app';
    if (!apiKey) { sendResponse({ success: false, error: 'No API key' }); return; }

    const res = await fetch(`${baseUrl}/api/ext/add-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        phone: data.phone,
        location: data.location,
        website: data.url,
        domain: data.domain,
        pricing: data.pricing,
        suggestedEditPrice: data.pricing?.suggested,
        social: data.social,
        prospectScore: data.score?.score,
        source: 'extension'
      })
    });
    const json = await res.json();
    sendResponse({ success: res.ok, lead: json });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}
