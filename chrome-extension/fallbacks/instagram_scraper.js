(() => {
  const result = {};

  // Email from bio text
  const bioEl = document.querySelector('header section div span') || document.querySelector('[class*="biography"]');
  const bioText = bioEl ? bioEl.innerText : document.body.innerText.slice(0, 3000);
  const emailMatch = bioText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // Phone from bio
  const phoneMatch = bioText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0];

  // Website link from bio
  const linkEl = document.querySelector('a[href*="l.instagram.com"]') || document.querySelector('header a[href]:not([href*="instagram"])');
  if (linkEl) result.website = linkEl.href;

  // Name from page title or header
  const nameEl = document.querySelector('header h2') || document.querySelector('header h1');
  if (nameEl) result.name = nameEl.innerText.trim();

  // Location from bio
  const locMatch = bioText.match(/📍\s*([^\n]+)/);
  if (locMatch) result.location = locMatch[1].trim();

  return result;
})();
