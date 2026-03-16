export interface ParsedUA {
    deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot' | 'Unknown';
    browser: string;
    os: string;
}

export function parseUserAgent(ua: string): ParsedUA {
    if (!ua || ua === 'unknown') return { deviceType: 'Unknown', browser: 'Unknown', os: 'Unknown' };

    // Detect bots
    if (/bot|crawl|spider|GoogleImageProxy|ggpht/i.test(ua)) {
        return { deviceType: 'Bot', browser: 'Bot', os: 'Bot' };
    }

    // Device type
    let deviceType: ParsedUA['deviceType'] = 'Desktop';
    if (/iPad|tablet|Kindle|PlayBook/i.test(ua)) {
        deviceType = 'Tablet';
    } else if (/Mobile|Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry/i.test(ua)) {
        deviceType = 'Mobile';
    }

    // Browser detection (order matters — more specific first)
    let browser = 'Other';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/MSIE|Trident/i.test(ua)) browser = 'IE';

    // OS detection
    let os = 'Other';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X|macOS/i.test(ua)) os = 'macOS';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';
    else if (/CrOS/i.test(ua)) os = 'ChromeOS';

    return { deviceType, browser, os };
}
