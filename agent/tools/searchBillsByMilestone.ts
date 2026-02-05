/**
 * Tool to search bills by legislative milestone.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';

// Milestone enum values
const MILESTONES = [
  'passed_house',
  'passed_senate',
  'passed_both_chambers',
  'signed',
  'vetoed',
] as const;

type Milestone = (typeof MILESTONES)[number];

// Map milestones to action patterns in bill_actions table
const MILESTONE_PATTERNS: Record<Milestone, string> = {
  passed_house: '%Third Read and Passed (H)%',
  passed_senate: '%Third Read and Passed (S)%',
  passed_both_chambers: '%Truly Agreed To and Finally Passed%',
  signed: '%Approved by Governor%',
  vetoed: '%Vetoed%',
};

// Type for bill with milestone action
interface BillWithMilestone {
  id: string;
  bill_number: string;
  title: string | null;
  session_year: number;
  session_code: string;
  action_date: string;
  action_description: string;
}

/**
 * Search bills by legislative milestone
 */
export const searchBillsByMilestone = tool(
  async ({ milestone, sessionYear, chamber, limit = 20 }) => {
    const supabase = getSupabaseClient();

    const pattern = MILESTONE_PATTERNS[milestone as Milestone];

    // First, get total count of distinct bills matching the criteria
    // We need to count distinct bill_ids to get accurate total
    let countQuery = supabase
      .from('bill_actions')
      .select(`
        bills!inner(
          id,
          sessions!inner(year)
        )
      `)
      .ilike('description', pattern);

    if (sessionYear) {
      countQuery = countQuery.eq('bills.sessions.year', sessionYear);
    }

    if (chamber) {
      const prefix = chamber === 'house' ? 'H%' : 'S%';
      countQuery = countQuery.ilike('bills.bill_number', prefix);
    }

    const { data: countData } = await countQuery;

    // Count unique bill IDs from the count query
    const uniqueBillIdsForCount = new Set<string>();
    if (countData) {
      for (const row of countData) {
        const bill = row.bills as unknown as { id: string };
        if (bill?.id) {
          uniqueBillIdsForCount.add(bill.id);
        }
      }
    }
    const totalCount = uniqueBillIdsForCount.size;

    // Build the query to find bills with matching actions
    let query = supabase
      .from('bill_actions')
      .select(`
        action_date,
        description,
        bills!inner(
          id,
          bill_number,
          title,
          sessions!inner(year, session_code)
        )
      `)
      .ilike('description', pattern);

    // Filter by session year if provided
    if (sessionYear) {
      query = query.eq('bills.sessions.year', sessionYear);
    }

    // Filter by chamber if provided (based on bill_number prefix)
    if (chamber) {
      const prefix = chamber === 'house' ? 'H%' : 'S%';
      query = query.ilike('bills.bill_number', prefix);
    }

    // Order by action date descending - fetch more to account for deduplication
    query = query.order('action_date', { ascending: false }).limit(limit * 3);

    const { data, error } = await query;

    if (error) {
      console.error('Milestone search error:', error);
      return `Error searching for bills: ${error.message}`;
    }

    if (!data || data.length === 0) {
      const yearStr = sessionYear ? ` in ${sessionYear}` : '';
      const chamberStr = chamber ? ` from the ${chamber}` : '';
      return `No bills found that have ${milestone.replace(/_/g, ' ')}${chamberStr}${yearStr}.`;
    }

    // Deduplicate by bill_id (a bill might have multiple matching actions)
    const seenBillIds = new Set<string>();
    const uniqueResults: BillWithMilestone[] = [];

    for (const row of data) {
      const bill = row.bills as unknown as {
        id: string;
        bill_number: string;
        title: string | null;
        sessions: { year: number; session_code: string };
      };

      if (!seenBillIds.has(bill.id)) {
        seenBillIds.add(bill.id);
        uniqueResults.push({
          id: bill.id,
          bill_number: bill.bill_number,
          title: bill.title,
          session_year: bill.sessions.year,
          session_code: bill.sessions.session_code,
          action_date: row.action_date || 'Unknown',
          action_description: row.description || '',
        });

        if (uniqueResults.length >= limit) break;
      }
    }

    // Format results
    const milestoneLabel = milestone.replace(/_/g, ' ');
    const formattedResults = uniqueResults.map((bill) => {
      const title = bill.title
        ? ` - ${bill.title.substring(0, 100)}${bill.title.length > 100 ? '...' : ''}`
        : '';

      return `${bill.bill_number} (ID: ${bill.id})${title}
Session: ${bill.session_year} ${bill.session_code}
${milestoneLabel}: ${bill.action_date}
---`;
    });

    const yearStr = sessionYear ? ` in ${sessionYear}` : '';
    const chamberStr = chamber ? ` ${chamber}` : '';
    const hasMore = totalCount > uniqueResults.length;

    const header = hasMore
      ? `Found ${totalCount}${chamberStr} bill${totalCount === 1 ? '' : 's'} that ${milestoneLabel}${yearStr}. Showing ${uniqueResults.length}:\n\n`
      : `Found ${totalCount}${chamberStr} bill${totalCount === 1 ? '' : 's'} that ${milestoneLabel}${yearStr}:\n\n`;

    return header + formattedResults.join('\n\n');
  },
  {
    name: 'search_bills_by_milestone',
    description:
      'Search for bills that have reached a specific legislative milestone. Use this when the user asks about bills that have passed, been signed, or vetoed. Results include bills that reached this milestone OR went further (e.g., "passed_house" includes bills later signed into law). Examples: "What bills passed the House this year?", "Which bills were signed by the governor in 2025?", "Show me vetoed bills"',
    schema: z.object({
      milestone: z
        .enum(MILESTONES)
        .describe(
          'Legislative milestone to search for. Options: passed_house (passed House floor vote), passed_senate (passed Senate floor vote), passed_both_chambers (passed both chambers), signed (signed into law), vetoed (vetoed by governor)'
        ),
      sessionYear: z.number().optional().describe('Filter by session year (e.g., 2025, 2026)'),
      chamber: z
        .enum(['house', 'senate'])
        .optional()
        .describe('Filter by originating chamber (house or senate)'),
      limit: z.number().optional().default(20).describe('Maximum number of results to return'),
    }),
  }
);

// Export milestone patterns for use by other tools
export { MILESTONE_PATTERNS, MILESTONES };
export type { Milestone };
