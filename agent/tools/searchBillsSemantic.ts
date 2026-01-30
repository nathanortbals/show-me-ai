/**
 * Semantic search tool for bills.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  SupabaseVectorStore,
  SupabaseFilterRPCCall,
} from '@langchain/community/vectorstores/supabase';
import { getSupabaseClient } from '@/database/client';

// Type for embedding metadata
interface BillEmbeddingMetadata {
  bill_id?: string;
  bill_number?: string;
  session_year?: number;
  session_code?: string;
  primary_sponsor_name?: string;
  cosponsor_names?: string[];
  committee_names?: string[];
  content_type?: string;
}

/**
 * Search for bills using semantic similarity with optional metadata filters
 */
export const searchBillsSemantic = tool(
  async ({ query, limit = 20, sessionYear, sessionCode, sponsorName, committeeName }) => {
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
      // Search with a higher limit to get total count of available results
      // This helps inform the user if there are more results than shown
      const searchLimit = Math.max(limit * 3, 50);
      const allResults = await vectorStore.similaritySearchWithScore(
        query,
        searchLimit,
        filter
      );

      if (allResults.length === 0) {
        return 'No bills found matching that query with the given filters.';
      }

      // Only format the requested limit
      const resultsToShow = allResults.slice(0, limit);
      const totalCount = allResults.length;
      const hasMore = totalCount > limit;

      // Fetch bill summaries for all results to show
      const billIds = resultsToShow
        .map(([doc]) => (doc.metadata as BillEmbeddingMetadata).bill_id)
        .filter((id): id is string => !!id);

      const { data: bills } = await supabase
        .from('bills')
        .select('id, title, description')
        .in('id', billIds);

      const billsMap = new Map(bills?.map(b => [b.id, b]) || []);

      // Format results
      const formattedResults = resultsToShow.map(([doc, score]) => {
        const meta = (doc.metadata || {}) as BillEmbeddingMetadata;
        const content = doc.pageContent || '';
        const billData = billsMap.get(meta.bill_id || '');

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

        // Format with summary and matched content sections
        const summarySection = billData?.description
          ? `Summary: ${billData.description}\n`
          : billData?.title
          ? `Summary: ${billData.title}\n`
          : '';

        return `Bill: ${meta.bill_number || 'Unknown'}
Session: ${meta.session_year} ${meta.session_code || ''}
Document Type: ${meta.content_type || 'Unknown'}
Sponsor: ${meta.primary_sponsor_name || 'Unknown'}${cosponsorsStr}${committeesStr}
Similarity: ${similarity.toFixed(2)}
${summarySection}Matched Content: ${content.substring(0, 300)}...
---`;
      });

      // Add summary header with total count
      const header = hasMore
        ? `Found ${totalCount} matching results. Showing top ${limit}:\n\n`
        : `Found ${totalCount} matching result${totalCount === 1 ? '' : 's'}:\n\n`;

      return header + formattedResults.join('\n\n');
    } catch (error) {
      console.error('Semantic search error:', error);
      return 'Error searching bills. Please try again.';
    }
  },
  {
    name: 'search_bills_semantic',
    description:
      'Search for bills using semantic similarity with optional filters. Use this when the user asks about bill content, topics, or concepts, optionally filtered by session, sponsor, or committee. Examples: "healthcare bills from 2025", "education funding sponsored by Smith", "tax reform in Ways and Means committee". IMPORTANT: The response includes a header showing total results found vs. shown (e.g., "Found 36 matching results. Showing top 5:"). Always communicate this total count to the user so they know if more results are available.',
    schema: z.object({
      query: z.string().describe('Natural language search query describing the bill content or topic'),
      limit: z.number().optional().default(20).describe('Maximum number of results to show'),
      sessionYear: z.number().optional().describe('Filter by session year (e.g., 2025, 2024)'),
      sessionCode: z.string().optional().describe('Filter by session code (R for Regular, S1 for Special 1, S2 for Special 2)'),
      sponsorName: z.string().optional().describe('Filter by primary sponsor name (partial match supported)'),
      committeeName: z.string().optional().describe('Filter by committee name'),
    }),
  }
);
