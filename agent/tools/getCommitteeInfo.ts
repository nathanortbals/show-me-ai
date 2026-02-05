/**
 * Tool to get information about a committee with fuzzy name matching.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';

// Type for fuzzy search RPC result
interface FuzzyCommitteeResult {
  id: string;
  name: string;
  description: string | null;
  similarity_score: number;
}

/**
 * Get information about a committee
 */
export const getCommitteeInfo = tool(
  async ({ name }) => {
    const supabase = getSupabaseClient();

    // Use fuzzy search with pg_trgm for typo tolerance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fuzzyMatches, error } = await (supabase as any).rpc(
      'search_committees_fuzzy',
      {
        search_name: name,
        similarity_threshold: 0.2,
        max_results: 10,
      }
    );

    if (error) {
      console.error('Fuzzy search error:', error);
      return `No committee found matching '${name}'. Try searching with different keywords.`;
    }

    const committees =
      fuzzyMatches && (fuzzyMatches as unknown[]).length > 0
        ? (fuzzyMatches as unknown as FuzzyCommitteeResult[])
        : [];

    if (committees.length === 0) {
      return `No committee found matching '${name}'. Try searching with different keywords like "health", "budget", or "education".`;
    }

    // Get hearing counts for each committee
    const results: string[] = [];

    for (const committee of committees.slice(0, 5)) {
      // Count upcoming hearings for this committee
      const today = new Date().toISOString().split('T')[0];
      const { count: upcomingCount } = await supabase
        .from('bill_hearings')
        .select('*', { count: 'exact', head: true })
        .eq('committee_id', committee.id)
        .gte('hearing_date', today);

      // Count total hearings
      const { count: totalCount } = await supabase
        .from('bill_hearings')
        .select('*', { count: 'exact', head: true })
        .eq('committee_id', committee.id);

      const result = `- ${committee.name} (ID: ${committee.id})
  ${committee.description || 'No description available'}
  Upcoming hearings: ${upcomingCount || 0} | Total hearings: ${totalCount || 0}`;

      results.push(result);
    }

    const header =
      committees.length === 1
        ? `Found 1 committee matching '${name}':`
        : `Found ${committees.length} committees matching '${name}' (showing top ${Math.min(committees.length, 5)}):`;

    return `${header}\n\n${results.join('\n\n')}`;
  },
  {
    name: 'get_committee_info',
    description:
      'Get information about committees matching a name. Returns up to 5 matches with descriptions and hearing counts. Use this when the user asks about a specific committee or wants to find committees. Supports fuzzy matching for partial names. Examples: "What is the Health Committee?", "Find committees about education", "Show me the Budget committee"',
    schema: z.object({
      name: z.string().describe('Committee name to search for (partial names and typos tolerated)'),
    }),
  }
);
