/** @type {import('next').NextConfig} */
const nextConfig = {
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
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                ],
            },
            {
                source: '/_next/static/(.*)',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
