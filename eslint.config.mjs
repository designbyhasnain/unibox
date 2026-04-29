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
            // Quiet some noisy warnings on this codebase — keep them as warn.
            'react-hooks/exhaustive-deps': 'warn',
            'react/no-unescaped-entities': 'warn',
            'jsx-a11y/alt-text': 'warn',
            // ── React 19 / react-hooks v7 / React Compiler strict rules ──
            // These are NEW errors-by-default in eslint-plugin-react-hooks 7
            // that flag patterns the React Compiler cannot optimize. The
            // codebase has many existing useEffects that legitimately call
            // setState synchronously (cancellation guards, derived-state
            // hydration). Downgrading to `warn` so lint runs clean; we'll
            // migrate problem hooks incrementally.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/preserve-manual-memoization': 'warn',
            'react-hooks/static-components': 'warn',
            'react-hooks/immutability': 'warn',
            'react-hooks/component-hook-factories': 'warn',
            'react-hooks/error-boundaries': 'warn',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/use-memo': 'warn',
            // Anonymous default export on the config itself is fine.
            'import/no-anonymous-default-export': 'off',
        },
    },
];
