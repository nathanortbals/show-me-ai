/**
 * LangGraph agent for Missouri Bills queries.
 *
 * Implements a simple ReAct-style agent with tool calling.
 */

import { StateGraph, END, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { getTools } from './tools';

/**
 * Create the Missouri Bills LangGraph agent
 */
export function createAgent() {
  // Initialize LLM with tools
  const tools = getTools();
  const llm = new ChatOpenAI({
    model: 'gpt-4o',
    temperature: 0,
  });
  const llmWithTools = llm.bindTools(tools);

  // Define agent node
  async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [response] };
  }

  // Define conditional edge function
  function shouldContinue(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];

    // If there are no tool calls, end
    if (!('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      return 'end';
    }

    // Otherwise continue with tools
    return 'continue';
  }

  // Create graph
  const workflow = new StateGraph(MessagesAnnotation)
    // Add nodes
    .addNode('agent', callModel)
    .addNode('tools', new ToolNode(tools))
    // Set entry point
    .addEdge('__start__', 'agent')
    // Add conditional edges
    .addConditionalEdges('agent', shouldContinue, {
      continue: 'tools',
      end: END,
    })
    .addEdge('tools', 'agent');

  // Compile graph
  return workflow.compile();
}

/**
 * Run the agent with a user query
 */
export async function runAgent(query: string) {
  const agent = createAgent();

  // Run agent
  const result = await agent.invoke({
    messages: [new HumanMessage(query)],
  });

  // Extract final response
  const messages = result.messages;
  const finalMessage = messages[messages.length - 1];

  return finalMessage.content;
}

// Singleton agent instance for reuse
let agentInstance: ReturnType<typeof createAgent> | null = null;

export function getAgent() {
  if (!agentInstance) {
    agentInstance = createAgent();
  }
  return agentInstance;
}
