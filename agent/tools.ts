/**
 * Tools for the Missouri Bills AI agent.
 *
 * Provides functions for semantic search, bill lookup, and metadata queries.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  SupabaseVectorStore,
  SupabaseFilterRPCCall,
} from '@langchain/community/vectorstores/supabase';
import { getSupabaseClient } from '@/ingestion/database/client';
import { Database } from '@/database/types';

// Type aliases for database tables
type Bill = Database['public']['Tables']['bills']['Row'];
type Legislator = Database['public']['Tables']['legislators']['Row'];
type BillAction = Database['public']['Tables']['bill_actions']['Row'];

// Type for RPC function return
interface BillEmbeddingMatch {
  id: string;
  content: string;
  metadata: {
    bill_id?: string;
    bill_number?: string;
    session_year?: number;
    session_code?: string;
    primary_sponsor_name?: string;
    cosponsor_names?: string[];
    committee_names?: string[];
    content_type?: string;
  };
  embedding: string;
  similarity: number;
}

// Type for bill query with session relation
interface BillWithSession extends Omit<Bill, 'sessions'> {
  sessions: {
    year: number;
    session_code: string;
  } | null;
}

// Type for sponsor query with nested relations
interface SponsorWithLegislator {
  is_primary: boolean;
  session_legislators: {
    legislators: {
      name: string;
      party_affiliation: string | null;
    };
  } | null;
}

// Type for hearing query with nested relations
interface HearingWithRelations {
  hearing_date: string | null;
  hearing_time: string | null;
  hearing_time_text: string | null;
  location: string | null;
  bills: {
    bill_number: string;
    sessions: {
      year: number;
      session_code: string;
    } | null;
  } | null;
  committees: {
    name: string;
  } | null;
}

// Normalize bill number to match database format (e.g., "HB1366" -> "HB 1366")
function normalizeBillNumber(billNumber: string): string {
  const cleaned = billNumber.toUpperCase().trim();
  return cleaned.replace(/^([A-Z]+)(\d+)$/, '$1 $2');
}

/**
 * Search for bills using semantic similarity with optional metadata filters
 */
export const searchBillsSemantic = tool(
  async ({ query, limit = 5, sessionYear, sessionCode, sponsorName, committeeName }) => {
    const supabase = getSupabaseClient();

    // Initialize embeddings and vector store
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
    });

    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: 'bill_embeddings',
      queryName: 'match_bill_embeddings',
    });

    // Build metadata filter function
    // With function-type filters, PostgREST applies filters AFTER the RPC returns results
    // LangChain automatically adds .limit(k) after our filter function returns
    const filter: SupabaseFilterRPCCall = (rpc) => {
      let query = rpc;

      // Filter by session year
      if (sessionYear) {
        query = query.filter('metadata->session_year', 'eq', sessionYear);
      }

      // Filter by session code
      if (sessionCode) {
        query = query.filter('metadata->>session_code', 'eq', sessionCode);
      }

      // Filter by sponsor name (partial match with ILIKE)
      if (sponsorName) {
        query = query.ilike('metadata->>primary_sponsor_name', `%${sponsorName}%`);
      }

      // Filter by committee name (check if array contains value)
      // Note: This uses JSONB containment - checks if committee_names array includes the value
      if (committeeName) {
        query = query.contains('metadata->committee_names', JSON.stringify([committeeName]));
      }

      return query;
    };

    try {
      // Perform similarity search with score
      const results = await vectorStore.similaritySearchWithScore(
        query,
        limit,
        filter
      );

      if (results.length === 0) {
        return 'No bills found matching that query with the given filters.';
      }

      // Format results
      const formattedResults = results.map(([doc, score]) => {
        const meta = (doc.metadata || {}) as BillEmbeddingMatch['metadata'];
        const content = doc.pageContent || '';

        // Build co-sponsors string if available
        const cosponsors = meta.cosponsor_names ? meta.cosponsor_names.slice(0, 3).join(', ') : '';
        const cosponsorsStr = cosponsors
          ? `\nCo-sponsors: ${cosponsors}${(meta.cosponsor_names?.length ?? 0) > 3 ? ' (+ more)' : ''}`
          : '';

        // Build committees string if available
        const committees = meta.committee_names ? meta.committee_names.join(', ') : '';
        const committeesStr = committees ? `\nCommittees: ${committees}` : '';

        // Convert score to similarity (LangChain returns distance, we want similarity)
        const similarity = 1 - score;

        return `Bill: ${meta.bill_number || 'Unknown'}
Session: ${meta.session_year} ${meta.session_code || ''}
Document Type: ${meta.content_type || 'Unknown'}
Sponsor: ${meta.primary_sponsor_name || 'Unknown'}${cosponsorsStr}${committeesStr}
Similarity: ${similarity.toFixed(2)}
Content: ${content.substring(0, 300)}...
---`;
      });

      return formattedResults.join('\n\n');
    } catch (error) {
      console.error('Semantic search error:', error);
      return 'Error searching bills. Please try again.';
    }
  },
  {
    name: 'search_bills_semantic',
    description:
      'Search for bills using semantic similarity with optional filters. Use this when the user asks about bill content, topics, or concepts, optionally filtered by session, sponsor, or committee. Examples: "healthcare bills from 2025", "education funding sponsored by Smith", "tax reform in Ways and Means committee"',
    schema: z.object({
      query: z.string().describe('Natural language search query describing the bill content or topic'),
      limit: z.number().optional().default(5).describe('Maximum number of results'),
      sessionYear: z.number().optional().describe('Filter by session year (e.g., 2025, 2024)'),
      sessionCode: z.string().optional().describe('Filter by session code (R for Regular, S1 for Special 1, S2 for Special 2)'),
      sponsorName: z.string().optional().describe('Filter by primary sponsor name (partial match supported)'),
      committeeName: z.string().optional().describe('Filter by committee name'),
    }),
  }
);

/**
 * Get detailed information about a specific bill
 */
export const getBillByNumber = tool(
  async ({ billNumber, sessionYear }) => {
    const supabase = getSupabaseClient();

    // Normalize bill number
    const normalized = normalizeBillNumber(billNumber);

    // Build query
    let query = supabase
      .from('bills')
      .select(`
        id,
        bill_number,
        title,
        description,
        lr_number,
        last_action,
        proposed_effective_date,
        sessions(year, session_code)
      `)
      .eq('bill_number', normalized);

    if (sessionYear) {
      // Get session first
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id')
        .eq('year', sessionYear)
        .single();

      if (sessionData) {
        query = query.eq('session_id', sessionData.id);
      }
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return `Bill ${normalized} not found${sessionYear ? ` for session ${sessionYear}` : ''}.`;
    }

    const billData = data as unknown as BillWithSession;

    // Get sponsors
    const { data: sponsorsData } = await supabase
      .from('bill_sponsors')
      .select(`
        is_primary,
        session_legislators(legislators(name, party_affiliation))
      `)
      .eq('bill_id', billData.id);

    const primarySponsors: string[] = [];
    const cosponsors: string[] = [];

    const typedSponsors = sponsorsData as unknown as SponsorWithLegislator[];
    typedSponsors?.forEach((sponsor) => {
      const leg = sponsor.session_legislators?.legislators;
      if (!leg) return;

      const name = leg.name || 'Unknown';
      const party = leg.party_affiliation || '';
      const sponsorStr = party ? `${name} (${party})` : name;

      if (sponsor.is_primary) {
        primarySponsors.push(sponsorStr);
      } else {
        cosponsors.push(sponsorStr);
      }
    });

    const sessions = billData.sessions;
    const result = `Bill: ${billData.bill_number}
Session: ${sessions?.year} ${sessions?.session_code}
Title: ${billData.title || 'N/A'}
Description: ${billData.description || 'N/A'}
LR Number: ${billData.lr_number || 'N/A'}
Last Action: ${billData.last_action || 'N/A'}
Proposed Effective Date: ${billData.proposed_effective_date || 'N/A'}

Primary Sponsor(s): ${primarySponsors.length > 0 ? primarySponsors.join(', ') : 'None'}
Co-sponsors: ${cosponsors.length > 0 ? cosponsors.slice(0, 5).join(', ') : 'None'}
${cosponsors.length > 5 ? `(and ${cosponsors.length - 5} more)` : ''}`;

    return result.trim();
  },
  {
    name: 'get_bill_by_number',
    description:
      'Get detailed information about a specific bill. Use this when the user asks about a specific bill by number. Examples: "Tell me about HB1366", "What is HB2146"',
    schema: z.object({
      billNumber: z.string().describe('Bill number (e.g., "HB1366", "HB 1366")'),
      sessionYear: z.number().optional().describe('Optional session year'),
    }),
  }
);

/**
 * Get information about a legislator
 */
export const getLegislatorInfo = tool(
  async ({ name }) => {
    const supabase = getSupabaseClient();

    // Search for legislator (case-insensitive partial match)
    const { data, error } = await supabase
      .from('legislators')
      .select(`
        id,
        name,
        legislator_type,
        party_affiliation,
        year_elected,
        years_served,
        is_active
      `)
      .ilike('name', `%${name}%`);

    if (error || !data || data.length === 0) {
      return `No legislator found matching '${name}'.`;
    }

    const legislators = data as Legislator[];

    if (legislators.length > 1) {
      const names = legislators.slice(0, 10).map((leg) => leg.name);
      return `Multiple legislators found: ${names.join(', ')}. Please be more specific.`;
    }

    const leg = legislators[0];
    const result = `Name: ${leg.name}
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
      'Get information about a legislator. Use this when the user asks about a specific legislator or representative. Examples: "Who is Rep. Smith?", "Tell me about Jane Doe"',
    schema: z.object({
      name: z.string().describe('Legislator name (full or partial)'),
    }),
  }
);

/**
 * Get the legislative timeline/history for a bill
 */
export const getBillTimeline = tool(
  async ({ billNumber, sessionYear }) => {
    const supabase = getSupabaseClient();

    // Normalize bill number
    const normalized = normalizeBillNumber(billNumber);

    // Get bill ID
    let billQuery = supabase
      .from('bills')
      .select('id, bill_number, sessions(year, session_code)')
      .eq('bill_number', normalized);

    if (sessionYear) {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id')
        .eq('year', sessionYear)
        .single();

      if (sessionData) {
        billQuery = billQuery.eq('session_id', sessionData.id);
      }
    }

    const { data: billData, error: billError } = await billQuery.single();

    if (billError || !billData) {
      return `Bill ${normalized} not found${sessionYear ? ` for session ${sessionYear}` : ''}.`;
    }

    const typedBill = billData as unknown as BillWithSession;

    // Get actions
    const { data: actionsData } = await supabase
      .from('bill_actions')
      .select('action_date, description, sequence_order')
      .eq('bill_id', typedBill.id)
      .order('sequence_order');

    if (!actionsData || actionsData.length === 0) {
      return `No actions found for ${normalized}.`;
    }

    const typedActions = actionsData as BillAction[];
    const sessions = typedBill.sessions;
    const timeline = [`Timeline for ${typedBill.bill_number} (${sessions?.year} ${sessions?.session_code}):`];

    typedActions.forEach((action) => {
      timeline.push(`${action.action_date}: ${action.description}`);
    });

    return timeline.join('\n');
  },
  {
    name: 'get_bill_timeline',
    description:
      'Get the legislative timeline/history for a bill. Use this when the user asks about a bill\'s progress, actions, or history. Examples: "What happened to HB1366?", "Show me the timeline for HB2146"',
    schema: z.object({
      billNumber: z.string().describe('Bill number (e.g., "HB1366")'),
      sessionYear: z.number().optional().describe('Optional session year'),
    }),
  }
);

/**
 * Get committee hearing information
 */
export const getCommitteeHearings = tool(
  async ({ billNumber, committeeName }) => {
    const supabase = getSupabaseClient();

    if (!billNumber && !committeeName) {
      return 'Please provide either a bill number or committee name.';
    }

    let query = supabase
      .from('bill_hearings')
      .select(`
        hearing_date,
        hearing_time,
        hearing_time_text,
        location,
        bills(bill_number, sessions(year, session_code)),
        committees(name)
      `);

    if (billNumber) {
      const normalized = normalizeBillNumber(billNumber);

      // Get bill ID first
      const { data: billData } = await supabase
        .from('bills')
        .select('id')
        .eq('bill_number', normalized)
        .single();

      if (!billData) {
        return `Bill ${normalized} not found.`;
      }

      query = query.eq('bill_id', billData.id);
    }

    if (committeeName) {
      // Get committee ID
      const { data: committeeData } = await supabase
        .from('committees')
        .select('id')
        .ilike('name', `%${committeeName}%`)
        .single();

      if (!committeeData) {
        return `Committee matching '${committeeName}' not found.`;
      }

      query = query.eq('committee_id', committeeData.id);
    }

    const { data, error } = await query.limit(10);

    if (error || !data || data.length === 0) {
      return 'No hearings found.';
    }

    const typedHearings = data as unknown as HearingWithRelations[];
    const results = typedHearings.map((hearing) => {
      const bills = hearing.bills;
      const committee = hearing.committees?.name || 'Unknown';
      const sessions = bills?.sessions;

      return `Bill: ${bills?.bill_number || 'Unknown'} (${sessions?.year || ''} ${sessions?.session_code || ''})
Committee: ${committee}
Date: ${hearing.hearing_date || 'TBD'}
Time: ${hearing.hearing_time_text || hearing.hearing_time || 'TBD'}
Location: ${hearing.location || 'TBD'}
---`;
    });

    return results.join('\n\n');
  },
  {
    name: 'get_committee_hearings',
    description:
      'Get committee hearing information. Use this when the user asks about hearings for a specific bill or committee. Examples: "When was HB1366 heard?", "What bills are in the Health Committee?"',
    schema: z.object({
      billNumber: z.string().optional().describe('Optional bill number'),
      committeeName: z.string().optional().describe('Optional committee name'),
    }),
  }
);

/**
 * Search bills by legislative session year
 */
export const searchBillsByYear = tool(
  async ({ sessionYear, limit = 10 }) => {
    const supabase = getSupabaseClient();

    // Get session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('year', sessionYear)
      .single();

    if (sessionError || !sessionData) {
      return `No session found for year ${sessionYear}.`;
    }

    // Get bills
    const { data, error } = await supabase
      .from('bills')
      .select(`
        id,
        bill_number,
        title,
        sessions(year, session_code)
      `)
      .eq('session_id', sessionData.id)
      .limit(limit);

    if (error || !data || data.length === 0) {
      return `No bills found for ${sessionYear}.`;
    }

    const typedBills = data as unknown as BillWithSession[];
    const results = typedBills.map((bill) => {
      const sessions = bill.sessions;
      return `${bill.bill_number} (${sessions?.year} ${sessions?.session_code}): ${bill.title || 'No title'}`;
    });

    return results.join('\n');
  },
  {
    name: 'search_bills_by_year',
    description:
      'Search bills by legislative session year. Use this when the user asks about bills from a specific year. Examples: "Bills from 2026", "Show me 2025 bills"',
    schema: z.object({
      sessionYear: z.number().describe('Legislative year (e.g., 2026)'),
      limit: z.number().optional().default(10).describe('Maximum results'),
    }),
  }
);

/**
 * Get all agent tools
 */
export function getTools() {
  return [
    searchBillsSemantic,
    getBillByNumber,
    getLegislatorInfo,
    getBillTimeline,
    getCommitteeHearings,
    searchBillsByYear,
  ];
}
