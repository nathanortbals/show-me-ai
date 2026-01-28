'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import './seal-animation.css';

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      if (!response.ok) {
        throw new Error('Failed to create chat');
      }

      const { threadId } = await response.json();

      // Redirect to chat page with initial message
      router.push(`/chat/${threadId}?message=${encodeURIComponent(input)}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-950 px-4">
      {/* Missouri seal background with spotlight animation */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="seal-container">
          <div className="seal-masked" />
        </div>
      </div>
      <main className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        {/* Logo */}
        <div className="mb-8">
          <Image src="/logo.svg" alt="Show-Me AI" width={120} height={120} />
        </div>

        {/* Title */}
        <h1 className="mb-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Show-Me AI
        </h1>
        <p className="mb-10 text-lg text-neutral-400">
          Search, explore, and understand Missouri legislation
        </p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Missouri legislation..."
              disabled={isLoading}
              className="w-full rounded-full border border-neutral-700 bg-neutral-900 px-6 py-4 pr-24 text-base text-white placeholder-neutral-500 transition-colors focus:border-blue-500/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#ad0636] text-white transition-all hover:bg-[#8a0529] disabled:opacity-50"
            >
              {isLoading ? (
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Suggested Questions */}
        <div className="mt-10">
          <p className="mb-4 text-sm text-neutral-500">Try asking:</p>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() =>
                handleSuggestedQuestion(
                  'What healthcare related bills have been introduced this session?'
                )
              }
              className="rounded-full border border-blue-800/50 bg-blue-950/30 px-4 py-2 text-sm text-blue-200 transition-colors hover:border-blue-700/50 hover:bg-blue-900/30"
            >
              What healthcare related bills have been introduced this session?
            </button>
            <button
              onClick={() =>
                handleSuggestedQuestion('Which bills have upcoming committee hearings?')
              }
              className="rounded-full border border-blue-800/50 bg-blue-950/30 px-4 py-2 text-sm text-blue-200 transition-colors hover:border-blue-700/50 hover:bg-blue-900/30"
            >
              Which bills have upcoming committee hearings?
            </button>
            <button
              onClick={() =>
                handleSuggestedQuestion('What education bills have passed the House this year?')
              }
              className="rounded-full border border-blue-800/50 bg-blue-950/30 px-4 py-2 text-sm text-blue-200 transition-colors hover:border-blue-700/50 hover:bg-blue-900/30"
            >
              What education bills have passed the House this year?
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 text-sm text-neutral-600">
          <p>
            Data from the{' '}
            <a
              href="https://house.mo.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 underline hover:text-neutral-400"
            >
              Missouri House of Representatives
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
