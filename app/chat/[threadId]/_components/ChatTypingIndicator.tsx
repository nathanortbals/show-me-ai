'use client';

export default function ChatTypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600 [animation-delay:-0.3s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600 [animation-delay:-0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-600" />
        </div>
      </div>
    </div>
  );
}
