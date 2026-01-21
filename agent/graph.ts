/**
 * LangGraph agent for Missouri Bills queries.
 *
 * Uses LangChain's createAgent helper for simplified agent creation.
 */

import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
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
 * Create the Missouri Bills agent using LangChain's createAgent helper
 */
const checkpointer = new MemorySaver();

const agent = createAgent({
  model: 'gpt-4o',
  systemPrompt,
  tools: getTools(),
  checkpointer,
});

// Export the compiled graph for LangGraph Studio
// createAgent returns a ReactAgent with a .graph property containing the CompiledStateGraph
export default agent.graph;

// Also export named for backward compatibility
export const graph = agent.graph;

/**
 * Get the agent instance (returns the ReactAgent, not just the graph)
 * Use this for API routes that need to call .invoke() or .stream()
 */
export function getAgent() {
  return agent;
}

/**
 * Run the agent with a user query (backward compatibility)
 */
export async function runAgent(query: string) {
  const result = await agent.invoke({
    messages: [{ role: 'user', content: query }],
  });

  // Extract final response
  const messages = result.messages;
  const finalMessage = messages[messages.length - 1];

  return finalMessage.content;
}
