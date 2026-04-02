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
    const bodyLower = bodyText.toLowerCase();
    const pricingSignals = ['package', 'invest', 'pricing', 'collection', 'starting at', 'starting from', 'book now', 'price', 'rate', 'cost', 'quote'];
    if (!pricingSignals.some(s => bodyLower.includes(s))) return null;

    const currencyMap = { '$': 'USD', '€': 'EUR', '£': 'GBP', 'A$': 'AUD', 'NZ$': 'NZD', 'C$': 'CAD' };
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

    // Tiered pricing intelligence
    // Budget tier ($1K-3K): charge 10-12% — they're price sensitive
    // Mid tier ($3K-6K): charge 12-15% — sweet spot
    // Premium ($6K-12K): charge 8-10% — volume play, long-term client
    // Luxury ($12K+): charge 6-8% — anchor client, recurring
    let editPercent, tier, affordability, confidence;
    if (midpoint <= 2000) { editPercent = 0.18; tier = 'BUDGET'; affordability = 'LOW'; confidence = 'They may push back on price. Offer single-reel packages.'; }
    else if (midpoint <= 4000) { editPercent = 0.14; tier = 'STANDARD'; affordability = 'MODERATE'; confidence = 'Good fit for highlight + reel bundles. Can upsell.'; }
    else if (midpoint <= 7000) { editPercent = 0.12; tier = 'MID_TIER'; affordability = 'GOOD'; confidence = 'Sweet spot client. Offer full edit packages. High close rate.'; }
    else if (midpoint <= 12000) { editPercent = 0.10; tier = 'PREMIUM'; affordability = 'HIGH'; confidence = 'Premium client. Offer full-service editing. Volume discount for loyalty.'; }
    else { editPercent = 0.08; tier = 'LUXURY'; affordability = 'VERY_HIGH'; confidence = 'Anchor client potential. White-glove service. Priority queue.'; }

    const suggestedMin = Math.round((min * editPercent) / 25) * 25;
    const suggestedMax = max ? Math.round((max * editPercent) / 25) * 25 : null;
    const suggestedMid = Math.round((midpoint * editPercent) / 25) * 25;

    // Package suggestions based on their pricing tier
    const packages = [];
    if (midpoint >= 3000) packages.push({ name: 'HLF', price: Math.round(suggestedMid * 0.7 / 25) * 25 });
    packages.push({ name: 'FULL EDIT', price: suggestedMid });
    if (midpoint >= 4000) packages.push({ name: 'FULL + REELS', price: Math.round(suggestedMid * 1.4 / 25) * 25 });
    if (midpoint >= 6000) packages.push({ name: 'PREMIUM PKG', price: Math.round(suggestedMid * 1.8 / 25) * 25 });

    return {
      min, max, currency, symbol: sym, tier, affordability, confidence,
      editPercent: Math.round(editPercent * 100),
      suggested: suggestedMid,
      suggestedRange: suggestedMax ? `${sym}${suggestedMin.toLocaleString()}–${sym}${suggestedMax.toLocaleString()}` : `${sym}${suggestedMin.toLocaleString()}`,
      display: max ? `${sym}${min.toLocaleString()}–${sym}${max.toLocaleString()}` : `${sym}${min.toLocaleString()}`,
      suggestedDisplay: `${sym}${suggestedMid.toLocaleString()}`,
      packages
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
