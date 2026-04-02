document.addEventListener('DOMContentLoaded', async function() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Config panel
  var apiKeyInput = document.getElementById('apiKey');
  var crmUrlInput = document.getElementById('crmUrl');
  var saveBtn = document.getElementById('save');
  var statusEl = document.getElementById('status');
  var connEl = document.getElementById('conn-status');

  var config = await chrome.storage.sync.get(['apiKey', 'crmUrl']);
  if (config.apiKey) apiKeyInput.value = config.apiKey;
  if (config.crmUrl) crmUrlInput.value = config.crmUrl;

  saveBtn.addEventListener('click', async function() {
    var key = apiKeyInput.value.trim();
    var url = crmUrlInput.value.trim() || 'https://txb-unibox.vercel.app';
    if (!key) { statusEl.textContent = '■ ERROR: KEY REQUIRED'; statusEl.style.color = '#ff3333'; return; }
    await chrome.storage.sync.set({ apiKey: key, crmUrl: url });
    statusEl.textContent = '■ CONFIG SAVED'; statusEl.style.color = '#00ff41';
    setTimeout(function() { statusEl.textContent = ''; }, 2000);
    checkConnection(key, url, connEl);
  });

  if (config.apiKey) checkConnection(config.apiKey, config.crmUrl || 'https://txb-unibox.vercel.app', connEl);
  else { connEl.textContent = 'NO_KEY'; connEl.classList.add('err'); }

  // Scan panel
  var scanBtn = document.getElementById('scan-btn');
  var scanStatus = document.getElementById('scan-status');
  var scanResult = document.getElementById('scan-result');

  scanBtn.addEventListener('click', function() {
    scanBtn.disabled = true;
    scanBtn.textContent = '▐░ SCANNING...';
    scanStatus.textContent = 'detecting page type...';
    scanResult.innerHTML = '';

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { scanStatus.textContent = '■ ERROR: NO ACTIVE TAB'; scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page'; return; }

      var tabId = tabs[0].id;
      var tabUrl = tabs[0].url || '';

      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://')) {
        scanStatus.textContent = '■ CANNOT SCAN CHROME PAGES';
        scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
        return;
      }

      scanStatus.textContent = 'scraping contact data...';

      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: scrapePage
      }, function(results) {
        if (chrome.runtime.lastError) {
          scanStatus.textContent = '■ ERROR: ' + chrome.runtime.lastError.message;
          scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
          return;
        }

        var scraped = results && results[0] && results[0].result;
        if (!scraped) {
          scanStatus.textContent = '■ NO DATA FOUND';
          scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
          return;
        }

        scanStatus.textContent = 'querying crm database...';

        chrome.storage.sync.get(['apiKey', 'crmUrl'], function(cfg) {
          var baseUrl = cfg.crmUrl || 'https://txb-unibox.vercel.app';
          if (!cfg.apiKey) {
            renderNewLead(scraped);
            scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
            return;
          }

          fetch(baseUrl + '/api/ext/check-duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
            body: JSON.stringify({ email: scraped.email, phone: scraped.phone, domain: scraped.domain })
          })
          .then(function(res) { return res.ok ? res.json() : null; })
          .then(function(crm) {
            if (crm && crm.found) renderExisting(crm.lead, scraped);
            else renderNewLead(scraped);
            scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
            scanStatus.textContent = '';
          })
          .catch(function() {
            renderNewLead(scraped);
            scanBtn.disabled = false; scanBtn.textContent = '■ Scan Current Page';
          });
        });
      });
    });
  });

  // Auto-scan on popup open
  scanBtn.click();
});

// Injected into the active tab to scrape
function scrapePage() {
  var result = {};

  // Name
  var ogName = document.querySelector('meta[property="og:site_name"]');
  var ogTitle = document.querySelector('meta[property="og:title"]');
  var author = document.querySelector('meta[name="author"]');
  result.name = (ogName && ogName.content) || (author && author.content) || (ogTitle && ogTitle.content) || document.title.replace(/[-|–—].*$/, '').trim() || null;

  // Email
  var mailtos = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(function(a) { return a.href.replace('mailto:', '').split('?')[0].trim(); });
  if (mailtos.length > 0) result.email = mailtos[0];
  else {
    var emailMatch = document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    result.email = emailMatch ? emailMatch[0] : null;
  }

  // Phone
  var tels = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(function(a) { return a.href.replace('tel:', '').trim(); });
  if (tels.length > 0) result.phone = tels[0];
  else {
    var phoneMatch = document.body.innerText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    result.phone = (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 10) ? phoneMatch[0] : null;
  }

  // Social
  var links = Array.from(document.querySelectorAll('a[href]')).map(function(a) { return a.href; });
  result.social = {
    instagram: links.find(function(l) { return l.includes('instagram.com/'); }) || null,
    facebook: links.find(function(l) { return l.includes('facebook.com/'); }) || null,
    youtube: links.find(function(l) { return l.includes('youtube.com/'); }) || null,
    vimeo: links.find(function(l) { return l.includes('vimeo.com/'); }) || null
  };

  // Pricing with tiered intelligence
  var body = document.body.innerText;
  var priceMatches = Array.from(body.matchAll(/\$\s?(\d[\d,]*)/g)).map(function(m) { return parseInt(m[1].replace(/,/g, '')); }).filter(function(n) { return n >= 500 && n <= 100000; }).sort(function(a, b) { return a - b; });
  if (priceMatches.length > 0) {
    var min = priceMatches[0], max = priceMatches.length > 1 ? priceMatches[priceMatches.length - 1] : null;
    var mid = max ? (min + max) / 2 : min;
    var editPct, tier, affordability, confidence;
    if (mid <= 2000) { editPct = 0.18; tier = 'BUDGET'; affordability = 'LOW'; confidence = 'Price sensitive. Offer single-reel packages.'; }
    else if (mid <= 4000) { editPct = 0.14; tier = 'STANDARD'; affordability = 'MODERATE'; confidence = 'Good for highlight + reel bundles.'; }
    else if (mid <= 7000) { editPct = 0.12; tier = 'MID_TIER'; affordability = 'GOOD'; confidence = 'Sweet spot. Offer full edit packages.'; }
    else if (mid <= 12000) { editPct = 0.10; tier = 'PREMIUM'; affordability = 'HIGH'; confidence = 'Premium client. Full-service editing.'; }
    else { editPct = 0.08; tier = 'LUXURY'; affordability = 'VERY_HIGH'; confidence = 'Anchor client. White-glove service.'; }
    var sugMin = Math.round((min * editPct) / 25) * 25;
    var sugMax = max ? Math.round((max * editPct) / 25) * 25 : null;
    var sugMid = Math.round((mid * editPct) / 25) * 25;
    var packages = [];
    if (mid >= 3000) packages.push({ name: 'HLF', price: Math.round(sugMid * 0.7 / 25) * 25 });
    packages.push({ name: 'FULL EDIT', price: sugMid });
    if (mid >= 4000) packages.push({ name: 'FULL+REELS', price: Math.round(sugMid * 1.4 / 25) * 25 });
    if (mid >= 6000) packages.push({ name: 'PREMIUM', price: Math.round(sugMid * 1.8 / 25) * 25 });
    result.pricing = { min: min, max: max, tier: tier, affordability: affordability, confidence: confidence, editPercent: Math.round(editPct * 100), suggested: sugMid, suggestedRange: sugMax ? '$' + sugMin + '–$' + sugMax : '$' + sugMin, display: max ? '$' + min.toLocaleString() + '–$' + max.toLocaleString() : '$' + min.toLocaleString(), suggestedDisplay: '$' + sugMid, packages: packages };
  }

  // Location
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < scripts.length; i++) {
    try {
      var d = JSON.parse(scripts[i].innerText);
      if (d.address) { result.location = (d.address.addressLocality || '') + (d.address.addressCountry ? ', ' + d.address.addressCountry : ''); break; }
    } catch(e) {}
  }
  if (!result.location) {
    var cityState = body.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s([A-Z]{2})\b/);
    if (cityState) result.location = cityState[1].trim() + ', ' + cityState[2];
  }

  // Score
  var score = 0;
  if (result.email) score += 25;
  if (result.phone) score += 15;
  if (result.location) score += 8;
  if (result.pricing) score += 20;
  var hasVideo = !!document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], video');
  if (hasVideo) score += 15;
  var text = body.toLowerCase();
  if (['wedding','bride','groom','ceremony','bridal'].some(function(k) { return text.includes(k); })) score += 10;
  if (['videographer','filmmaker','cinematographer','highlight','reel'].some(function(k) { return text.includes(k); })) score += 7;
  result.score = Math.min(score, 100);
  result.scoreLabel = score >= 75 ? 'HOT_LEAD' : score >= 45 ? 'WARM' : 'LOW';

  result.domain = window.location.hostname.replace(/^www\./, '');
  result.url = window.location.href;
  result.hasVideo = hasVideo;

  // Business intelligence
  var bi = {};
  var allLinks = Array.from(document.querySelectorAll('a[href]')).map(function(a) { return a.href; });
  var galleryImgs = document.querySelectorAll('[class*="gallery"] img, [class*="portfolio"] img, [class*="grid"] img, [class*="work"] img');
  var coupleMatches = body.match(/\b[A-Z][a-z]+\s*[&+]\s*[A-Z][a-z]+\b/g) || [];
  bi.portfolioCount = Math.max(galleryImgs.length, coupleMatches.length);
  bi.coupleNames = coupleMatches.slice(0, 8);
  bi.videoCount = document.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"], video').length;

  var blogDates = body.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi) || [];
  bi.blogDates = blogDates.length;
  if (blogDates.length >= 2) {
    var parsed = blogDates.map(function(d) { return new Date(d); }).filter(function(d) { return !isNaN(d.getTime()); }).sort(function(a,b) { return b-a; });
    if (parsed.length >= 2) { var span = Math.max(1, (parsed[0] - parsed[parsed.length-1]) / 86400000); bi.postsPerMonth = Math.round((parsed.length / span) * 30 * 10) / 10; }
  }

  var bLower = body.toLowerCase();
  bi.isDestination = bLower.includes('destination') || bLower.includes('travel');
  bi.isBookedUp = bLower.includes('fully booked') || bLower.includes('limited availability') || bLower.includes('waitlist') || bLower.includes('currently booking');
  var bookYr = bLower.match(/booking\s*(20\d{2})/i); bi.bookingYear = bookYr ? bookYr[1] : null;
  bi.reviewCount = document.querySelectorAll('[class*="testimonial"], [class*="review"], blockquote').length;

  var awardKw = ['featured','published','as seen','award','best of','knot','weddingwire','junebug'];
  bi.awards = awardKw.filter(function(k) { return bLower.includes(k); });

  var wpy = 0;
  if (bi.portfolioCount >= 3) wpy = Math.round(bi.portfolioCount * 2.5);
  if (bi.postsPerMonth) { var fb = Math.round(bi.postsPerMonth * 12); if (fb > wpy) wpy = fb; }
  if (coupleMatches.length >= 5) { var fc = Math.round(coupleMatches.length * 2); if (fc > wpy) wpy = fc; }
  bi.estimatedWeddingsPerYear = Math.min(wpy, 200);

  if (wpy >= 60) { bi.outsourcePotential = 'VERY_HIGH'; bi.estimatedProjectsPerMonth = Math.round(wpy / 12); }
  else if (wpy >= 35) { bi.outsourcePotential = 'HIGH'; bi.estimatedProjectsPerMonth = Math.round(wpy * 0.7 / 12); }
  else if (wpy >= 20) { bi.outsourcePotential = 'MEDIUM'; bi.estimatedProjectsPerMonth = Math.round(wpy * 0.5 / 12); }
  else if (wpy >= 10) { bi.outsourcePotential = 'LOW'; bi.estimatedProjectsPerMonth = Math.round(wpy * 0.3 / 12); }
  else { bi.outsourcePotential = 'MINIMAL'; bi.estimatedProjectsPerMonth = 0; }

  bi.estimatedAnnualRevenue = bi.estimatedProjectsPerMonth * 12 * (result.pricing ? result.pricing.suggested : 400);

  if (bi.isBookedUp) bi.outreachAngle = 'Booked up — pitch as overflow editing partner.';
  else if (wpy >= 40) bi.outreachAngle = 'High-volume (' + wpy + '+ weddings). Pitch time savings.';
  else if (bi.isDestination) bi.outreachAngle = 'Destination filmmaker. Pitch remote editing.';
  else if (bi.awards.length >= 2) bi.outreachAngle = 'Award-winning. Pitch quality-matched editing.';
  else if (wpy >= 15) bi.outreachAngle = 'Growing (' + wpy + ' weddings). Pitch scaling with outsourced editing.';
  else bi.outreachAngle = 'Standard outreach. Lead with samples + turnaround.';

  result.businessIntel = bi;

  return result;
}

function esc(s) { if (!s) return ''; var d = document.createElement('span'); d.textContent = s; return d.innerHTML; }
function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : (s || ''); }
function fmtMoney(v) { return v ? '$' + Number(v).toLocaleString() : '$0'; }

function renderNewLead(data) {
  var el = document.getElementById('scan-result');
  var scoreColor = data.score >= 75 ? 'green' : data.score >= 45 ? 'amber' : 'red';
  var social = data.social || {};
  var socials = '';
  if (social.instagram) socials += '<a href="' + social.instagram + '" target="_blank" class="social-pill">IG</a>';
  if (social.facebook) socials += '<a href="' + social.facebook + '" target="_blank" class="social-pill">FB</a>';
  if (social.youtube) socials += '<a href="' + social.youtube + '" target="_blank" class="social-pill">YT</a>';
  if (social.vimeo) socials += '<a href="' + social.vimeo + '" target="_blank" class="social-pill">VM</a>';
  if (data.domain) socials += '<a href="https://' + esc(data.domain) + '" target="_blank" class="social-pill">WEB</a>';

  el.innerHTML = '<div class="result-card">' +
    '<div class="r-hdr"><div class="r-badge ' + scoreColor + '">■ ' + data.scoreLabel + '</div><div class="r-rank">RANK: ' + data.score + '</div></div>' +
    '<div class="r-grid">' +
      '<div class="r-cell"><div class="r-cl">Subject</div><div class="r-cv">' + esc(data.name) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Loc</div><div class="r-cv accent">' + esc(data.location || '—') + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Email</div><div class="r-cv ' + (data.email ? 'found' : 'missing') + '">' + (data.email ? esc(trunc(data.email, 28)) : 'NULL_PTR') + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Comms</div><div class="r-cv ' + (data.phone ? 'found' : 'missing') + '">' + (data.phone ? esc(data.phone) : 'NULL_PTR') + '</div></div>' +
    '</div>' +
    (data.pricing ? '<div class="price-box"><div><div class="pr-label">Their Packages</div><div class="pr-val">' + data.pricing.display + '</div></div><div style="text-align:right"><div class="pr-label">Our Price</div><div class="pr-suggest">' + data.pricing.suggestedDisplay + '</div></div></div>' +
    '<div class="result-card" style="padding:8px 10px;margin-bottom:8px">' +
      '<div class="r-grid">' +
        '<div class="r-cell"><div class="r-cl">Tier</div><div class="r-cv ' + (data.pricing.affordability === 'VERY_HIGH' || data.pricing.affordability === 'HIGH' ? 'green' : data.pricing.affordability === 'GOOD' ? 'accent' : 'amber') + '">' + data.pricing.tier + '</div></div>' +
        '<div class="r-cell"><div class="r-cl">Affordability</div><div class="r-cv ' + (data.pricing.affordability === 'VERY_HIGH' || data.pricing.affordability === 'HIGH' ? 'green' : data.pricing.affordability === 'GOOD' ? 'accent' : 'amber') + '">' + data.pricing.affordability + '</div></div>' +
      '</div>' +
      '<div style="font-size:7px;color:rgba(255,255,255,0.25);margin:4px 0 6px;letter-spacing:0.04em">' + esc(data.pricing.confidence) + '</div>' +
      '<div class="r-section">Suggested Packages (' + data.pricing.editPercent + '% of their price)</div>' +
      data.pricing.packages.map(function(p) {
        return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:8px;color:rgba(255,255,255,0.35);letter-spacing:0.06em">' + p.name + '</span><span style="font-size:9px;font-weight:700;color:#00ff41">$' + p.price + '</span></div>';
      }).join('') +
    '</div>' : '') +
    (socials ? '<div class="social-row">' + socials + '</div>' : '') +
    (data.businessIntel ? buildPopupIntelHTML(data.businessIntel) : '') +
    '<div class="r-btn-row"><button class="r-btn r-btn-ghost" id="btn-skip">Skip</button><button class="r-btn r-btn-primary" id="btn-commit">Commit to CRM</button></div>' +
  '</div>';

  document.getElementById('btn-commit').addEventListener('click', function() {
    chrome.runtime.sendMessage({ type: 'ADD_TO_CRM', data: data });
    this.textContent = '■ COMMITTED';
    this.style.borderColor = '#00ff41';
    this.style.color = '#00ff41';
  });
  document.getElementById('btn-skip').addEventListener('click', function() { el.innerHTML = ''; });
}

function renderExisting(lead, scraped) {
  var el = document.getElementById('scan-result');

  var fuClass = 'fu-active', fuText = '● ACTIVE';
  if (lead.followUpStatus === 'REPLY_ASAP') { fuClass = 'fu-reply'; fuText = '▲ REPLY ASAP — replied ' + lead.daysSinceLastEmail + 'd ago'; }
  else if (lead.followUpStatus === 'REPLY_SOON') { fuClass = 'fu-reply'; fuText = '● REPLY SOON — replied ' + lead.daysSinceLastEmail + 'd ago'; }
  else if (lead.followUpStatus === 'FOLLOW_UP') { fuClass = 'fu-followup'; fuText = '▲ FOLLOW UP — sent ' + lead.daysSinceLastEmail + 'd ago'; }
  else if (lead.followUpStatus === 'GOING_COLD') { fuClass = 'fu-cold'; fuText = '▲ GOING COLD — ' + lead.daysSinceLastEmail + 'd silent'; }
  else if (lead.followUpStatus === 'DORMANT') { fuClass = 'fu-dormant'; fuText = '○ DORMANT — ' + lead.daysSinceLastEmail + 'd inactive'; }
  else if (lead.daysSinceLastEmail !== null) { fuText = '● ACTIVE — ' + lead.daysSinceLastEmail + 'd ago'; }

  var emailsHtml = '';
  if (lead.recentEmails && lead.recentEmails.length > 0) {
    lead.recentEmails.forEach(function(e) {
      emailsHtml += '<div class="r-email-row"><span class="r-email-dir ' + (e.direction === 'SENT' ? 'sent' : 'recv') + '">' + (e.direction === 'SENT' ? '→' : '←') + '</span><span class="r-email-subj">' + esc(e.subject) + '</span><span class="r-email-age">' + e.daysAgo + 'd</span></div>';
    });
  }

  var projHtml = '';
  if (lead.projects && lead.projects.length > 0) {
    lead.projects.forEach(function(p) {
      projHtml += '<div class="r-proj-row"><span class="r-proj-name">' + esc(p.name) + '</span><span class="r-proj-val">' + fmtMoney(p.value) + '</span></div>';
    });
  }

  el.innerHTML = '<div class="result-card">' +
    '<div class="r-hdr"><div class="r-badge green">■ RECORD_EXISTS</div><div class="r-rank">' + esc(lead.stage) + '</div></div>' +
    '<div class="fu-bar ' + fuClass + '">' + fuText + '</div>' +
    '<div class="r-grid">' +
      '<div class="r-cell"><div class="r-cl">Subject</div><div class="r-cv">' + esc(lead.name) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Email</div><div class="r-cv found">' + esc(trunc(lead.email, 25)) + '</div></div>' +
    '</div>' +
    '<div class="r-section">Email Intelligence</div>' +
    '<div class="r-grid4">' +
      '<div class="r-cell"><div class="r-cl">Sent</div><div class="r-cv r-cv-lg blue">' + (lead.emailsSent || 0) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Recv</div><div class="r-cv r-cv-lg green">' + (lead.emailsReceived || 0) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Reply%</div><div class="r-cv r-cv-lg ' + (lead.replyRate > 30 ? 'green' : lead.replyRate > 10 ? 'amber' : 'red') + '">' + (lead.replyRate || 0) + '%</div></div>' +
      '<div class="r-cell"><div class="r-cl">Opens</div><div class="r-cv r-cv-lg purple">' + (lead.openCount || 0) + '</div></div>' +
    '</div>' +
    '<div class="r-grid3">' +
      '<div class="r-cell"><div class="r-cl">Score</div><div class="r-cv">' + (lead.leadScore || 0) + '/100</div></div>' +
      '<div class="r-cell"><div class="r-cl">Age</div><div class="r-cv">' + (lead.relationshipDays || 0) + 'd</div></div>' +
      '<div class="r-cell"><div class="r-cl">Reply</div><div class="r-cv">' + (lead.avgReplySpeed || '—') + '</div></div>' +
    '</div>' +
    (emailsHtml ? '<div class="r-section">Recent Threads</div>' + emailsHtml : '') +
    (lead.totalProjects > 0 ? '<div class="r-section">Projects (' + lead.totalProjects + ') — Rev: ' + fmtMoney(lead.totalRevenue) + '</div>' + projHtml : '') +
    '<div class="r-section">Next Deal Intelligence</div>' +
    '<div class="r-grid3">' +
      '<div class="r-cell"><div class="r-cl">Tier</div><div class="r-cv ' + (lead.clientTier === 'VIP' ? 'green' : lead.clientTier === 'PREMIUM' ? 'accent' : 'amber') + '">' + (lead.clientTier || 'NEW') + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Avg Deal</div><div class="r-cv">' + fmtMoney(lead.avgProjectValue) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Next Price</div><div class="r-cv r-cv-lg green">' + fmtMoney(lead.nextDealSuggested) + '</div></div>' +
    '</div>' +
    (lead.unpaidAmount > 0 ? '<div class="fu-bar fu-cold">UNPAID: ' + fmtMoney(lead.unpaidAmount) + ' — collect first</div>' : '') +
    '<div style="font-size:7px;color:rgba(255,255,255,0.2);margin-bottom:6px">' + esc(lead.pricingAdvice || '') + '</div>' +
    '<div class="r-btn-row"><button class="r-btn r-btn-ghost" id="btn-dismiss">Dismiss</button><button class="r-btn r-btn-primary" id="btn-open">Open Database</button></div>' +
  '</div>';

  document.getElementById('btn-open').addEventListener('click', function() { chrome.tabs.create({ url: lead.crmUrl }); });
  document.getElementById('btn-dismiss').addEventListener('click', function() { el.innerHTML = ''; });
}

function buildPopupIntelHTML(bi) {
  if (!bi || !bi.estimatedWeddingsPerYear) return '';
  var potColor = bi.outsourcePotential === 'VERY_HIGH' || bi.outsourcePotential === 'HIGH' ? 'green' : bi.outsourcePotential === 'MEDIUM' ? 'accent' : 'amber';
  return '<div class="r-section">Outsource Potential</div>' +
    '<div class="r-grid3">' +
      '<div class="r-cell"><div class="r-cl">Weddings/yr</div><div class="r-cv r-cv-lg ' + potColor + '">' + bi.estimatedWeddingsPerYear + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Proj/Mo</div><div class="r-cv r-cv-lg ' + potColor + '">' + (bi.estimatedProjectsPerMonth || 0) + '</div></div>' +
      '<div class="r-cell"><div class="r-cl">Our Rev/yr</div><div class="r-cv r-cv-lg green">' + fmtMoney(bi.estimatedAnnualRevenue) + '</div></div>' +
    '</div>' +
    (bi.outreachAngle ? '<div style="font-size:7px;color:rgba(0,255,65,0.4);margin-bottom:6px;padding:4px 6px;background:rgba(0,255,65,0.03);border:1px solid rgba(0,255,65,0.06);border-radius:3px">' + esc(bi.outreachAngle) + '</div>' : '');
}

async function checkConnection(apiKey, baseUrl, el) {
  try {
    var res = await fetch(baseUrl + '/api/ext/ping', { headers: { Authorization: 'Bearer ' + apiKey } });
    if (res.ok) { var data = await res.json(); el.textContent = '■ CONNECTED: ' + (data.user || 'OK'); el.classList.add('ok'); }
    else { el.textContent = '■ INVALID_KEY'; el.classList.add('err'); }
  } catch(e) { el.textContent = '■ NO_CONNECTION'; el.classList.add('err'); }
}
