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
    title: string | null;
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
  async ({ billNumber, committeeName, upcomingOnly, limit }) => {
    const supabase = getSupabaseClient();

    let query = supabase
      .from('bill_hearings')
      .select(`
        hearing_date,
        hearing_time,
        hearing_time_text,
        location,
        bills(bill_number, title, sessions(year, session_code)),
        committees(name)
      `);

    // Filter by bill number if provided
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

    // Filter by committee name if provided
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

    // Filter to upcoming hearings only (today or future)
    if (upcomingOnly) {
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('hearing_date', today);
    }

    // Order by date (ascending for upcoming, descending for past)
    query = query.order('hearing_date', { ascending: upcomingOnly ?? true });

    // Apply limit
    if (limit && limit > 0) {
      query = query.limit(limit);
    } else {
      query = query.limit(25); // Default limit
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      if (upcomingOnly) {
        return 'No upcoming hearings found.';
      }
      return 'No hearings found.';
    }

    const typedHearings = data as unknown as HearingWithRelations[];
    const results = typedHearings.map((hearing) => {
      const bills = hearing.bills;
      const committee = hearing.committees?.name || 'Unknown';
      const sessions = bills?.sessions;
      const title = bills?.title ? ` - ${bills.title.substring(0, 80)}${bills.title.length > 80 ? '...' : ''}` : '';

      return `Bill: ${bills?.bill_number || 'Unknown'}${title} (${sessions?.year || ''} ${sessions?.session_code || ''})
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
      'Get committee hearing information. Use this when the user asks about hearings, including upcoming hearings. Examples: "Which bills have upcoming hearings?", "When is HB1366 being heard?", "What bills are scheduled in the Health Committee?", "Show me hearings this week"',
    schema: z.object({
      billNumber: z.string().optional().describe('Optional bill number to filter by'),
      committeeName: z.string().optional().describe('Optional committee name to filter by'),
      upcomingOnly: z.boolean().optional().describe('Set to true to only show hearings scheduled for today or in the future'),
      limit: z.number().optional().describe('Maximum number of results to return (default 25)'),
    }),
  }
);
