const ProspectScorer = {

  score(data, location) {
    let score = 0;
    const signals = [];

    if (data.email) { score += 25; signals.push('email'); }
    if (data.phone) { score += 15; signals.push('phone'); }
    if (location) { score += 8; signals.push('location'); }
    if (data.pricing) { score += 20; signals.push('pricing'); }
    if (data.hasVideo) { score += 15; signals.push('video'); }

    const bodyText = (document.body.innerText + document.title).toLowerCase();
    if (['wedding','bride','groom','ceremony','bridal'].some(k => bodyText.includes(k))) { score += 10; signals.push('wedding'); }
    if (['videographer','filmmaker','cinematographer','highlight','reel','footage'].some(k => bodyText.includes(k))) { score += 7; signals.push('filmmaker'); }

    return {
      score: Math.min(score, 100),
      signals,
      label: score >= 75 ? 'hot' : score >= 45 ? 'warm' : 'low',
      labelText: score >= 75 ? 'HOT_LEAD' : score >= 45 ? 'WARM // INCOMPLETE' : 'MISMATCH_DETECTED'
    };
  },

  isFilmmakerPage() {
    const text = (document.body.innerText + document.title + document.head.innerHTML).toLowerCase();
    const triggers = ['wedding','videographer','filmmaker','cinematographer','highlight reel','bridal film','wedding film','video package','photo + video','photo and video','elopement film'];
    const score = triggers.filter(t => text.includes(t)).length;
    const hasVideoEmbed = !!document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], video');
    const hasPricing = /[$€£]\s?\d{3,}/.test(text);
    return score >= 1 || (hasVideoEmbed && hasPricing);
  }
};
