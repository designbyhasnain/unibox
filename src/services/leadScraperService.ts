import 'server-only';
import * as cheerio from 'cheerio';

export type ScrapedLead = {
    url: string;
    domain: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    pricing: { found: boolean; mentions: string[] } | null;
    social: { instagram?: string; facebook?: string; youtube?: string; linkedin?: string; vimeo?: string } | null;
    score: number;
    scoreLabel: string;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

const HIGH_VALUE_KEYWORDS = ['wedding', 'videographer', 'cinematographer', 'wedding films', 'wedding video', 'bridal'];
const MEDIUM_VALUE_KEYWORDS = ['film', 'films', 'cinema', 'production', 'video production', 'event video', 'commercial'];
const LOW_VALUE_KEYWORDS = ['photography', 'photographer', 'media', 'studio', 'creative'];
const PRICING_KEYWORDS = ['pricing', 'packages', 'rates', 'starting at', 'investment', 'quote', 'book now', '$'];
const NEGATIVE_KEYWORDS = ['shutterstock', 'getty images', 'stock footage', 'template', 'marketplace'];

function extractDomain(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function countMatches(text: string, keywords: string[]): { count: number; found: string[] } {
    const lower = text.toLowerCase();
    const found: string[] = [];
    let count = 0;
    for (const kw of keywords) {
        const matches = lower.split(kw).length - 1;
        if (matches > 0) {
            count += matches;
            found.push(kw);
        }
    }
    return { count, found };
}

function scoreLead(text: string): { score: number; label: string } {
    const high = countMatches(text, HIGH_VALUE_KEYWORDS);
    const medium = countMatches(text, MEDIUM_VALUE_KEYWORDS);
    const low = countMatches(text, LOW_VALUE_KEYWORDS);
    const pricing = countMatches(text, PRICING_KEYWORDS);
    const negative = countMatches(text, NEGATIVE_KEYWORDS);

    let score = 0;
    score += Math.min(high.count * 15, 60);
    score += Math.min(medium.count * 8, 30);
    score += Math.min(low.count * 3, 15);
    score += Math.min(pricing.count * 5, 20);
    score -= negative.count * 25;
    score = Math.max(0, Math.min(100, score));

    let label = 'Cold';
    if (score >= 75) label = 'Hot';
    else if (score >= 50) label = 'Warm';
    else if (score >= 25) label = 'Lukewarm';

    return { score, label };
}

function extractSocial($: cheerio.CheerioAPI): ScrapedLead['social'] {
    const social: ScrapedLead['social'] = {};
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!social.instagram && /instagram\.com/i.test(href)) social.instagram = href;
        if (!social.facebook && /facebook\.com/i.test(href)) social.facebook = href;
        if (!social.youtube && /youtube\.com/i.test(href)) social.youtube = href;
        if (!social.linkedin && /linkedin\.com/i.test(href)) social.linkedin = href;
        if (!social.vimeo && /vimeo\.com/i.test(href)) social.vimeo = href;
    });
    return Object.keys(social).length > 0 ? social : null;
}

export async function scrapeUrl(url: string): Promise<ScrapedLead> {
    const domain = extractDomain(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let html: string;
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (compatible; UniboxLeadBot/1.0; +https://unibox.app/bot)',
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
    } finally {
        clearTimeout(timeout);
    }

    const $ = cheerio.load(html);
    $('script, style, noscript').remove();

    const title = $('title').text().trim() || null;
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const fullText = `${title ?? ''} ${bodyText}`;

    const mailtoEmails: string[] = [];
    $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const addr = (href.replace(/^mailto:/, '').split('?')[0] || '').trim();
        if (addr) mailtoEmails.push(addr);
    });

    const emailMatches = fullText.match(EMAIL_REGEX) || [];
    const allEmails = [...new Set([...mailtoEmails, ...emailMatches])]
        .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e))
        .filter((e) => !/sentry|wixpress|example\.com/i.test(e));
    const email = allEmails[0] || null;

    const phoneMatches = fullText.match(PHONE_REGEX) || [];
    const phone = phoneMatches[0]?.trim() || null;

    const pricingMatch = countMatches(fullText, PRICING_KEYWORDS);
    const pricing = pricingMatch.count > 0 ? { found: true, mentions: pricingMatch.found } : null;

    const social = extractSocial($);
    const { score, label } = scoreLead(fullText);

    return {
        url,
        domain,
        name: title,
        email,
        phone,
        location: null,
        pricing,
        social,
        score,
        scoreLabel: label,
    };
}
