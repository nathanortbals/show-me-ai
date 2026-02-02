-- Fix IVFFlat search accuracy by setting probes higher
--
-- The IVFFlat index with lists=100 and default probes=1 was only searching
-- 1% of the vector space, causing semantic search to miss relevant results.
-- Setting probes=10 searches 10% of clusters, significantly improving recall.
--
-- See: https://github.com/pgvector/pgvector#ivfflat

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
    -- Set probes higher for better recall (default is 1, which is too low)
    -- With lists=100, probes=10 searches 10% of clusters
    SET LOCAL ivfflat.probes = 10;

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
Sets ivfflat.probes=10 for better recall with IVFFlat index.
Parameters: query_embedding (vector), match_count (int), filter (jsonb).';