'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-neutral-950 px-4">
      {/* Missouri seal background with spotlight animation */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="seal-container">
          <div className="seal-masked" />
        </div>
      </div>
      <main className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center text-center">
        {/* Title */}
        <div className="mb-10 rounded-3xl bg-neutral-950 px-8 py-6 shadow-[0_0_20px_10px_#0a0a0a,0_0_40px_25px_#0a0a0a,0_0_80px_50px_#0a0a0a]">
          <h1 className="mb-6 font-(family-name:--font-playfair) text-5xl font-semibold tracking-wide text-white md:text-6xl">
            SHOW-ME AI
          </h1>
          <p className="text-lg text-neutral-400">
            Search, explore, and understand Missouri legislation
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Missouri legislation..."
              disabled={isLoading}
              className="w-full rounded-full border border-neutral-700 bg-neutral-900 px-6 py-4 pr-24 text-base text-white placeholder-neutral-500 shadow-[0_0_15px_10px_#0a0a0a,0_0_40px_25px_#0a0a0a,0_0_80px_40px_#0a0a0a] transition-colors focus:border-blue-500/50 focus:outline-none disabled:opacity-50"
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
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-neutral-950 p-4 shadow-[0_0_15px_10px_#0a0a0a,0_0_40px_25px_#0a0a0a,0_0_80px_40px_#0a0a0a]">
            <p className="text-sm text-neutral-500">Try asking:</p>
            <button
              onClick={() =>
                handleSuggestedQuestion(
                  'What healthcare related bills have been introduced this session?'
                )
              }
              className="rounded-full border border-neutral-700 bg-slate-900 px-4 py-2 text-sm text-blue-300 transition-colors hover:border-neutral-600 hover:bg-slate-800"
            >
              What healthcare related bills have been introduced this session?
            </button>
            <button
              onClick={() =>
                handleSuggestedQuestion('Which bills have upcoming committee hearings?')
              }
              className="rounded-full border border-neutral-700 bg-slate-900 px-4 py-2 text-sm text-blue-300 transition-colors hover:border-neutral-600 hover:bg-slate-800"
            >
              Which bills have upcoming committee hearings?
            </button>
            <button
              onClick={() =>
                handleSuggestedQuestion('What education bills have passed the House this year?')
              }
              className="rounded-full border border-neutral-700 bg-slate-900 px-4 py-2 text-sm text-blue-300 transition-colors hover:border-neutral-600 hover:bg-slate-800"
            >
              What education bills have passed the House this year?
            </button>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 mb-8 text-center text-[13px] text-neutral-600">
        <p>
          Data from the{' '}
          <a
            href="https://house.mo.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 underline hover:text-neutral-400"
          >
            Missouri House
          </a>
          {' '}and{' '}
          <a
            href="https://senate.mo.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 underline hover:text-neutral-400"
          >
            Senate
          </a>
          . Made by Nathan Ortbals.{' '}
          <a
            href="https://github.com/nathanortbals/show-me-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 underline hover:text-neutral-400"
          >
            View project on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
