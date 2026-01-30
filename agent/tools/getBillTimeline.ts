/**
 * Tool to get the legislative timeline/history for a bill.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSupabaseClient } from '@/database/client';
import { Database } from '@/database/types';
import { normalizeBillNumber } from './utils';

type Bill = Database['public']['Tables']['bills']['Row'];
type BillAction = Database['public']['Tables']['bill_actions']['Row'];

// Type for bill query with session relation
interface BillWithSession extends Omit<Bill, 'sessions'> {
  sessions: {
    year: number;
    session_code: string;
  } | null;
}

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
