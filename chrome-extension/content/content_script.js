(async () => {
  // Only run on filmmaker pages
  if (!ProspectScorer.isFilmmakerPage()) return;

  // Session cache — don't re-check same domain
  const domain = window.location.hostname.replace(/^www\./, '');
  const cached = await chrome.storage.session.get(domain);
  if (cached[domain]) return;

  // Mount and scan
  Island.mount();
  await Island.scanning();

  // Scrape
  const scraped = PageScraper.extractAll();
  const location = LocationExtractor.extract();
  const score = ProspectScorer.score(scraped, location);
  const data = { ...scraped, location, score };

  // Get API key
  const { apiKey, crmUrl } = await chrome.storage.sync.get(['apiKey', 'crmUrl']);
  const baseUrl = crmUrl || 'https://txb-unibox.vercel.app';

  // Check CRM for duplicate
  let crmResult = null;
  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/api/ext/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ email: scraped.email, phone: scraped.phone, domain })
      });
      if (res.ok) crmResult = await res.json();
    } catch (e) {
      console.warn('[Unibox] CRM check failed:', e);
    }
  }

  // Render appropriate state
  if (crmResult?.found) {
    Island.showExists(crmResult.lead);
  } else if (score.score < 30) {
    Island.showLow(data);
  } else if (!data.email && !data.phone && data.social?.facebook) {
    Island.showPartial(data, () => {
      chrome.runtime.sendMessage({
        type: 'SCRAPE_FACEBOOK',
        fbUrl: data.social.facebook,
        originalData: data
      }, (response) => {
        if (response?.email) {
          data.email = response.email;
          Island.updateFbFound(response.email);
        }
      });
    });
  } else if (!data.email && !data.phone) {
    Island.showPartial(data, null);
  } else {
    Island.showHot(data);
  }

  // Cache domain
  await chrome.storage.session.set({ [domain]: true });
})();
