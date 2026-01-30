'use client';

import { useState, useRef, useEffect, FormEvent, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ChatHeader,
  ChatInput,
  ChatMessage,
  ChatLoadingSpinner,
  ChatTypingIndicator,
  Drawer,
  BillDrawerContent,
} from './_components';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Drawer state type - extensible for future drawer types
type DrawerState =
  | { type: 'bill'; id: string }
  | { type: 'legislator'; id: string }
  | { type: 'document'; id: string }
  | null;

// Parse hash to drawer state
function parseHashToDrawerState(hash: string): DrawerState {
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
function drawerStateToHash(state: DrawerState): string {
  if (!state) return '';
  return `#${state.type}:${state.id}`;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const threadId = params.threadId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [drawerTitle, setDrawerTitle] = useState<string>('Details');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);
  const historyLoadedRef = useRef(false);

  // Handle hash changes (including initial load)
  useEffect(() => {
    const handleHashChange = () => {
      const state = parseHashToDrawerState(window.location.hash);
      setDrawerState(state);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Close drawer and clear hash
  const closeDrawer = useCallback(() => {
    setDrawerState(null);
    setDrawerTitle('Details');
    history.pushState(null, '', window.location.pathname + window.location.search);
  }, []);

  // Open drawer with state
  const openDrawer = useCallback((state: DrawerState) => {
    setDrawerState(state);
    const hash = drawerStateToHash(state);
    history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, []);

  // Custom link component for Streamdown that handles entity references
  const MarkdownLink = useCallback(
    ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const state = href ? parseHashToDrawerState(href) : null;

      if (state) {
        return (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              openDrawer(state);
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
    },
    [openDrawer]
  );

  const markdownComponents = useMemo(() => ({ a: MarkdownLink }), [MarkdownLink]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update page title based on first user message
  useEffect(() => {
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      const truncated =
        firstUserMessage.content.length > 50
          ? firstUserMessage.content.substring(0, 50) + '...'
          : firstUserMessage.content;
      document.title = `${truncated} | Show-Me AI`;
    }
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    const initialMessage = searchParams.get('message');
    if (initialMessage || historyLoadedRef.current) {
      setIsLoadingHistory(false);
      return;
    }

    historyLoadedRef.current = true;

    async function loadHistory() {
      try {
        const response = await fetch(`/api/chat/${threadId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadHistory();
  }, [threadId, searchParams]);

  // Send a message
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim()) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, threadId }),
        });

        if (!response.ok) {
          throw new Error('Failed to get response');
        }

        const assistantMessageId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
        };

        setMessages((prev) => [...prev, assistantMessage]);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No reader available');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      } catch (error) {
        console.error('Chat error:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [threadId]
  );

  // Handle initial message from URL
  useEffect(() => {
    const initialMessage = searchParams.get('message');
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      router.replace(`/chat/${threadId}`, { scroll: false });
      sendMessage(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, threadId]);

  const handleNewChat = () => {
    router.push('/');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const messageText = input;
    setInput('');
    await sendMessage(messageText);
  };

  // Render drawer content based on state
  const renderDrawerContent = () => {
    if (!drawerState) return null;

    switch (drawerState.type) {
      case 'bill':
        return <BillDrawerContent billId={drawerState.id} onTitleChange={setDrawerTitle} />;
      case 'legislator':
        // Future: LegislatorDrawerContent
        return <div className="text-neutral-400">Legislator details coming soon...</div>;
      case 'document':
        // Future: DocumentDrawerContent
        return <div className="text-neutral-400">Document details coming soon...</div>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950">
      <ChatHeader onNewChat={handleNewChat} />

      {/* Messages */}
      <div className="px-4 pb-32 pt-20">
        <div className="mx-auto max-w-3xl space-y-6">
          {isLoadingHistory && <ChatLoadingSpinner message="Loading conversation..." />}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              markdownComponents={markdownComponents}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' && <ChatTypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        disabled={isLoadingHistory}
      />

      {/* Dynamic Drawer */}
      <Drawer isOpen={!!drawerState} onClose={closeDrawer} title={drawerTitle}>
        {renderDrawerContent()}
      </Drawer>
    </div>
  );
}
