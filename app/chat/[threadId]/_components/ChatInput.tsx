'use client';

import { FormEvent } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled = false,
}: ChatInputProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20">
      <div className="pointer-events-none bg-linear-to-t from-neutral-950 from-70% to-transparent pb-4 pt-8">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4">
          <form onSubmit={onSubmit} className="relative">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ask about Missouri legislation..."
              disabled={isLoading || disabled}
              className="w-full rounded-full border border-neutral-700 bg-neutral-900 px-5 py-3 pr-14 text-sm text-white placeholder-neutral-500 shadow-lg transition-colors focus:border-blue-500/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || disabled || !value.trim()}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#ad0636] text-white transition-all hover:bg-[#8a0529] disabled:opacity-50"
            >
              {isLoading ? (
                <svg
                  className="h-4 w-4 animate-spin"
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
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-neutral-600">
            AI can make mistakes. Verify with official sources.
          </p>
        </div>
      </div>
    </div>
  );
}
