/**
 * Tools for the Missouri Bills AI agent.
 *
 * Provides functions for semantic search, bill lookup, and metadata queries.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { OpenAIEmbeddings } from '@langchain/openai';
import { getSupabaseClient } from '../db';

// Normalize bill number to match database format (e.g., "HB1366" -> "HB 1366")
function normalizeBillNumber(billNumber: string): string {
  const cleaned = billNumber.toUpperCase().trim();
  return cleaned.replace(/^([A-Z]+)(\d+)$/, '$1 $2');
}

/**
 * Search for bills using semantic similarity
 */
export const searchBillsSemantic = tool(
  async ({ query, limit = 5 }) => {
    const supabase = getSupabaseClient();

    // Generate embedding for query
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
    });
    const queryEmbedding = await embeddings.embedQuery(query);

    // Call RPC function directly for vector similarity search
    const { data, error } = await supabase.rpc('match_bill_embeddings', {
      query_embedding: queryEmbedding,
      match_count: limit,
      match_threshold: 0.3,
    });

    if (error || !data || data.length === 0) {
      return 'No bills found matching that query.';
    }

    // Format results
    const results = data.map((row: any) => {
      const meta = row.metadata || {};
      const content = row.content || '';

      return `Bill: ${meta.bill_number || 'Unknown'}
Session: ${meta.session_year} ${meta.session_code || ''}
Document Type: ${meta.content_type || 'Unknown'}
Sponsor: ${meta.primary_sponsor_name || 'Unknown'}
Similarity: ${(row.similarity || 0).toFixed(2)}
Content: ${content.substring(0, 300)}...
---`;
    });

    return results.join('\n\n');
  },
  {
    name: 'search_bills_semantic',
    description:
      'Search for bills using semantic similarity. Use this when the user asks about bill content, topics, or concepts. Examples: "healthcare bills", "education funding", "tax reform"',
    schema: z.object({
      query: z.string().describe('Natural language search query'),
      limit: z.number().optional().default(5).describe('Maximum number of results'),
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

    // Get sponsors
    const { data: sponsorsData } = await supabase
      .from('bill_sponsors')
      .select(`
        is_primary,
        session_legislators(legislators(name, party_affiliation))
      `)
      .eq('bill_id', data.id);

    const primarySponsors: string[] = [];
    const cosponsors: string[] = [];

    sponsorsData?.forEach((sponsor: any) => {
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

    const sessions = data.sessions as any;
    const result = `Bill: ${data.bill_number}
Session: ${sessions.year} ${sessions.session_code}
Title: ${data.title || 'N/A'}
Description: ${data.description || 'N/A'}
LR Number: ${data.lr_number || 'N/A'}
Last Action: ${data.last_action || 'N/A'}
Proposed Effective Date: ${data.proposed_effective_date || 'N/A'}

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

    if (data.length > 1) {
      const names = data.slice(0, 10).map((leg: any) => leg.name);
      return `Multiple legislators found: ${names.join(', ')}. Please be more specific.`;
    }

    const leg = data[0];
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

    // Get actions
    const { data: actionsData } = await supabase
      .from('bill_actions')
      .select('action_date, description, sequence_order')
      .eq('bill_id', billData.id)
      .order('sequence_order');

    if (!actionsData || actionsData.length === 0) {
      return `No actions found for ${normalized}.`;
    }

    const sessions = billData.sessions as any;
    const timeline = [`Timeline for ${billData.bill_number} (${sessions.year} ${sessions.session_code}):`];

    actionsData.forEach((action: any) => {
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

    const results = data.map((hearing: any) => {
      const bills = hearing.bills as any;
      const committee = hearing.committees?.name || 'Unknown';
      const sessions = bills?.sessions as any;

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

    const results = data.map((bill: any) => {
      const sessions = bill.sessions as any;
      return `${bill.bill_number} (${sessions.year} ${sessions.session_code}): ${bill.title || 'No title'}`;
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
