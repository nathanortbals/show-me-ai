/**
 * Tool to search bills by legislative session year.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';
import { Database } from '@/database/types';

type Bill = Database['public']['Tables']['bills']['Row'];

// Type for bill query with session relation
interface BillWithSession extends Omit<Bill, 'sessions'> {
  sessions: {
    year: number;
    session_code: string;
  } | null;
}

/**
 * Search bills by legislative session year
 */
export const searchBillsByYear = tool(
  async ({ sessionYear, limit = 20 }) => {
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
      limit: z.number().optional().default(20).describe('Maximum results'),
    }),
  }
);
