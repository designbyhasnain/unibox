'use client';

import React from 'react';
import Link from 'next/link';

/**
 * The one-true client-name affordance — clicking any contact name anywhere
 * in the app routes to `/clients/${contactId}`. No popups, no panels.
 *
 * Drop-in replacement for `<span>{name}</span>`:
 *   <ContactLink contactId={c.id}>{c.name}</ContactLink>
 *
 * Rules:
 * - When `contactId` is null/undefined, falls through to a plain <span>.
 *   System threads (Mailsuite notifications, etc.) have no contact link,
 *   so we never render a broken `/clients/null` URL.
 * - Click events stop propagation by default so the parent row's own
 *   click handler (e.g. "select this email to read") doesn't also fire.
 *   Pass `stopPropagation={false}` to opt out.
 * - Inherits the surrounding text color so it doesn't visually shout —
 *   hover-underline gives the affordance.
 */
type Props = {
    contactId: string | null | undefined;
    children: React.ReactNode;
    /** Override the default route. Useful for opening detail in a new tab. */
    href?: string;
    /** Default true — prevents the click from also triggering parent row handlers. */
    stopPropagation?: boolean;
    /** Forwarded to <a>. */
    title?: string;
    className?: string;
    style?: React.CSSProperties;
    /** Open in a new tab — handy for compose-modal "open profile" affordances. */
    newTab?: boolean;
};

export default function ContactLink({
    contactId,
    children,
    href,
    stopPropagation = true,
    title,
    className,
    style,
    newTab = false,
}: Props) {
    if (!contactId) {
        return (
            <span className={className} style={style} title={title}>
                {children}
            </span>
        );
    }

    const computed = href ?? `/clients/${contactId}`;

    return (
        <Link
            href={computed}
            prefetch
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
            target={newTab ? '_blank' : undefined}
            rel={newTab ? 'noopener noreferrer' : undefined}
            title={title}
            className={className}
            style={{
                color: 'inherit',
                textDecoration: 'none',
                ...style,
            }}
        >
            {children}
        </Link>
    );
}
