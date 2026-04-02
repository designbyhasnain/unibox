const PageScraper = {

  extractName() {
    const selectors = [
      'meta[property="og:site_name"]',
      'meta[name="author"]',
      'meta[property="og:title"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = el.getAttribute('content') || el.innerText;
        if (val && val.length > 1 && val.length < 80) return val.trim();
      }
    }
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.length < 60) return h1.innerText.trim();
    let title = document.title;
    title = title.replace(/[-|–—].*$/, '').trim();
    return title.length > 0 ? title : null;
  },

  extractEmail() {
    const hrefEmails = [...document.querySelectorAll('a[href^="mailto:"]')]
      .map(a => a.href.replace('mailto:', '').split('?')[0].trim())
      .filter(Boolean);
    if (hrefEmails.length > 0) return this._bestEmail(hrefEmails);
    const bodyText = document.body.innerText;
    const regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const found = bodyText.match(regex) || [];
    return this._bestEmail(found);
  },

  _bestEmail(list) {
    if (list.length === 0) return null;
    const priority = list.filter(e =>
      !e.includes('example.com') && !e.includes('domain.com') &&
      !e.startsWith('noreply') && !e.startsWith('no-reply') && !e.startsWith('support@')
    );
    return priority[0] || list[0];
  },

  extractPhone() {
    const hrefPhones = [...document.querySelectorAll('a[href^="tel:"]')]
      .map(a => a.href.replace('tel:', '').trim()).filter(Boolean);
    if (hrefPhones.length > 0) return hrefPhones[0];
    const bodyText = document.body.innerText;
    const regex = /(?:\+?(\d{1,3})[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g;
    const found = bodyText.match(regex) || [];
    const valid = found.filter(p => p.replace(/\D/g, '').length >= 10);
    return valid[0] || null;
  },

  extractSocialLinks() {
    const links = [...document.querySelectorAll('a[href]')].map(a => a.href);
    return {
      instagram: links.find(l => l.includes('instagram.com/')) || null,
      facebook: links.find(l => l.includes('facebook.com/')) || null,
      youtube: links.find(l => l.includes('youtube.com/')) || null,
      vimeo: links.find(l => l.includes('vimeo.com/')) || null,
    };
  },

  extractPricing() {
    const bodyText = document.body.innerText;
    const pricingSignals = ['package', 'invest', 'pricing', 'collection', 'starting at', 'starting from', 'book now'];
    if (!pricingSignals.some(s => bodyText.toLowerCase().includes(s))) return null;

    const currencyMap = { '$': 'USD', '€': 'EUR', '£': 'GBP' };
    let currency = 'USD';
    let sym = '$';
    for (const [s, code] of Object.entries(currencyMap)) {
      if (bodyText.includes(s)) { currency = code; sym = s; break; }
    }

    const regex = new RegExp(`\\${sym}\\s?(\\d[\\d,]*)`, 'g');
    const raw = [...bodyText.matchAll(regex)].map(m => parseInt(m[1].replace(/,/g, '')));
    const kRegex = /(\d+(?:\.\d+)?)\s?k\b/gi;
    const kMatches = [...bodyText.matchAll(kRegex)].map(m => Math.round(parseFloat(m[1]) * 1000));
    const all = [...raw, ...kMatches].filter(n => n >= 500 && n <= 100000).sort((a, b) => a - b);
    if (all.length === 0) return null;

    const min = all[0];
    const max = all.length > 1 ? all[all.length - 1] : null;
    const midpoint = max ? (min + max) / 2 : min;
    const suggested = Math.round((midpoint * 0.15) / 50) * 50;

    return {
      min, max, currency, symbol: sym, suggested,
      display: max ? `${sym}${min.toLocaleString()}–${sym}${max.toLocaleString()}` : `${sym}${min.toLocaleString()}`,
      suggestedDisplay: `${sym}${suggested.toLocaleString()}`
    };
  },

  extractVideoEmbeds() {
    return !!document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], video');
  },

  extractAll() {
    return {
      name: this.extractName(),
      email: this.extractEmail(),
      phone: this.extractPhone(),
      social: this.extractSocialLinks(),
      pricing: this.extractPricing(),
      hasVideo: this.extractVideoEmbeds(),
      domain: window.location.hostname.replace(/^www\./, ''),
      url: window.location.href,
    };
  }
};
