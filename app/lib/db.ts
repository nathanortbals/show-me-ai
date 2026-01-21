/**
 * Database utilities for Supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton database client
let dbClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!dbClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials not found. Set SUPABASE_URL and SUPABASE_KEY environment variables.'
      );
    }

    dbClient = createClient(supabaseUrl, supabaseKey);
  }

  return dbClient;
}
