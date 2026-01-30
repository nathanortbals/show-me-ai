'use client';

import { useCallback, useMemo } from 'react';

// Drawer state type - extensible for future drawer types
export type DrawerState =
  | { type: 'bill'; id: string }
  | { type: 'legislator'; id: string }
  | { type: 'document'; id: string }
  | null;

// Parse hash to drawer state
export function parseHashToDrawerState(hash: string): DrawerState {
  if (!hash || !hash.startsWith('#')) return null;

  const [type, id] = hash.slice(1).split(':');
  if (!type || !id) return null;

  switch (type) {
    case 'bill':
      return { type: 'bill', id };
    case 'legislator':
      return { type: 'legislator', id };
    case 'document':
      return { type: 'document', id };
    default:
      return null;
  }
}

// Convert drawer state to hash
export function drawerStateToHash(state: DrawerState): string {
  if (!state) return '';
  return `#${state.type}:${state.id}`;
}

interface MarkdownLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  onOpenDrawer: (state: DrawerState) => void;
}

function MarkdownLink({
  href,
  children,
  onOpenDrawer,
  ...props
}: MarkdownLinkProps) {
  const state = href ? parseHashToDrawerState(href) : null;

  if (state) {
    return (
      <a
        {...props}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onOpenDrawer(state);
        }}
        className="inline-flex items-center gap-1 rounded-full bg-neutral-700/50 px-2 py-0.5 text-sm text-neutral-200 hover:bg-neutral-600/50 transition-colors cursor-pointer no-underline"
      >
        {children}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0"
        >
          <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
          <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
        </svg>
      </a>
    );
  }

  // External links open in new tab
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:underline"
    >
      {children}
    </a>
  );
}

// Hook to get markdown components with drawer link handling
export function useMarkdownComponents(onOpenDrawer: (state: DrawerState) => void) {
  const LinkComponent = useCallback(
    (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <MarkdownLink {...props} onOpenDrawer={onOpenDrawer} />
    ),
    [onOpenDrawer]
  );

  return useMemo(
    () => ({ a: LinkComponent }),
    [LinkComponent]
  );
}
