import { streamText, createOpenAI } from 'ai';
import { getAgent } from '@/agent/graph';
import { HumanMessage } from '@langchain/core/messages';

export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content;

    if (!userMessage) {
      return new Response('No message provided', { status: 400 });
    }

    // Run the agent (synchronous for now, will stream the final response)
    const agent = getAgent();
    const result = await agent.invoke({
      messages: [new HumanMessage(userMessage)],
    });

    const finalMessage = result.messages[result.messages.length - 1];
    const responseText = typeof finalMessage.content === 'string'
      ? finalMessage.content
      : JSON.stringify(finalMessage.content);

    // Stream the response using Vercel AI SDK
    const stream = streamText({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that formats and presents information about Missouri House bills. Present the information that was gathered clearly and concisely.',
        },
        {
          role: 'user',
          content: `Here is the information gathered: ${responseText}\n\nPlease format this information in a clear, user-friendly way.`,
        },
      ],
    });

    return stream.toTextStreamResponse();
  } catch (error) {
    console.error('Stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
