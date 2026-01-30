/**
 * System prompt builder for the Missouri Bills AI agent.
 *
 * Builds a dynamic prompt that includes the current legislative session context.
 */

import { getSupabaseClient } from '@/database/client';

/**
 * Session info for the system prompt
 */
interface SessionInfo {
  year: number;
  sessionCode: string;
  isActive: boolean;
}

/**
 * Get the latest legislative session from the database
 */
async function getLatestSession(): Promise<SessionInfo | null> {
  try {
    const supabase = getSupabaseClient();

    // Get the most recent session by year and session_code
    // Session codes: R (Regular), S1 (Special 1), S2 (Special 2)
    // Order by year DESC, then by session_code to get R before S sessions for same year
    const { data, error } = await supabase
      .from('sessions')
      .select('year, session_code, end_date')
      .order('year', { ascending: false })
      .order('session_code', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('Failed to get latest session:', error);
      return null;
    }

    // Determine if session is active (no end_date or end_date is in the future)
    const isActive = !data.end_date || new Date(data.end_date) > new Date();

    return {
      year: data.year,
      sessionCode: data.session_code,
      isActive,
    };
  } catch (error) {
    console.error('Error fetching latest session:', error);
    return null;
  }
}

/**
 * Build the system prompt with the latest session context from the database
 */
export async function buildSystemPrompt(): Promise<string> {
  const session = await getLatestSession();

  const sessionContext = session
    ? `
## Default Session Context

The current/latest legislative session is **${session.year} ${session.sessionCode === 'R' ? 'Regular Session' : `Special Session ${session.sessionCode}`}**${session.isActive ? ' (ACTIVE)' : ' (ENDED)'}.

Unless the user explicitly specifies a different year or session, always assume they are asking about the ${session.year} ${session.sessionCode} session. When using tools that accept sessionYear or sessionCode parameters, default to:
- sessionYear: ${session.year}
- sessionCode: "${session.sessionCode}"
`
    : '';

  return `You are an expert assistant for querying Missouri House of Representatives bills and legislation.

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
Be concise but comprehensive in your responses.
${sessionContext}
## Formatting Guidelines

Always format your responses using Markdown:
- Use bullet points or numbered lists for multiple items
- Use headers (##, ###) to organize longer responses
- Use tables when comparing multiple bills or showing structured data
- Use \`code formatting\` for specific legal references or section numbers

## Clickable Bill References

When referencing bills in your responses, ALWAYS use clickable markdown links with this format:
\`[BILL_NUMBER](#bill:BILL_ID)\`

For example, if a tool returns "HB 1234 (ID: 550e8400-e29b-41d4-a716-446655440000)", you should write:
\`[HB 1234](#bill:550e8400-e29b-41d4-a716-446655440000)\`

This creates a clickable link that opens a detail panel for the bill. Always use this format when:
- Listing bill search results
- Mentioning specific bills in your explanation
- Referencing bills returned by any tool

Never write just "HB 1234" or "**HB 1234**" - always use the link format with the bill ID.`;
}
