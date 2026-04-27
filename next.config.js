/** @type {import('next').NextConfig} */
const nextConfig = {
    // ─── Images ──────────────────────────────────────────────────────────────
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            },
            {
                protocol: 'https',
                hostname: '*.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },

    // ─── Server External Packages ─────────────────────────────────────────────
    // Next.js 15+ / Turbopack way to tell bundler NOT to bundle these heavy
    // server-only packages — they are available natively at runtime on Vercel.
    // This replaces the old webpack `externals` approach.
    serverExternalPackages: [
        '@prisma/client',
        'prisma',
        'nodemailer',
        'imapflow',
        'mailparser',
        'googleapis',
    ],

    // ─── Compiler ────────────────────────────────────────────────────────────
    // Remove console.log in production to reduce bundle and avoid log noise on Vercel
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production'
            ? { exclude: ['error', 'warn'] }
            : false,
    },

    // ─── Server Actions ──────────────────────────────────────────────────────
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },

    // ─── Turbopack (Next.js 16 default) ──────────────────────────────────────
    turbopack: {},


    // ─── Disable Vercel Toolbar on localhost ─────────────────────────────────
    devIndicators: false,

    // ─── Security & Performance Headers ────────────────────────────────────────
    async headers() {
        const isDev = process.env.NODE_ENV !== 'production';

        const rules = [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                    // Dev only: instruct Chrome to evict ALL cached assets for
                    // this origin on every navigation. This prevents the
                    // Turbopack "module factory is not available" blank-page
                    // bug caused by the browser serving stale immutable chunks
                    // from a previous dev session where server-action IDs have
                    // since changed.
                    ...(isDev ? [{ key: 'Clear-Site-Data', value: '"cache"' }] : []),
                ],
            },
        ];

        // Production only: Next hashes every static chunk by content, so it's
        // safe to cache forever. In dev Turbopack reuses filenames with
        // changing content — never apply immutable in dev.
        if (!isDev) {
            rules.push({
                source: '/_next/static/(.*)',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            });
        }

        return rules;
    },
};

module.exports = nextConfig;
