import { getAgent } from '@/agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import { LangChainAdapter } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content;

    if (!userMessage) {
      return new Response('No message provided', { status: 400 });
    }

    // Get agent and stream response
    const agent = getAgent();

    // Stream the agent's response
    const stream = await agent.stream({
      messages: [new HumanMessage(userMessage)],
    });

    // Convert LangChain stream to Vercel AI SDK format
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // Extract messages from each chunk
            const messages = chunk.messages || [];
            if (messages.length > 0) {
              const lastMessage = messages[messages.length - 1];

              // Stream content tokens
              if (lastMessage.content) {
                const content = typeof lastMessage.content === 'string'
                  ? lastMessage.content
                  : JSON.stringify(lastMessage.content);

                // Send as SSE format for AI SDK compatibility
                const data = `0:${JSON.stringify(content)}\n`;
                controller.enqueue(encoder.encode(data));
              }
            }
          }
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      },
    });
  } catch (error) {
    console.error('Agent error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
