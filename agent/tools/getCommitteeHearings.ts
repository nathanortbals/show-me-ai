/**
 * Tool to get committee hearing information.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';
import { normalizeBillNumber } from './utils';

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

    const { data, error } = await query.limit(20);

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
