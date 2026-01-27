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

/**
 * System prompt for the Missouri Bills agent
 */
const systemPrompt = `You are an expert assistant for querying Missouri House of Representatives bills and legislation.

You have access to specialized tools for:
- Searching bills by topic using semantic search
- Getting detailed bill information by bill number
- Looking up legislator information
- Viewing bill timelines and legislative actions
- Finding committee hearing information
- Searching bills by session year

When users ask about bills:
1. Use semantic search for topic-based queries
2. Look up specific bill numbers when provided
3. Get legislator information when asked about sponsors
4. Show timelines for bill progress questions
5. Find hearings for committee schedule questions

Always provide clear, accurate information based on the data retrieved from your tools.
Be concise but comprehensive in your responses.`;

/**
 * Create the OpenAI model instance
 */
const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0,
});

/**
 * PostgresSaver checkpointer for persistent conversation history.
 * Setup is called lazily on first use via getAgentGraph().
 */
const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_DB_URL!);
let checkpointerInitialized = false;

/**
 * The agent graph with PostgresSaver checkpointer.
 * Used by both Next.js API routes and LangGraph Studio.
 */
export const graph = createReactAgent({
  llm: model,
  tools: getTools(),
  messageModifier: systemPrompt,
  checkpointSaver: checkpointer,
});

/**
 * Get the agent graph, ensuring the checkpointer is initialized.
 * Call this from Next.js API routes to ensure setup() has been called.
 */
export async function getAgentGraph() {
  if (!checkpointerInitialized) {
    await checkpointer.setup();
    checkpointerInitialized = true;
  }

  return graph;
}