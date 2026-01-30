'use client';

import { Streamdown } from 'streamdown';
import { ComponentType } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  markdownComponents?: Record<string, ComponentType<any>>;
}

export default function ChatMessage({ role, content, markdownComponents }: ChatMessageProps) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          role === 'user' ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-100'
        }`}
      >
        {role === 'user' ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none wrap-break-word prose-p:leading-relaxed prose-pre:bg-neutral-800">
            <Streamdown components={markdownComponents}>{content}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}
