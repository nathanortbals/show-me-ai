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
    // Person icon for legislators
    const PersonIcon = () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
      </svg>
    );

    // Document icon for bills
    const DocumentIcon = () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.286 0 .56.114.762.316l2.586 2.586a1.076 1.076 0 0 1 .316.762v9.586A1.75 1.75 0 0 1 13.25 15h-7.5A1.75 1.75 0 0 1 4 13.25V1.75Zm5.75 0h-.75v3c0 .414.336.75.75.75h3v7.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25V1.75a.25.25 0 0 1 .25-.25Z" />
      </svg>
    );

    const Icon = state.type === 'legislator' ? PersonIcon : DocumentIcon;

    return (
      <a
        {...props}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onOpenDrawer(state);
        }}
        className="inline-flex items-center gap-1 rounded-full bg-neutral-700/50 px-2 text-sm text-neutral-200 hover:bg-neutral-600/50 transition-colors cursor-pointer no-underline"
      >
        <Icon />
        {children}
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
