(function() {
  try {
    if (typeof ProspectScorer === 'undefined' || typeof Island === 'undefined' || typeof PageScraper === 'undefined') return;
    if (!document.body) return;
    if (!ProspectScorer.isFilmmakerPage()) return;

    var domain = window.location.hostname.replace(/^www\./, '');

    Island.mount();

    Island.scanning().then(function() {
      var scraped = PageScraper.extractAll();
      var location = LocationExtractor.extract();
      var score = ProspectScorer.score(scraped, location);
      var data = Object.assign({}, scraped, { location: location, score: score });

      chrome.storage.sync.get(['apiKey', 'crmUrl'], function(config) {
        var baseUrl = config.crmUrl || 'https://txb-unibox.vercel.app';

        if (!config.apiKey) {
          renderResult(data, null);
          return;
        }

        fetch(baseUrl + '/api/ext/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
          body: JSON.stringify({ email: scraped.email, phone: scraped.phone, domain: domain })
        })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(crmResult) {
          renderResult(data, crmResult);
        })
        .catch(function() {
          renderResult(data, null);
        });
      });
    });

  } catch(e) {
    console.error('[Unibox] Error:', e);
  }

  function renderResult(data, crmResult) {
    try {
      if (crmResult && crmResult.found) {
        // Merge website scraped data INTO CRM lead data
        var lead = crmResult.lead;
        // Use scraped business name if CRM has generic name
        if (data.name && (!lead.name || lead.name === 'Hello' || lead.name === 'Info' || lead.name === 'Contact')) {
          lead.name = data.name;
        }
        // Merge website pricing if CRM has no project history
        if (data.pricing && (!lead.totalRevenue || lead.totalRevenue === 0)) {
          lead.websitePricing = data.pricing;
        }
        // Merge business intel
        lead.businessIntel = data.businessIntel;
        lead.location = lead.location || data.location;
        lead.phone = lead.phone || data.phone;

        Island.showExists(lead);
      } else if (data.score.score < 30) {
        Island.showLow(data);
      } else if (!data.email && !data.phone) {
        // Try FB then IG fallback
        var fbCb = null;
        if (data.social && data.social.facebook) {
          fbCb = function() {
            chrome.runtime.sendMessage({ type: 'SCRAPE_FACEBOOK', fbUrl: data.social.facebook }, function(r) {
              if (r && (r.email || r.phone)) {
                data.email = r.email || data.email;
                data.phone = r.phone || data.phone;
                Island.updateFbFound(r.email, r.phone);
              } else if (data.social && data.social.instagram) {
                chrome.runtime.sendMessage({ type: 'SCRAPE_INSTAGRAM', igUrl: data.social.instagram }, function(ir) {
                  if (ir && (ir.email || ir.phone)) {
                    data.email = ir.email || data.email;
                    data.phone = ir.phone || data.phone;
                    Island.updateFbFound(ir.email, ir.phone);
                  }
                });
              }
            });
          };
        } else if (data.social && data.social.instagram) {
          fbCb = function() {
            chrome.runtime.sendMessage({ type: 'SCRAPE_INSTAGRAM', igUrl: data.social.instagram }, function(r) {
              if (r && (r.email || r.phone)) {
                data.email = r.email || data.email;
                data.phone = r.phone || data.phone;
                Island.updateFbFound(r.email, r.phone);
              }
            });
          };
        }
        Island.showPartial(data, fbCb, null);
      } else {
        Island.showHot(data);
      }
    } catch(e) {
      console.error('[Unibox] Render error:', e);
    }
  }
})();
