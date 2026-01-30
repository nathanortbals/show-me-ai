/**
 * Tool to get bills sponsored by a legislator.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';

// Type for sponsored bill query result
interface SponsoredBillResult {
  is_primary: boolean;
  bills: {
    bill_number: string;
    title: string | null;
    description: string | null;
    last_action: string | null;
    sessions: {
      year: number;
      session_code: string;
    } | null;
  } | null;
}

/**
 * Get bills sponsored by a legislator
 */
export const getLegislatorBills = tool(
  async ({ legislatorId, sessionYear, includeCosponsored = false }) => {
    const supabase = getSupabaseClient();

    // First verify the legislator exists
    const { data: legislator } = await supabase
      .from('legislators')
      .select('id, name')
      .eq('id', legislatorId)
      .single();

    if (!legislator) {
      return `Legislator with ID '${legislatorId}' not found. Use get_legislator_info first to find the legislator.`;
    }

    // Get session_legislator IDs for this legislator (possibly across multiple sessions)
    let sessionLegQuery = supabase
      .from('session_legislators')
      .select('id, sessions(year, session_code)')
      .eq('legislator_id', legislatorId);

    if (sessionYear) {
      // Filter to specific session year
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id')
        .eq('year', sessionYear)
        .single();

      if (sessionData) {
        sessionLegQuery = sessionLegQuery.eq('session_id', sessionData.id);
      }
    }

    const { data: sessionLegislators } = await sessionLegQuery;

    if (!sessionLegislators || sessionLegislators.length === 0) {
      return `${legislator.name} has no session records${sessionYear ? ` for ${sessionYear}` : ''}.`;
    }

    const sessionLegIds = sessionLegislators.map((sl) => sl.id);

    // Get sponsored bills
    let sponsorQuery = supabase
      .from('bill_sponsors')
      .select(`
        is_primary,
        bills(
          bill_number,
          title,
          description,
          last_action,
          sessions(year, session_code)
        )
      `)
      .in('session_legislator_id', sessionLegIds)
      .order('is_primary', { ascending: false });

    if (!includeCosponsored) {
      sponsorQuery = sponsorQuery.eq('is_primary', true);
    }

    const { data: sponsoredBills, error } = await sponsorQuery.limit(50);

    if (error) {
      console.error('Error fetching sponsored bills:', error);
      return `Error fetching bills for ${legislator.name}.`;
    }

    if (!sponsoredBills || sponsoredBills.length === 0) {
      return `${legislator.name} has not ${includeCosponsored ? 'sponsored or co-sponsored' : 'primarily sponsored'} any bills${sessionYear ? ` in ${sessionYear}` : ''}.`;
    }

    const typedBills = sponsoredBills as unknown as SponsoredBillResult[];

    // Group by primary vs co-sponsored
    const primaryBills = typedBills.filter((b) => b.is_primary && b.bills);
    const coBills = typedBills.filter((b) => !b.is_primary && b.bills);

    const results: string[] = [];

    if (primaryBills.length > 0) {
      results.push(`**Primary Sponsor (${primaryBills.length} bills):**`);
      primaryBills.forEach((b) => {
        const bill = b.bills!;
        const session = bill.sessions;
        results.push(`- ${bill.bill_number} (${session?.year} ${session?.session_code}): ${bill.title || bill.description || 'No title'}`);
      });
    }

    if (includeCosponsored && coBills.length > 0) {
      results.push('');
      results.push(`**Co-Sponsor (${coBills.length} bills):**`);
      coBills.slice(0, 20).forEach((b) => {
        const bill = b.bills!;
        const session = bill.sessions;
        results.push(`- ${bill.bill_number} (${session?.year} ${session?.session_code}): ${bill.title || bill.description || 'No title'}`);
      });
      if (coBills.length > 20) {
        results.push(`... and ${coBills.length - 20} more co-sponsored bills`);
      }
    }

    return `Bills for ${legislator.name}${sessionYear ? ` (${sessionYear})` : ''}:\n\n${results.join('\n')}`;
  },
  {
    name: 'get_legislator_bills',
    description:
      'Get bills sponsored by a legislator. IMPORTANT: You must call get_legislator_info first to get the legislator ID. Use this when asked about bills a specific legislator has sponsored. Examples: "What bills has Rep. Smith sponsored?", "Show me bills by this representative"',
    schema: z.object({
      legislatorId: z.string().describe('Legislator UUID (get this from get_legislator_info first)'),
      sessionYear: z.number().optional().describe('Filter by session year (e.g., 2026)'),
      includeCosponsored: z.boolean().optional().default(false).describe('Include bills where legislator is a co-sponsor (default: false, only primary sponsored bills)'),
    }),
  }
);
