const LocationExtractor = {

  extract() {
    // Method 1: Schema.org JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.innerText);
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          const addr = schema.address || (schema['@graph'] || []).find(g => g.address)?.address;
          if (addr) {
            const city = addr.addressLocality;
            const country = addr.addressCountry;
            if (city || country) return this._format(city, country);
          }
        }
      } catch {}
    }

    // Method 2: Meta geo tags
    const geo = document.querySelector('meta[name="geo.placename"]');
    if (geo?.content) return geo.content;

    // Method 3: Google Maps embed
    const mapFrame = document.querySelector('iframe[src*="google.com/maps"]');
    if (mapFrame) {
      const qMatch = mapFrame.src.match(/[?&]q=([^&]+)/);
      if (qMatch) {
        const parts = decodeURIComponent(qMatch[1]).split(',').map(s => s.trim());
        if (parts.length >= 2) return `${parts[0]}, ${parts[parts.length - 1]}`;
      }
    }

    // Method 4: Address HTML tag
    const addrEl = document.querySelector('address');
    if (addrEl) {
      const text = addrEl.innerText.replace(/\n/g, ', ').trim();
      if (text.length > 2 && text.length < 100) return text;
    }

    // Method 5: Footer text regex (City, STATE)
    const bodyText = document.body.innerText;
    const cityState = bodyText.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s([A-Z]{2}|[A-Z][a-zA-Z]{3,15})\b/);
    if (cityState) return `${cityState[1].trim()}, ${cityState[2]}`;

    // Method 6: TLD country hint
    const tld = window.location.hostname.split('.').pop().toLowerCase();
    const tldMap = { de:'Germany', nl:'Netherlands', fr:'France', au:'Australia', uk:'United Kingdom', ca:'Canada', it:'Italy', es:'Spain', pt:'Portugal', pl:'Poland', se:'Sweden', no:'Norway', dk:'Denmark', fi:'Finland', be:'Belgium', ch:'Switzerland', at:'Austria', nz:'New Zealand', ie:'Ireland', jp:'Japan', br:'Brazil', mx:'Mexico', co:'Colombia', ar:'Argentina' };
    if (tldMap[tld]) return tldMap[tld];

    return null;
  },

  _format(city, country) {
    if (city && country) return `${city}, ${country}`;
    return city || country || null;
  }
};
