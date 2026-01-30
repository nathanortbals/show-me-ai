/**
 * Tool to get information about a legislator with fuzzy name matching.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';

// Type for fuzzy search RPC result
interface FuzzyLegislatorResult {
  id: string;
  name: string;
  legislator_type: string | null;
  party_affiliation: string | null;
  year_elected: number | null;
  years_served: number | null;
  is_active: boolean;
  similarity_score: number;
}

// Type for session legislator with session info
interface SessionLegislatorWithSession {
  district: string;
  sessions: {
    year: number;
    session_code: string;
  } | null;
}

/**
 * Get information about a legislator
 */
export const getLegislatorInfo = tool(
  async ({ name }) => {
    const supabase = getSupabaseClient();

    // Use fuzzy search with pg_trgm for typo tolerance
    // Note: search_legislators_fuzzy is a custom RPC function not in auto-generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fuzzyMatches, error } = await (supabase as any).rpc(
      'search_legislators_fuzzy',
      {
        search_name: name,
        similarity_threshold: 0.3,
        max_results: 10,
        active_only: false,
      }
    );

    if (error) {
      console.error('Fuzzy search error:', error);
      return `No legislator found matching '${name}'. Try searching with a different spelling or just the last name.`;
    }

    const legislators = fuzzyMatches && (fuzzyMatches as unknown[]).length > 0
      ? (fuzzyMatches as unknown as FuzzyLegislatorResult[])
      : [];

    if (legislators.length === 0) {
      return `No legislator found matching '${name}'. Try searching with a different spelling or just the last name.`;
    }

    if (legislators.length > 1) {
      const names = legislators.slice(0, 10).map((leg) => leg.name);
      return `Multiple legislators found: ${names.join(', ')}. Please be more specific.`;
    }

    const leg = legislators[0];

    // Get current district from most recent session
    const { data: sessionLegData } = await supabase
      .from('session_legislators')
      .select(`
        district,
        sessions(year, session_code)
      `)
      .eq('legislator_id', leg.id)
      .order('sessions(year)', { ascending: false })
      .limit(1);

    const typedSessionLeg = sessionLegData as unknown as SessionLegislatorWithSession[];
    const currentDistrict = typedSessionLeg?.[0]?.district;
    const sessionInfo = typedSessionLeg?.[0]?.sessions;

    const result = `ID: ${leg.id}
Name: ${leg.name}
District: ${currentDistrict ? `${currentDistrict}${sessionInfo ? ` (${sessionInfo.year} ${sessionInfo.session_code})` : ''}` : 'N/A'}
Type: ${leg.legislator_type || 'N/A'}
Party: ${leg.party_affiliation || 'N/A'}
Year Elected: ${leg.year_elected || 'N/A'}
Years Served: ${leg.years_served || 'N/A'}
Status: ${leg.is_active ? 'Active' : 'Inactive'}`;

    return result.trim();
  },
  {
    name: 'get_legislator_info',
    description:
      'Get information about a legislator including their district. Use this when the user asks about a specific legislator or representative. Supports fuzzy matching for misspelled names. Examples: "Who is Rep. Smith?", "Tell me about Jane Doe", "Who represents district 42?"',
    schema: z.object({
      name: z.string().describe('Legislator name (full or partial, typos tolerated)'),
    }),
  }
);
