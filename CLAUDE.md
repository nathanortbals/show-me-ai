# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MO Bills is an AI-powered chatbot for querying Missouri House of Representatives bills using RAG (Retrieval-Augmented Generation). Built as a **TypeScript monorepo**, the project scrapes legislative data, generates vector embeddings, and provides a Next.js application with a LangGraph.js agent for natural language queries.

**Current Phase**: Phase 3 complete (AI Agent with Next.js). Migrated to TypeScript monorepo. Next phases: UI improvements, production deployment.

## Architecture

### Three-Layer System

1. **Ingestion Layer** (`ingestion/` - TypeScript)
   - Scrapes legislators and bills from Missouri House website using Playwright
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
   - Supabase Storage for bill PDFs

### Key Architectural Patterns

**Session-Based Design**: Everything is organized around legislative sessions (year + session_code). Legislators can represent different districts in different sessions. Bills belong to a single session.

**Two-Step Scraping Workflow**: Always scrape legislators first (they must exist before bills can reference them), then scrape bills. This is critical.

**Smart Chunking**: Legislative text uses section-based chunking (keeps "Section A" together). Summaries use sentence-based chunking with overlap. See `ingestion/embeddings/chunking.ts`.

**Embeddings Tracking**: Bills have `embeddings_generated` and `embeddings_generated_at` fields to prevent duplicates. Always use `--skip-embedded` when re-running embeddings unless you want to regenerate.

## Common Commands

### Setup
```bash
# Install all dependencies (monorepo - installs both ingestion and app)
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Scraping

**Single session:**
```bash
# Step 1: Scrape legislators first
npm run ingest:legislators -- --year 2026

# Step 2: Scrape bills
npm run ingest:bills -- --year 2026
```

**All sessions (2026-2000):**
```bash
npm run ingest:all
```

### Embeddings

**Single session:**
```bash
# Generate embeddings for one session
npm run ingest:embeddings -- --year 2026 --session-code R

# Skip bills that already have embeddings (default behavior)
npm run ingest:embeddings -- --year 2026 --session-code R --skip-embedded
```

**All sessions:**
```bash
# Process all sessions (skips already-embedded bills by default)
npm run ingest:embeddings:all

# Force re-generation even for bills with existing embeddings
npm run ingest:embeddings:all -- --force
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
- `legislators` - Scrape legislators for a session
- `bills` - Scrape bills for a session
- `all` - Scrape all sessions (legislators then bills)
- `embeddings` - Generate embeddings for a session
- `embeddings:all` - Generate embeddings for all sessions

### `ingestion/database/client.ts`
Central database client class. All database operations go through this. Key methods:
- `getOrCreateSession()` - Always use this, never create sessions manually
- `upsertBill()` - Handles both insert and update logic
- `getBillsForSession(skipEmbedded=true)` - Filters out already-embedded bills
- `markBillEmbeddingsGenerated()` - Called after successful embedding creation

### `ingestion/embeddings/chunking.ts`
Text preprocessing and chunking logic:
- `cleanLegislativeText()` - Strips null bytes, line numbers, headers
- `chunkBySections()` - For legislative text (keeps sections together)
- `chunkBySentences()` - For summaries (adds overlap)
- `chunkDocument()` - Auto-detects type and applies appropriate strategy

### `agent/tools.ts`
Agent tools using LangChain's `tool()` function. Important patterns:
- Bill numbers must be normalized: "HB1366" → "HB 1366" (database uses spaces)
- Uses `normalizeBillNumber()` helper function for consistent formatting
- Semantic search calls Supabase RPC function `match_bill_embeddings` directly
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

Only these documents get embeddings (see `ingestion/database/client.ts` `getEmbeddableBillDocuments()`):
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

1. Update scraper in `ingestion/scrapers/` to extract field
2. Update `ingestion/database/client.ts` `upsertBill()` or equivalent method
3. May need database migration if adding new column
4. Update `DATABASE_SCHEMA.md`

## Known Issues & Quirks

**Unicode Null Bytes**: PDFs sometimes contain `\x00` which breaks PostgreSQL. The chunking pipeline strips these automatically.

**Bill Number Formatting**: Always normalize "HB1366" to "HB 1366" before database queries. Use the `normalizeBillNumber()` helper function in agent tools.

**Session Creation Timing**: Always call `getOrCreateSession()` before scraping. The session must exist before you can insert bills or legislators.

**Playwright Context**: Scrapers use async context managers in TypeScript. Always use proper async/await patterns.

**Supabase Storage URLs**: Must have trailing slash or you'll get warnings.

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
- `npm run ingest:legislators` - Scrape legislators
- `npm run ingest:bills` - Scrape bills
- `npm run ingest:all` - Scrape all sessions
- `npm run ingest:embeddings` - Generate embeddings
- `npm run ingest:embeddings:all` - Generate all embeddings
- `npm run dev` - Start Next.js dev server (from app/ directory)
- `npm run build` - Build Next.js app (from app/ directory)
