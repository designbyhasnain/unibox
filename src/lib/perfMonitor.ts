import 'server-only';

// In-memory ring buffer of recent page-load samples. Per-lambda-instance —
// cold starts wipe it, which is fine: this is "is the dashboard fast right
// now?" not "compliance-grade audit log". Each sample is ~80 bytes, so 500
// samples per route × 6 tracked routes ≈ 250 KB / instance.

export interface PerfSample {
    route: string;
    ttfbMs?: number;
    lcpMs?: number;
    totalMs: number;
    userAgent: string;
    at: number; // ms epoch
}

const MAX_SAMPLES_PER_ROUTE = 500;
const TRACKED_ROUTES = new Set(['/dashboard', '/', '/opportunities', '/clients', '/jarvis', '/finance', '/intelligence']);

const buffers = new Map<string, PerfSample[]>();

export function recordSample(sample: PerfSample): void {
    if (!TRACKED_ROUTES.has(sample.route)) return;
    const list = buffers.get(sample.route) || [];
    list.push(sample);
    if (list.length > MAX_SAMPLES_PER_ROUTE) list.splice(0, list.length - MAX_SAMPLES_PER_ROUTE);
    buffers.set(sample.route, list);
}

export interface RouteStats {
    route: string;
    n: number;
    p50: number;
    p95: number;
    max: number;
    /** Most recent samples (newest last) — used to spot regression at a glance. */
    recent: number[];
    /** True if p95 exceeds the launch SLO (<1000ms for /dashboard, <1500ms otherwise). */
    breachesSlo: boolean;
}

function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
    return sorted[idx]!;
}

export function getStats(): RouteStats[] {
    const out: RouteStats[] = [];
    for (const [route, samples] of buffers.entries()) {
        if (samples.length === 0) continue;
        const totals = samples.map(s => s.totalMs).slice().sort((a, b) => a - b);
        const p50 = quantile(totals, 0.5);
        const p95 = quantile(totals, 0.95);
        const max = totals[totals.length - 1] || 0;
        const slo = route === '/dashboard' ? 1000 : 1500;
        const recent = samples.slice(-20).map(s => Math.round(s.totalMs));
        out.push({
            route,
            n: samples.length,
            p50: Math.round(p50),
            p95: Math.round(p95),
            max: Math.round(max),
            recent,
            breachesSlo: p95 > slo,
        });
    }
    out.sort((a, b) => a.route.localeCompare(b.route));
    return out;
}
