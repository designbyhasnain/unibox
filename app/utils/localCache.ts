export function saveToLocalCache(key: string, data: any) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`unibox_cache_${key}`, JSON.stringify(data));
    } catch (e) {
        console.warn('Local cache save failed', e);
    }
}

export function getFromLocalCache(key: string) {
    if (typeof window === 'undefined') return null;
    try {
        const item = localStorage.getItem(`unibox_cache_${key}`);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.warn('Local cache read failed', e);
        return null;
    }
}
