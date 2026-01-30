'use client';

interface ChatLoadingAnimationProps {
  message?: string;
}

export function ChatLoadingSpinner({ message = 'Loading...' }: ChatLoadingAnimationProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-2 text-neutral-500">
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
        <span>{message}</span>
      </div>
    </div>
  );
}

export function ChatTypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600 [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600 [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600"></div>
        </div>
      </div>
    </div>
  );
}
