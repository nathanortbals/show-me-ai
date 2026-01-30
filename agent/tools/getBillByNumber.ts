/**
 * Tool to get detailed information about a specific bill.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';
import { Database } from '@/database/types';
import { normalizeBillNumber } from './utils';

type Bill = Database['public']['Tables']['bills']['Row'];

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
    const result = `Bill: ${billData.bill_number} (ID: ${billData.id})
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
