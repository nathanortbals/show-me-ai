'use client';

import Link from 'next/link';

interface ChatHeaderProps {
  onNewChat: () => void;
}

export default function ChatHeader({ onNewChat }: ChatHeaderProps) {
  return (
    <div className="fixed left-0 top-0 z-20 flex items-center gap-4 px-6 py-4">
      <Link href="/">
        <h1 className="font-(family-name:--font-playfair) text-xl leading-none font-semibold tracking-wide text-white hover:text-neutral-300 transition-colors">
          SHOW-ME AI
        </h1>
      </Link>
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950/80 px-3 py-1.5 text-sm text-neutral-300 backdrop-blur-sm transition-colors hover:border-neutral-600 hover:bg-neutral-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New
      </button>
    </div>
  );
}
