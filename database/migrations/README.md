# Database Migrations

## Running Migrations

Migrations should be run manually through the Supabase SQL Editor.

1. Log into your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy the contents of the migration file
4. Execute the SQL

## Available Migrations

### create_bill_embeddings.sql
Creates the bill_embeddings table and similarity search function for RAG.

**Status**: Should already be applied if you've generated embeddings.

### add_embeddings_tracking_to_bills.sql
Adds tracking fields to the bills table to record when embeddings were generated.

**Fields added:**
- `embeddings_generated` (BOOLEAN) - Whether embeddings exist for this bill
- `embeddings_generated_at` (TIMESTAMPTZ) - When embeddings were last generated

**To apply**: Copy and run the SQL in your Supabase dashboard SQL Editor.

### add_hearing_time_text.sql
Adds a text field for hearing times that can't be parsed as TIME.

**Status**: Should already be applied if you've scraped bills.

### ~~add_filtered_embeddings_search.sql~~ (DEPRECATED)
**Replaced by SupabaseVectorStore filter functions.**

This migration created `match_bill_embeddings_filtered` for metadata filtering, but we now use LangChain's SupabaseVectorStore with filter functions instead, which provides the same functionality with better integration.

**Status**: If applied, run `drop_filtered_embeddings_search.sql` to clean up.

### drop_filtered_embeddings_search.sql
Removes the deprecated `match_bill_embeddings_filtered` function.

**Why**: We now use SupabaseVectorStore's filter parameter instead of a custom RPC function. This provides:
- Better LangChain integration
- Easier maintenance
- Standard query builder approach for metadata filtering

**To apply**: Copy and run the SQL in your Supabase dashboard SQL Editor.

### fix_match_bill_embeddings_for_langchain.sql
Updates the `match_bill_embeddings` function signature to match LangChain SupabaseVectorStore expectations.

**Changes**:
- Old signature: `(query_embedding, match_threshold, match_count)`
- New signature: `(query_embedding, match_count, filter)`
- Adds optional JSONB filter parameter
- Removes match_threshold (LangChain handles this differently)
- Increases default match_count to 500 (from 10)

**Why high match_count?**: With function-type filters, PostgREST applies filters AFTER the RPC returns results. The RPC must return enough candidates (500) so that after filtering by session/sponsor/committee, we still have sufficient results.

**Status**: Applied - fixes semantic search compatibility with LangChain v1.x.

**To apply**: Copy and run the SQL in your Supabase dashboard SQL Editor.
