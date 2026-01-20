-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create bill_embeddings table for vector similarity search
CREATE TABLE IF NOT EXISTS bill_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(1536),  -- OpenAI text-embedding-3-small uses 1536 dimensions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on embedding column for faster similarity search
CREATE INDEX IF NOT EXISTS bill_embeddings_embedding_idx
ON bill_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index on metadata for filtering
CREATE INDEX IF NOT EXISTS bill_embeddings_metadata_idx
ON bill_embeddings USING gin (metadata);

-- Create function for similarity search (required by LangChain SupabaseVectorStore)
CREATE OR REPLACE FUNCTION match_bill_embeddings(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10
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
    WHERE 1 - (bill_embeddings.embedding <=> query_embedding) > match_threshold
    ORDER BY bill_embeddings.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE bill_embeddings IS 'Vector embeddings for bill documents, chunked and embedded using OpenAI text-embedding-3-small';
COMMENT ON COLUMN bill_embeddings.content IS 'Text chunk from bill document';
COMMENT ON COLUMN bill_embeddings.metadata IS 'JSON metadata including bill_id, bill_number, session info, sponsors, committees, chunk info';
COMMENT ON COLUMN bill_embeddings.embedding IS 'Vector embedding (1536 dimensions) for semantic search';
COMMENT ON FUNCTION match_bill_embeddings IS 'Similarity search function for finding semantically similar bill text chunks';
