'use client';

import { useState, useRef, useEffect, FormEvent, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ChatHeader,
  ChatInput,
  ChatMessage,
  LoadingSpinner,
  ChatTypingIndicator,
  Drawer,
  BillDrawerContent,
  useMarkdownComponents,
  parseHashToDrawerState,
  drawerStateToHash,
  type DrawerState,
} from './_components';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

  // Markdown components with drawer link handling
  const markdownComponents = useMarkdownComponents(openDrawer);

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
    <div className="flex h-screen bg-neutral-950">
      {/* Main Chat Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ChatHeader onNewChat={handleNewChat} />

        {/* Messages - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-32 pt-20">
          <div className="mx-auto max-w-3xl space-y-6">
            {isLoadingHistory && <LoadingSpinner message="Loading conversation..." />}

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
      </div>

      {/* Dynamic Drawer - sits next to chat on desktop */}
      <Drawer isOpen={!!drawerState} onClose={closeDrawer} title={drawerTitle}>
        {renderDrawerContent()}
      </Drawer>
    </div>
  );
}
