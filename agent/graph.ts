/**
 * LangGraph agent for Missouri Bills queries.
 *
 * Uses createReactAgent from @langchain/langgraph/prebuilt for agent creation.
 *
 * TODO: Switch back to `createAgent` from 'langchain' once the PostgresSaver
 * circular JSON serialization bug is fixed.
 * See: https://github.com/langchain-ai/langgraphjs/issues/1808
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { getTools } from './tools';
import { buildSystemPrompt } from './prompt';

/**
 * Get the agent graph with session-aware prompt.
 *
 * Used by both Next.js API routes and LangGraph Studio.
 */
export async function getAgentGraph() {
  const model = new ChatOpenAI({
    model: 'gpt-4o',
    temperature: 0,
  });

  const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_DB_URL!);
  await checkpointer.setup();

  return createReactAgent({
    llm: model,
    tools: getTools(),
    messageModifier: await buildSystemPrompt(),
    checkpointSaver: checkpointer,
  });
}
