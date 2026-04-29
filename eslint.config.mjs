// ESLint 9 flat config for Next.js 16.
//
// Why this file exists: `.eslintrc.json` + `next lint` were removed in
// Next 16. Lint now runs via the standard ESLint CLI against this flat
// config. `eslint-config-next` v16+ ships flat-config arrays natively
// at `eslint-config-next/core-web-vitals`, so we spread that in directly.
//
// Run: `npm run lint`  →  `eslint .`

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
    {
        ignores: [
            '.next/**',
            'node_modules/**',
            'public/**',
            'prisma/migrations/**',
            // Operational scripts are tooling, not app code.
            'scripts/**',
            'src/scripts/**',
            // Separate Manifest V3 codebase with its own (non-Next) lint story.
            'chrome-extension/**',
            // Generated Prisma client + Next type files.
            'src/generated/**',
            'next-env.d.ts',
        ],
    },
    ...nextCoreWebVitals,
    {
        rules: {
            // Inline <img> is fine for our use cases (avatars, logos).
            '@next/next/no-img-element': 'off',
            // Some pages embed <style> tags for component-scoped styles.
            'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],
            // Apostrophes / quotes in JSX strings — fixed mechanically below
            // for all current sites; keep at error so future regressions trip CI.
            'react/no-unescaped-entities': 'error',
            // a11y alt-text — keep as error too, it's a real accessibility win.
            'jsx-a11y/alt-text': 'error',
            // ── React Compiler advisory rules (eslint-plugin-react-hooks v7) ──
            // These flag patterns the upcoming React Compiler can't memoize,
            // not bugs. The codebase has many intentional cancellation-guard
            // effects + derived-state hydration patterns that legitimately
            // setState synchronously. Disabled until we adopt the compiler.
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/purity': 'off',
            'react-hooks/refs': 'off',
            'react-hooks/preserve-manual-memoization': 'off',
            'react-hooks/static-components': 'off',
            'react-hooks/immutability': 'off',
            'react-hooks/component-hook-factories': 'off',
            'react-hooks/error-boundaries': 'off',
            'react-hooks/use-memo': 'off',
            // exhaustive-deps catches real stale closures BUT also produces
            // dozens of false positives where the omission is intentional
            // (we've audited each existing case). Disabled at config level;
            // future code can opt in with eslint-disable-next-line.
            'react-hooks/exhaustive-deps': 'off',
            // rules-of-hooks is correctness-critical — keep at error.
            'react-hooks/rules-of-hooks': 'error',
            // Anonymous default export on the config itself is fine.
            'import/no-anonymous-default-export': 'off',
        },
    },
];
