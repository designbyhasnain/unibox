'use client';

const DB_NAME = 'unibox_body_cache';
const DB_VERSION = 1;
const STORE_NAME = 'bodies';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedBody {
    messageId: string;
    html: string;
    attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
    cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'messageId' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getCachedBodies(messageIds: string[]): Promise<Map<string, CachedBody>> {
    const result = new Map<string, CachedBody>();
    if (!messageIds.length) return result;

    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const now = Date.now();

        await Promise.all(
            messageIds.map(
                (id) =>
                    new Promise<void>((res) => {
                        const req = store.get(id);
                        req.onsuccess = () => {
                            const entry: CachedBody | undefined = req.result;
                            if (entry && now - entry.cachedAt <= TTL_MS) {
                                result.set(id, entry);
                            }
                            res();
                        };
                        req.onerror = () => res();
                    })
            )
        );

        db.close();
    } catch {
        // IndexedDB unavailable (private browsing, etc.) — return empty
    }

    return result;
}

export async function setCachedBodies(
    bodies: Record<string, { html: string; attachments: any[] }>
): Promise<void> {
    const entries = Object.entries(bodies);
    if (!entries.length) return;

    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const now = Date.now();

        for (const [messageId, { html, attachments }] of entries) {
            const record: CachedBody = { messageId, html, attachments: attachments || [], cachedAt: now };
            store.put(record);
        }

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        db.close();
    } catch {
        // Silently ignore — cache is best-effort
    }
}

export async function evictExpiredBodies(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const now = Date.now();

        const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        for (const key of allKeys) {
            await new Promise<void>((resolve) => {
                const req = store.get(key);
                req.onsuccess = () => {
                    const entry: CachedBody | undefined = req.result;
                    if (entry && now - entry.cachedAt > TTL_MS) {
                        store.delete(key);
                    }
                    resolve();
                };
                req.onerror = () => resolve();
            });
        }

        await new Promise<void>((resolve) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });

        db.close();
    } catch {
        // Silently ignore
    }
}
