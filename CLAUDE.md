# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Show-Me AI is an AI-powered chatbot for querying Missouri legislative bills (House and Senate) using RAG (Retrieval-Augmented Generation). Named after Missouri's nickname, "The Show-Me State." Built as a **TypeScript monorepo**, the project scrapes legislative data, generates vector embeddings, and provides a Next.js application with a LangGraph.js agent for natural language queries.

**Current Phase**: Phase 3 complete (AI Agent with Next.js). Migrated to TypeScript monorepo. Next phases: UI improvements, production deployment.

## Architecture

### Three-Layer System

1. **Ingestion Layer** (`ingestion/` - TypeScript)
   - Scrapes legislators and bills from Missouri House and Senate websites using Playwright
   - Organized into `house/`, `senate/`, and `shared/` subfolders
   - Stores data in Supabase PostgreSQL + pgvector
   - Generates embeddings for semantic search using OpenAI
   - Command-line interface via `ingestion/cli.ts`
   - Uses npm for package management (monorepo)

2. **Application Layer** (`app/` - TypeScript/Next.js)
   - Next.js 15 full-stack application
   - LangGraph.js agent with 6 specialized tools
   - Uses GPT-4o for reasoning and OpenAI embeddings (text-embedding-3-small)
   - Semantic search via pgvector similarity
   - API routes for chat functionality

3. **Storage Layer** (Supabase)
   - PostgreSQL with pgvector extension
   - Session-based schema (see DATABASE_SCHEMA.md)
   - Bill PDF text is extracted during scraping and stored in the database (no Supabase Storage)

### Key Architectural Patterns

**Session-Based Design**: Everything is organized around legislative sessions (year + session_code). Legislators can represent different districts in different sessions. Bills belong to a single session.

**Two-Step Scraping Workflow**: Always scrape legislators first (they must exist before bills can reference them), then scrape bills. This is critical.

**Smart Chunking**: Legislative text uses section-based chunking (keeps "Section A" together). Summaries use sentence-based chunking with overlap. See `ingestion/shared/chunking.ts`.

**Inline Processing**: Text extraction and embedding generation happen during bill scraping (single pass). Bills with existing extracted text are skipped unless `--force` is used.

## Common Commands

### Setup
```bash
# Install all dependencies (monorepo - installs both ingestion and app)
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Scraping

**House (single session):**
```bash
npm run ingest:house -- --year 2026
```

**Senate (single session):**
```bash
npm run ingest:senate -- --year 2026

# With limit for testing
npm run ingest:senate -- --year 2026 --limit 10
```

**All sessions (2026-2000):**
```bash
npm run ingest:house-all
npm run ingest:senate-all
```

**Re-process existing bills (force re-extraction and re-embedding):**
```bash
npm run ingest:house -- --year 2026 --force
npm run ingest:senate -- --year 2026 --force
```

### Next.js App & AI Agent

**Development server:**
```bash
cd app
npm run dev
# Open http://localhost:3000
```

**Build for production:**
```bash
cd app
npm run build
npm start
```

**Test API endpoint:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What bills are about healthcare?"}'
```

### Database Migrations

Migrations must be run manually in Supabase SQL Editor. See `database/migrations/README.md`.

## Critical Files

### `ingestion/cli.ts`
Command-line interface for all ingestion operations. Provides commands for:
- `scrape-house` - Scrape House legislators and bills for a session
- `scrape-senate` - Scrape Senate senators and bills for a session
- `scrape-house-all` - Scrape all House sessions (2026-2000)
- `scrape-senate-all` - Scrape all Senate sessions (2026-2000)

### `database/client.ts`
Central database client class. All database operations go through this. Key methods:
- `getOrCreateSession()` - Always use this, never create sessions manually
- `upsertBill()` - Handles both insert and update logic
- `upsertLegislator()` - Insert or update legislator records
- `deleteEmbeddingsForBill()` - Delete embeddings before re-generating (ensures idempotency)
- `getSessionLegislatorByName()` - Find legislator by name with partial matching support

### `ingestion/shared/chunking.ts`
Text preprocessing and chunking logic:
- `cleanLegislativeText()` - Strips null bytes, line numbers, headers
- `chunkBySections()` - For legislative text (keeps sections together)
- `chunkBySentences()` - For summaries (adds overlap)
- `chunkDocument()` - Auto-detects type and applies appropriate strategy

### `ingestion/shared/embeddings.ts`
Embedding generation for bill documents using OpenAI and LangChain.

### `ingestion/house/bills/scraper.ts`
House bill scraper orchestration - scrapes bills, downloads PDFs, extracts text, generates embeddings.

### `ingestion/senate/bills/scraper.ts`
Senate bill scraper orchestration - scrapes senators, bills, downloads PDFs, extracts text, generates embeddings.

### `agent/tools.ts`
Agent tools using LangChain's `tool()` function. Important patterns:
- Bill numbers must be normalized: "HB1366" → "HB 1366" (database uses spaces)
- Uses `normalizeBillNumber()` helper function for consistent formatting
- Semantic search uses `SupabaseVectorStore` with filter functions for metadata filtering
  - Supports filtering by session year, session code, sponsor name, committee name
  - Uses query builder approach (e.g., `rpc.filter('metadata->session_year', 'eq', 2025)`)
  - Integrates cleanly with LangChain's RAG patterns
- Each tool has zod schema for type safety
- Returns formatted strings optimized for LLM consumption

### `agent/graph.ts`
LangGraph.js agent implementation. Simple ReAct loop:
```
Agent → Tools → Agent → Response
```
Uses `StateGraph` with `MessagesAnnotation` for state management.

### `app/lib/db.ts`
Database client singleton. Uses `@supabase/supabase-js` for all database operations.

### `app/app/api/chat/route.ts`
Next.js API route for chat interactions. Receives POST requests with a message and returns agent responses.

## Environment Variables

**Required in `.env.local` (root of monorepo):**
```bash
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
OPENAI_API_KEY=your-openai-key
```

**Optional:**
```bash
LANGSMITH_API_KEY=your-langsmith-key  # For tracing
LANGSMITH_TRACING=true  # Enable tracing
```

Note: The monorepo uses a single `.env.local` file at the root, shared by both the ingestion layer and the Next.js app.

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

Only these documents get embeddings (see `database/client.ts` `getEmbeddableBillDocuments()`):
1. "Introduced" version (always included)
2. Most recent version if different from Introduced
3. Fiscal notes are ALWAYS excluded

This prevents duplicate content and focuses on substantive legislative text.

## Development Workflow

### Adding a New Agent Tool

1. Add function to `agent/tools.ts` using LangChain's `tool()` function
2. Add to tools array in `agent/graph.ts`
3. Test with the Next.js API endpoint or via LangGraph Studio
4. Ensure proper zod schema validation for inputs

### Modifying Database Schema

1. Create SQL file in `database/migrations/`
2. Document in `database/migrations/README.md`
3. Run manually in Supabase SQL Editor
4. Update `DATABASE_SCHEMA.md` if needed
5. Update `ingestion/database/client.ts` methods if needed

### Adding a New Scraper Field

1. Update scraper in `ingestion/house/` or `ingestion/senate/` to extract field
2. Update `database/client.ts` `upsertBill()` or equivalent method
3. May need database migration if adding new column
4. Update `DATABASE_SCHEMA.md`

## Known Issues & Quirks

**Unicode Null Bytes**: PDFs sometimes contain `\x00` which breaks PostgreSQL. The chunking pipeline strips these automatically.

**Bill Number Formatting**: Always normalize "HB1366" to "HB 1366" before database queries. Use the `normalizeBillNumber()` helper function in agent tools.

**Session Creation Timing**: Always call `getOrCreateSession()` before scraping. The session must exist before you can insert bills or legislators.

**Playwright Context**: Scrapers use async context managers in TypeScript. Always use proper async/await patterns.

**LangChain Tool Functions**: Tools must be standalone functions (not class methods) when using LangChain's `tool()` decorator. Use singleton pattern for shared state if needed.

**TypeScript Async/Await**: All database operations and scraping functions are async. Always await promises and handle errors appropriately.

## Package Manager

This project uses **npm** as a TypeScript monorepo. All commands should use `npm` or `npx`:
- ✅ `npm install` - Install all dependencies
- ✅ `npm run <script>` - Run package.json scripts
- ✅ `npx playwright install chromium` - Install Playwright browsers
- ✅ `npm install <package>` - Add new dependencies
- ❌ `yarn` or `pnpm` - Not used in this project

**Common npm scripts:**
- `npm run ingest:house` - Scrape House legislators and bills
- `npm run ingest:senate` - Scrape Senate senators and bills
- `npm run ingest:house-all` - Scrape all House sessions (2026-2000)
- `npm run ingest:senate-all` - Scrape all Senate sessions (2026-2000)
- `npm run dev` - Start Next.js dev server (from app/ directory)
- `npm run build` - Build Next.js app (from app/ directory)
