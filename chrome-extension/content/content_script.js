(function() {
  try {
    if (typeof ProspectScorer === 'undefined' || typeof Island === 'undefined' || typeof PageScraper === 'undefined') return;
    if (!document.body) return;
    if (!ProspectScorer.isFilmmakerPage()) return;

    console.log('[Unibox] Page detected, mounting...');
    var domain = window.location.hostname.replace(/^www\./, '');

    Island.mount();
    console.log('[Unibox] Island mounted');

    Island.scanning().then(function() {
      var scraped = PageScraper.extractAll();
      var location = LocationExtractor.extract();
      var score = ProspectScorer.score(scraped, location);
      var data = Object.assign({}, scraped, { location: location, score: score });

      console.log('[Unibox] Scraped:', data.name, '| email:', data.email, '| phone:', data.phone, '| score:', score.score);

      chrome.storage.sync.get(['apiKey', 'crmUrl'], function(config) {
        var baseUrl = config.crmUrl || 'https://txb-unibox.vercel.app';

        if (!config.apiKey) {
          renderResult(data, null, baseUrl);
          return;
        }

        fetch(baseUrl + '/api/ext/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
          body: JSON.stringify({ email: scraped.email, phone: scraped.phone, domain: domain })
        })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(crmResult) {
          console.log('[Unibox] CRM:', crmResult ? (crmResult.found ? 'EXISTS (' + crmResult.lead.emailsSent + ' sent, ' + crmResult.lead.emailsReceived + ' received)' : 'NEW') : 'no response');
          renderResult(data, crmResult, baseUrl);
        })
        .catch(function(e) {
          console.warn('[Unibox] CRM check failed:', e);
          renderResult(data, null, baseUrl);
        });
      });
    });

  } catch(e) {
    console.error('[Unibox] Error:', e);
  }

  function renderResult(data, crmResult) {
    try {
      if (crmResult && crmResult.found) {
        console.log('[Unibox] → RECORD_EXISTS');
        Island.showExists(crmResult.lead);
      } else if (data.score.score < 30) {
        console.log('[Unibox] → LOW_CONFIDENCE');
        Island.showLow(data);
      } else if (!data.email && !data.phone) {
        console.log('[Unibox] → PARTIAL (missing contact)');
        var fbCb = null;
        var igCb = null;

        // Try Facebook fallback
        if (data.social && data.social.facebook) {
          fbCb = function() {
            chrome.runtime.sendMessage({
              type: 'SCRAPE_FACEBOOK',
              fbUrl: data.social.facebook
            }, function(response) {
              if (response && (response.email || response.phone)) {
                data.email = response.email || data.email;
                data.phone = response.phone || data.phone;
                Island.updateFbFound(response.email, response.phone);
                console.log('[Unibox] FB found:', response.email, response.phone);
              } else if (data.social && data.social.instagram) {
                // FB failed, try Instagram
                chrome.runtime.sendMessage({
                  type: 'SCRAPE_INSTAGRAM',
                  igUrl: data.social.instagram
                }, function(igResponse) {
                  if (igResponse && (igResponse.email || igResponse.phone)) {
                    data.email = igResponse.email || data.email;
                    data.phone = igResponse.phone || data.phone;
                    Island.updateFbFound(igResponse.email, igResponse.phone);
                    console.log('[Unibox] IG found:', igResponse.email, igResponse.phone);
                  }
                });
              }
            });
          };
        } else if (data.social && data.social.instagram) {
          // No Facebook, try Instagram directly
          fbCb = function() {
            chrome.runtime.sendMessage({
              type: 'SCRAPE_INSTAGRAM',
              igUrl: data.social.instagram
            }, function(response) {
              if (response && (response.email || response.phone)) {
                data.email = response.email || data.email;
                data.phone = response.phone || data.phone;
                Island.updateFbFound(response.email, response.phone);
                console.log('[Unibox] IG found:', response.email, response.phone);
              }
            });
          };
        }

        Island.showPartial(data, fbCb, igCb);
      } else {
        console.log('[Unibox] → HOT_LEAD');
        Island.showHot(data);
      }
    } catch(e) {
      console.error('[Unibox] Render error:', e);
    }
  }
})();
