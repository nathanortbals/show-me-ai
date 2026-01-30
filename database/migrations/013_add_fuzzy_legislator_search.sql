-- Enable pg_trgm extension for fuzzy string matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on legislator names for fast trigram searches
CREATE INDEX IF NOT EXISTS idx_legislators_name_trgm ON legislators USING GIN (name gin_trgm_ops);

-- Function to search legislators by fuzzy name matching
-- Returns legislators ordered by similarity score, with optional active filter
CREATE OR REPLACE FUNCTION search_legislators_fuzzy(
  search_name TEXT,
  similarity_threshold FLOAT DEFAULT 0.3,
  max_results INT DEFAULT 10,
  active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  legislator_type TEXT,
  party_affiliation TEXT,
  year_elected INT,
  years_served INT,
  is_active BOOLEAN,
  similarity_score REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    l.legislator_type,
    l.party_affiliation,
    l.year_elected,
    l.years_served,
    l.is_active,
    similarity(l.name, search_name) AS similarity_score
  FROM legislators l
  WHERE
    similarity(l.name, search_name) > similarity_threshold
    AND (NOT active_only OR l.is_active = TRUE)
  ORDER BY similarity_score DESC
  LIMIT max_results;
END;
$$;

-- Add comment
COMMENT ON FUNCTION search_legislators_fuzzy IS 'Fuzzy search for legislators using trigram similarity. Returns matches above threshold sorted by similarity.';
