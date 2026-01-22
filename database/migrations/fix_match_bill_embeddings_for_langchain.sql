-- Drop and recreate match_bill_embeddings to match LangChain SupabaseVectorStore expectations
-- LangChain expects: (query_embedding, match_count, filter)
-- High default match_count (500) allows PostgREST filtering to work with sufficient candidates

DROP FUNCTION IF EXISTS match_bill_embeddings(vector, float, int);
DROP FUNCTION IF EXISTS match_bill_embeddings(vector, int, jsonb);

CREATE OR REPLACE FUNCTION match_bill_embeddings(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 500,
    filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    embedding VECTOR(1536),
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bill_embeddings.id,
        bill_embeddings.content,
        bill_embeddings.metadata,
        bill_embeddings.embedding,
        1 - (bill_embeddings.embedding <=> query_embedding) AS similarity
    FROM bill_embeddings
    WHERE
        -- Apply metadata filters if provided
        (filter = '{}'::jsonb OR bill_embeddings.metadata @> filter)
    ORDER BY bill_embeddings.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_bill_embeddings IS
'Similarity search function compatible with LangChain SupabaseVectorStore.
High default match_count (500) allows PostgREST filtering to work with sufficient candidates.
Parameters: query_embedding (vector), match_count (int), filter (jsonb).
Use SupabaseVectorStore with filter functions for complex metadata filtering.';
