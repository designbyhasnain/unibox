// Content script — scrapes page data on request
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

function detectPlatform() {
  const url = location.href;
  if (url.includes('linkedin.com/in/')) return 'linkedin';
  if (url.includes('instagram.com/')) return 'instagram';
  if (url.includes('facebook.com/')) return 'facebook';
  return 'generic';
}

function extractEmails() {
  const results = [];
  // mailto links
  document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    const email = a.href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email) results.push({ value: email, confidence: 'HIGH' });
  });
  // itemprop
  document.querySelectorAll('[itemprop="email"]').forEach(el => {
    const v = (el.textContent || el.getAttribute('content') || '').trim().toLowerCase();
    if (v.includes('@')) results.push({ value: v, confidence: 'HIGH' });
  });
  // regex on visible text
  const text = document.body?.innerText || '';
  const matches = text.match(EMAIL_RE) || [];
  matches.forEach(m => {
    const v = m.toLowerCase();
    if (!results.some(r => r.value === v)) {
      const generic = /^(noreply|no-reply|support|info|admin|help|contact|sales|hello|team)@/.test(v);
      results.push({ value: v, confidence: generic ? 'LOW' : 'MEDIUM' });
    }
  });
  return results;
}

function extractPhones() {
  const results = [];
  document.querySelectorAll('a[href^="tel:"]').forEach(a => {
    const phone = a.href.replace('tel:', '').trim();
    if (phone) results.push({ value: phone, confidence: 'HIGH' });
  });
  document.querySelectorAll('[itemprop="telephone"]').forEach(el => {
    const v = (el.textContent || el.getAttribute('content') || '').trim();
    if (v) results.push({ value: v, confidence: 'HIGH' });
  });
  const text = document.body?.innerText || '';
  const matches = text.match(PHONE_RE) || [];
  matches.forEach(m => {
    const v = m.trim();
    if (v.length >= 10 && !results.some(r => r.value === v)) {
      results.push({ value: v, confidence: 'MEDIUM' });
    }
  });
  return results;
}

function extractName() {
  const platform = detectPlatform();
  // Platform-specific
  if (platform === 'linkedin') {
    const n = document.querySelector('.text-heading-xlarge, h1.text-heading-xlarge');
    if (n?.innerText?.trim()) return { value: n.innerText.trim(), confidence: 'HIGH' };
  }
  if (platform === 'instagram') {
    const n = document.querySelector('header h2, header h1');
    if (n?.innerText?.trim()) return { value: n.innerText.trim(), confidence: 'HIGH' };
  }
  // Generic
  const itemprop = document.querySelector('[itemprop="name"]');
  if (itemprop?.innerText?.trim()) return { value: itemprop.innerText.trim(), confidence: 'HIGH' };
  const ogName = document.querySelector('meta[property="og:site_name"]');
  if (ogName?.content?.trim()) return { value: ogName.content.trim(), confidence: 'MEDIUM' };
  const h1 = document.querySelector('h1');
  if (h1?.innerText?.trim() && h1.innerText.trim().length < 80) return { value: h1.innerText.trim(), confidence: 'MEDIUM' };
  const title = document.title?.split(/[|\-–—]/)[0]?.trim();
  if (title && title.length < 60) return { value: title, confidence: 'LOW' };
  return null;
}

function extractCompany() {
  const platform = detectPlatform();
  if (platform === 'linkedin') {
    const c = document.querySelector('.text-body-medium, .pv-text-details__right-panel-item-text');
    if (c?.innerText?.trim()) return { value: c.innerText.trim(), confidence: 'MEDIUM' };
  }
  const org = document.querySelector('[itemprop="organization"], [itemprop="worksFor"]');
  if (org?.innerText?.trim()) return { value: org.innerText.trim(), confidence: 'HIGH' };
  const ogName = document.querySelector('meta[property="og:site_name"]');
  if (ogName?.content?.trim()) return { value: ogName.content.trim(), confidence: 'LOW' };
  return null;
}

function scrapePage() {
  const platform = detectPlatform();
  const emails = extractEmails();
  const phones = extractPhones();
  const nameResult = extractName();
  const companyResult = extractCompany();

  const bestEmail = emails.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.confidence] || 3) - (order[b.confidence] || 3);
  })[0];

  const bestPhone = phones.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.confidence] || 3) - (order[b.confidence] || 3);
  })[0];

  const sourceMap = {
    linkedin: 'Extension \u2022 LinkedIn',
    instagram: 'Extension \u2022 Instagram',
    facebook: 'Extension \u2022 Facebook',
    generic: 'Extension'
  };

  return {
    name: nameResult?.value || null,
    email: bestEmail?.value || null,
    phone: bestPhone?.value || null,
    company: companyResult?.value || null,
    website: location.origin,
    sourceUrl: location.href,
    platform,
    source: sourceMap[platform] || 'Extension',
    confidence: {
      name: nameResult?.confidence || null,
      email: bestEmail?.confidence || null,
      phone: bestPhone?.confidence || null,
      company: companyResult?.confidence || null
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    try {
      const data = scrapePage();
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true;
});
