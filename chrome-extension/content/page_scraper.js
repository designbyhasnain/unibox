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

  extractBusinessIntel() {
    const body = document.body.innerText;
    const bodyLower = body.toLowerCase();
    const links = [...document.querySelectorAll('a[href]')].map(a => a.href);
    const images = document.querySelectorAll('img');
    const intel = {};

    // 1. Portfolio count — how many weddings shown on website
    const galleryImages = document.querySelectorAll('[class*="gallery"] img, [class*="portfolio"] img, [class*="grid"] img, [class*="masonry"] img, [class*="work"] img');
    const portfolioLinks = links.filter(l => /\/(portfolio|gallery|films|work|weddings|stories)\//i.test(l));
    const coupleNames = body.match(/\b[A-Z][a-z]+\s*[&+]\s*[A-Z][a-z]+\b/g) || [];
    intel.portfolioCount = Math.max(galleryImages.length, portfolioLinks.length, coupleNames.length);
    intel.coupleNames = [...new Set(coupleNames)].slice(0, 10);

    // 2. Video count — embedded videos on page
    const youtubeEmbeds = document.querySelectorAll('iframe[src*="youtube"]');
    const vimeoEmbeds = document.querySelectorAll('iframe[src*="vimeo"]');
    const videoTags = document.querySelectorAll('video');
    intel.videoCount = youtubeEmbeds.length + vimeoEmbeds.length + videoTags.length;

    // 3. YouTube channel analysis
    const ytLink = links.find(l => /youtube\.com\/(c\/|channel\/|@)/.test(l));
    intel.youtubeChannel = ytLink || null;

    // 4. Blog/journal post dates — estimate posting frequency
    const datePatterns = body.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi) || [];
    const datePatterns2 = body.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}\b/g) || [];
    const allDates = [...datePatterns, ...datePatterns2].map(d => new Date(d)).filter(d => !isNaN(d.getTime())).sort((a, b) => b - a);
    intel.blogDates = allDates.length;
    if (allDates.length >= 2) {
      const newest = allDates[0];
      const oldest = allDates[allDates.length - 1];
      const spanDays = Math.max(1, (newest - oldest) / 86400000);
      intel.postsPerMonth = Math.round((allDates.length / spanDays) * 30 * 10) / 10;
    }

    // 5. Team size indicators
    const teamKeywords = ['team', 'our team', 'meet the team', 'about us', 'our crew', 'our staff'];
    intel.hasTeamPage = teamKeywords.some(k => bodyLower.includes(k));
    const teamMembers = body.match(/\b(Photographer|Videographer|Cinematographer|Editor|Director|Lead|Second Shooter|Assistant)\b/gi);
    intel.teamSize = teamMembers ? [...new Set(teamMembers.map(t => t.toLowerCase()))].length : 0;

    // 6. Service areas — how many locations/regions
    const stateMatches = body.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/gi);
    const countryMatches = body.match(/\b(USA|UK|Canada|Australia|Italy|France|Spain|Mexico|Greece|Bali|Thailand|Costa Rica|Ireland|Scotland|Portugal|Croatia|Hawaii)\b/gi);
    intel.serviceAreas = [...new Set([...(stateMatches || []), ...(countryMatches || [])].map(s => s.trim()))];
    intel.isDestination = intel.serviceAreas.length >= 3 || bodyLower.includes('destination') || bodyLower.includes('travel');

    // 7. Awards/features — indicates premium status
    const awardKeywords = ['featured', 'published', 'as seen', 'award', 'best of', 'top rated', 'knot', 'weddingwire', 'junebug', 'green wedding shoes', 'martha stewart', 'vogue', 'brides magazine'];
    intel.awards = awardKeywords.filter(k => bodyLower.includes(k));

    // 8. Booking status indicators
    intel.isBookedUp = bodyLower.includes('fully booked') || bodyLower.includes('sold out') || bodyLower.includes('limited availability') || bodyLower.includes('waitlist') || bodyLower.includes('currently booking');
    const yearMatch = bodyLower.match(/booking\s*(20\d{2})/i) || bodyLower.match(/(20\d{2})\s*season/i);
    intel.bookingYear = yearMatch ? yearMatch[1] : null;

    // 9. Reviews/testimonials count
    const testimonials = document.querySelectorAll('[class*="testimonial"], [class*="review"], [class*="quote"], blockquote');
    intel.reviewCount = testimonials.length;
    const starMatch = body.match(/(\d+\.?\d*)\s*\/?\s*5\s*stars?/i) || body.match(/(\d+\.?\d*)\s*stars?/i);
    intel.starRating = starMatch ? parseFloat(starMatch[1]) : null;

    // 10. Estimate weddings per year
    let weddingsPerYear = 0;
    let estimateMethod = '';
    if (intel.portfolioCount >= 3) {
      // Assume portfolio shows ~30-50% of actual weddings
      weddingsPerYear = Math.round(intel.portfolioCount * 2.5);
      estimateMethod = 'portfolio_count';
    }
    if (intel.blogDates >= 3 && intel.postsPerMonth) {
      // Blog posts roughly = weddings filmed (each wedding gets a blog post)
      const fromBlog = Math.round(intel.postsPerMonth * 12);
      if (fromBlog > weddingsPerYear) { weddingsPerYear = fromBlog; estimateMethod = 'blog_frequency'; }
    }
    if (coupleNames.length >= 5) {
      const fromCouples = Math.round(coupleNames.length * 2);
      if (fromCouples > weddingsPerYear) { weddingsPerYear = fromCouples; estimateMethod = 'couple_names'; }
    }
    if (intel.reviewCount >= 3) {
      // Reviews accumulate over years, estimate ~60% response rate
      const fromReviews = Math.round(intel.reviewCount * 1.7);
      if (fromReviews > weddingsPerYear && !estimateMethod) { weddingsPerYear = fromReviews; estimateMethod = 'reviews'; }
    }
    intel.estimatedWeddingsPerYear = Math.min(weddingsPerYear, 200);
    intel.estimateMethod = estimateMethod;

    // 11. Outsourcing potential
    // Solo shooters doing 20+ weddings = likely need editing help
    // Teams doing 40+ = definitely outsourcing
    let outsourcePotential = 'LOW';
    let estimatedProjectsPerMonth = 0;
    if (weddingsPerYear >= 60) { outsourcePotential = 'VERY_HIGH'; estimatedProjectsPerMonth = Math.round(weddingsPerYear / 12); }
    else if (weddingsPerYear >= 35) { outsourcePotential = 'HIGH'; estimatedProjectsPerMonth = Math.round(weddingsPerYear * 0.7 / 12); }
    else if (weddingsPerYear >= 20) { outsourcePotential = 'MEDIUM'; estimatedProjectsPerMonth = Math.round(weddingsPerYear * 0.5 / 12); }
    else if (weddingsPerYear >= 10) { outsourcePotential = 'LOW'; estimatedProjectsPerMonth = Math.round(weddingsPerYear * 0.3 / 12); }
    else { outsourcePotential = 'MINIMAL'; estimatedProjectsPerMonth = 0; }

    intel.outsourcePotential = outsourcePotential;
    intel.estimatedProjectsPerMonth = estimatedProjectsPerMonth;
    intel.estimatedAnnualRevenue = estimatedProjectsPerMonth * 12 * (intel.pricing?.suggested || 400);

    // 12. Best outreach angle
    let outreachAngle = '';
    if (intel.isBookedUp) outreachAngle = 'They are booked up — pitch as overflow solution. "I can handle your editing so you can shoot more."';
    else if (weddingsPerYear >= 40) outreachAngle = 'High-volume shooter. Pitch time savings. "You shoot ' + weddingsPerYear + '+ weddings — let me handle all your editing."';
    else if (intel.isDestination) outreachAngle = 'Destination filmmaker. Pitch remote editing. "Focus on travel shoots, I handle post-production."';
    else if (intel.awards.length >= 2) outreachAngle = 'Award-winning filmmaker. Pitch quality match. "Your films deserve an editor who matches your level."';
    else if (weddingsPerYear >= 15) outreachAngle = 'Growing business. Pitch scaling. "You are doing ' + weddingsPerYear + ' weddings — outsourcing editing lets you book more."';
    else outreachAngle = 'Standard outreach. Lead with portfolio samples and turnaround time.';
    intel.outreachAngle = outreachAngle;

    return intel;
  },

  extractAll() {
    return {
      name: this.extractName(),
      email: this.extractEmail(),
      phone: this.extractPhone(),
      social: this.extractSocialLinks(),
      pricing: this.extractPricing(),
      hasVideo: this.extractVideoEmbeds(),
      businessIntel: this.extractBusinessIntel(),
      domain: window.location.hostname.replace(/^www\./, ''),
      url: window.location.href,
    };
  }
};
