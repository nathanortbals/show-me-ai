# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MO Bills is an AI-powered chatbot for querying Missouri House of Representatives bills using RAG (Retrieval-Augmented Generation). The project scrapes legislative data, generates vector embeddings, and provides a LangGraph agent for natural language queries.

**Current Phase**: Phase 3 complete (AI Agent). Next phases: FastAPI backend, React frontend.

## Architecture

### Three-Layer System

1. **Ingestion Layer** (`ingestion/`)
   - Scrapes legislators and bills from Missouri House website using Playwright
   - Stores data in Supabase PostgreSQL + pgvector
   - Generates embeddings for semantic search

2. **RAG Layer** (`agent/`)
   - LangGraph agent with 6 specialized tools
   - Uses GPT-4o for reasoning and OpenAI embeddings (text-embedding-3-small)
   - Semantic search via pgvector similarity

3. **Storage Layer** (Supabase)
   - PostgreSQL with pgvector extension
   - Session-based schema (see DATABASE_SCHEMA.md)
   - Supabase Storage for bill PDFs

### Key Architectural Patterns

**Session-Based Design**: Everything is organized around legislative sessions (year + session_code). Legislators can represent different districts in different sessions. Bills belong to a single session.

**Two-Step Scraping Workflow**: Always scrape legislators first (they must exist before bills can reference them), then scrape bills. This is critical.

**Smart Chunking**: Legislative text uses section-based chunking (keeps "Section A" together). Summaries use sentence-based chunking with overlap. See `ingestion/embeddings/chunking.py`.

**Embeddings Tracking**: Bills have `embeddings_generated` and `embeddings_generated_at` fields to prevent duplicates. Always use `--skip-embedded` when re-running embeddings unless you want to regenerate.

## Common Commands

### Setup
```bash
# Install dependencies
uv sync

# Install Playwright browsers (required for scraping)
uv run playwright install chromium

# Install dev dependencies (includes LangGraph CLI)
uv sync --group dev
```

### Scraping

**Single session:**
```bash
# Step 1: Scrape legislators first
uv run python ingestion/legislators/scrape_mo_legislators.py --year 2026

# Step 2: Scrape bills
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2026
```

**All sessions (2026-2000):**
```bash
uv run python ingestion/scrape_all_sessions.py
```

### Embeddings

**Single session:**
```bash
# Generate embeddings for one session
uv run python -m ingestion.embeddings.embeddings_pipeline --year 2026 --session-code R

# Skip bills that already have embeddings
uv run python -m ingestion.embeddings.embeddings_pipeline --year 2026 --session-code R --skip-embedded
```

**All sessions:**
```bash
# Process all sessions (skips already-embedded bills by default)
uv run python ingestion/generate_all_embeddings.py

# Force re-generation even for bills with existing embeddings
uv run python ingestion/generate_all_embeddings.py --force
```

### AI Agent

**LangGraph Studio (recommended for development):**
```bash
uv run langgraph dev
# Open https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

**Command line:**
```bash
uv run python -m agent.graph "What bills are about healthcare in 2026?"
```

### Database Migrations

Migrations must be run manually in Supabase SQL Editor. See `database/migrations/README.md`.

## Critical Files

### `ingestion/db_utils.py`
Central database class. All database operations go through this. Key methods:
- `get_or_create_session()` - Always use this, never create sessions manually
- `upsert_bill()` - Handles both insert and update logic
- `get_bills_for_session(skip_embedded=True)` - Filters out already-embedded bills
- `mark_bill_embeddings_generated()` - Called after successful embedding creation

### `ingestion/embeddings/chunking.py`
Text preprocessing and chunking logic:
- `clean_legislative_text()` - Strips null bytes, line numbers, headers
- `chunk_by_sections()` - For legislative text (keeps sections together)
- `chunk_by_sentences()` - For summaries (adds overlap)
- `chunk_document()` - Auto-detects type and applies appropriate strategy

### `agent/tools.py`
Agent tools using `@tool` decorator. Important patterns:
- Bill numbers must be normalized: "HB1366" → "HB 1366" (database uses spaces)
- Uses global singletons `_db` and `_vector_store` (class methods don't work with LangChain)
- Semantic search calls RPC directly (SupabaseVectorStore has compatibility issues)

### `agent/graph.py`
LangGraph agent implementation. Simple ReAct loop:
```
Agent → Tools → Agent → Response
```

## Environment Variables

Required in `.env`:
```bash
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
OPENAI_API_KEY=your-openai-key
```

Optional for LangGraph Studio:
```bash
LANGSMITH_API_KEY=your-langsmith-key  # For tracing
```

## Database Schema Notes

**Session Codes:**
- `R` = Regular session
- `S1` = First Special/Extraordinary session
- `S2` = Second Special/Extraordinary session

**Bill Numbers:** Stored with space (e.g., "HB 1366" not "HB1366"). Agent tools normalize both formats.

**Embeddings Metadata:** Stored as JSONB in `bill_embeddings.metadata`:
```json
{
  "bill_id": "uuid",
  "bill_number": "HB 1366",
  "session_year": 2026,
  "session_code": "R",
  "primary_sponsor_id": "uuid",
  "primary_sponsor_name": "Rep. Name",
  "cosponsor_ids": ["uuid1", "uuid2"],
  "cosponsor_names": ["Name1", "Name2"],
  "committee_ids": ["uuid1"],
  "committee_names": ["Committee Name"],
  "content_type": "Introduced",
  "chunk_index": 0,
  "doc_type": "legislative_text"
}
```

## Bill Document Filtering

Only these documents get embeddings (see `db_utils.get_embeddable_bill_documents()`):
1. "Introduced" version (always included)
2. Most recent version if different from Introduced
3. Fiscal notes are ALWAYS excluded

This prevents duplicate content and focuses on substantive legislative text.

## Development Workflow

### Adding a New Agent Tool

1. Add function to `agent/tools.py` with `@tool` decorator
2. Add to `get_tools()` list at bottom of file
3. Test with command line: `uv run python -m agent.graph "test query"`
4. Test with LangGraph Studio for interactive debugging

### Modifying Database Schema

1. Create SQL file in `database/migrations/`
2. Document in `database/migrations/README.md`
3. Run manually in Supabase SQL Editor
4. Update `DATABASE_SCHEMA.md` if needed
5. Update `db_utils.py` methods if needed

### Adding a New Scraper Field

1. Update scraper to extract field
2. Update `db_utils.upsert_bill()` or equivalent method
3. May need database migration if adding new column
4. Update `DATABASE_SCHEMA.md`

## Known Issues & Quirks

**Unicode Null Bytes**: PDFs sometimes contain `\x00` which breaks PostgreSQL. The chunking pipeline strips these automatically.

**Bill Number Formatting**: Always normalize "HB1366" to "HB 1366" before database queries.

**Session Creation Timing**: Always call `get_or_create_session()` before scraping. The session must exist before you can insert bills or legislators.

**Playwright Context**: Scrapers use async context managers. Always use `async with` pattern.

**Supabase Storage URLs**: Must have trailing slash or you'll get warnings.

**LangChain Tool Decorators**: Don't use `@tool` on class methods - it breaks. Use standalone functions with global singletons instead.

## Package Manager

This project uses **UV** (not pip/poetry/conda). All commands should use `uv run` prefix:
- ✅ `uv run python script.py`
- ✅ `uv run playwright install chromium`
- ❌ `python script.py` (won't use virtual environment)
- ❌ `pip install package` (use `uv add package` instead)
