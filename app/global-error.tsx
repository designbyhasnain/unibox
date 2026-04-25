'use client';

// Minimal global error boundary. Next 16 has a known prerender bug for
// `/_global-error` (workUnitAsyncStorage invariant). Keeping the body trivial
// — no imports, no async, no event handlers — so the framework's prerender
// pass cannot trip the invariant.
export default function GlobalError() {
    return (
        <html>
            <body>
                <p>Something went wrong. Please refresh the page.</p>
            </body>
        </html>
    );
}
