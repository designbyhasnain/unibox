(() => {
  const result = {};

  const emailLink = document.querySelector('a[href^="mailto:"]');
  if (emailLink) result.email = emailLink.href.replace('mailto:', '').split('?')[0].trim();

  if (!result.email) {
    const searchArea = document.body.innerText.slice(0, 5000);
    const emailMatch = searchArea.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) result.email = emailMatch[0];
  }

  const phoneLink = document.querySelector('a[href^="tel:"]');
  if (phoneLink) result.phone = phoneLink.href.replace('tel:', '').trim();

  const websiteLink = [...document.querySelectorAll('a')].find(a =>
    a.innerText.includes('.com') || a.innerText.includes('.co') || a.innerText.includes('.film')
  );
  if (websiteLink) result.website = websiteLink.href;

  return result;
})();
