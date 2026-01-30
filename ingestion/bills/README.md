# Missouri House Bill Scraper

Scrapes Missouri House of Representatives bills, extracts PDF text, generates embeddings, and stores everything in Supabase.

## File Structure

```
ingestion/bills/
├── scraper.ts     - Main entry point (scrapeBillsForSession)
├── bills.ts       - Bill list + details scraping
├── hearings.ts    - Hearing scraping + time parsing
├── actions.ts     - Action scraping
├── sponsors.ts    - Sponsor/cosponsor scraping
├── documents.ts   - PDF download + text extraction
├── embeddings.ts  - Embedding generation for bills
├── types.ts       - TypeScript interfaces
```

## Usage

Run this **after** scraping legislators to ensure all bill sponsors can be properly linked.

### From CLI

```bash
# Scrape current session (2026)
npm run ingest:bills

# Scrape specific year
npm run ingest:bills -- --year 2025

# Scrape with session code
npm run ingest:bills -- --year 2025 --session-code S1

# Force re-process bills with existing extracted text
npm run ingest:bills -- --year 2026 --force
```

### Programmatic

```typescript
import { scrapeBillsForSession } from '@/ingestion/bills/scraper';

await scrapeBillsForSession({
  year: 2026,
  sessionCode: 'R',
  limit: 10,        // Optional: limit bills for testing
  pdfDir: 'pdfs',   // Optional: custom PDF directory
  force: false,     // Optional: re-process existing bills
});
```

## What It Does

For each bill:
1. Scrapes bill list from house.mo.gov
2. Scrapes detailed information (title, sponsors, status)
3. Scrapes co-sponsors, actions, and hearings
4. Downloads PDF documents and extracts text
5. Inserts/updates bill in database with extracted text
6. Generates embeddings from the extracted text

Bills with existing extracted text are skipped unless `--force` is used.

## Data Collected

- **Bill info**: Number, title, description, LR number, status
- **Sponsors**: Primary sponsor and co-sponsors (linked to legislators)
- **Actions**: Complete legislative history with dates
- **Hearings**: Committee hearings with dates, times, locations
- **Documents**: PDF text extracted and stored (PDFs saved locally)
- **Embeddings**: Vector embeddings for semantic search

## Idempotency

The scraper is idempotent:
- Updates existing bills with latest information
- Skips bills that already have extracted text (unless `--force`)
- Uses bill_number + session as unique key

## Data Sources

**Current session:**
- https://house.mo.gov/billlist.aspx

**Archive sessions:**
- https://archive.house.mo.gov/billlist.aspx?year={year}&code={code}

## Environment

Requires `.env.local` at project root:

```bash
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-api-key
OPENAI_API_KEY=your-openai-key
```
