# MO Bills

An AI-powered chatbot for querying and analyzing Missouri House of Representatives bills using RAG (Retrieval-Augmented Generation).

## Vision

This project aims to make Missouri legislative information accessible and queryable through natural language. Users will be able to ask questions about bills, sponsors, legislative actions, and more, with the AI agent providing informed responses based on comprehensive bill data.

## Current Status

🟢 **Phase 1: Data Ingestion & Storage** (Complete)

- ✅ Web scraper built and functional
- ✅ Comprehensive bill data extraction (sponsors, actions, hearings, PDFs)
- ✅ Legislator profile scraping (party, years served, active status)
- ✅ Session-based database architecture
- ✅ Direct insertion into PostgreSQL with pgvector

🟢 **Phase 2: Vectorization & RAG Setup** (Complete)

- ✅ Embeddings pipeline with LangChain SDK
- ✅ Smart chunking (section-based for legislative text, sentence-based for summaries)
- ✅ Document filtering (Introduced + most recent version, excludes fiscal notes)
- ✅ Rich metadata (session, sponsors, co-sponsors, committees)
- ✅ Vector storage with pgvector and similarity search function

🟡 **Phase 3: AI Agent Development** (In Progress)

## Architecture (Planned)

```
┌─────────────────┐
│  React Frontend │
└────────┬────────┘
         │
┌────────▼────────┐
│  FastAPI        │
│  Backend        │
└────────┬────────┘
         │
┌────────▼────────┐
│  LangGraph/     │
│  LangChain      │
│  Agent          │
└────────┬────────┘
         │
┌────────▼────────┐
│  PostgreSQL     │
│  (Supabase)     │
│  + pgvector     │
└─────────────────┘
```

## Technology Stack

**Current:**
- **Python 3.9+** - Core language
- **Playwright** - Web scraping and automation
- **UV** - Fast Python package management
- **Supabase** - PostgreSQL database with pgvector extension

**Planned:**
- **LangGraph/LangChain** - AI agent orchestration
- **FastAPI** - REST API backend
- **React** - Frontend user interface

## Project Roadmap

- [x] **Phase 1: Data Ingestion & Storage**
  - [x] Scrape bill metadata (sponsors, actions, hearings)
  - [x] Scrape legislator details (party, years served, active status)
  - [x] Download bill text PDFs
  - [x] Design session-based database schema
  - [x] Direct insertion of scraped data into Supabase

- [x] **Phase 2: Vectorization & RAG Setup**
  - [x] Generate embeddings for bill text and metadata
  - [x] Create vector indexes for similarity search
  - [x] Implement smart chunking strategies
  - [x] Add comprehensive metadata to embeddings

- [ ] **Phase 3: AI Agent Development**
  - [ ] Build LangChain/LangGraph agent
  - [ ] Implement RAG pipeline
  - [ ] Create tools for querying bill data

- [ ] **Phase 4: API Backend**
  - [ ] Build FastAPI application
  - [ ] Create REST endpoints for chat interactions
  - [ ] Implement authentication

- [ ] **Phase 5: Frontend**
  - [ ] Build React chat interface
  - [ ] Implement real-time messaging
  - [ ] Deploy to production

## Getting Started

### Prerequisites

- Python 3.9 or higher
- [UV](https://github.com/astral-sh/uv) package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nathanortbals/mo-bills.git
cd mo-bills
```

2. Install dependencies:
```bash
uv sync
```

3. Install Playwright browsers:
```bash
uv run playwright install chromium
```

4. Configure environment variables:

Create a `.env` file in the project root:
```bash
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-api-key
OPENAI_API_KEY=your-openai-api-key
```

### Usage

#### Single Session

The scraping process follows a 2-step workflow:

**Step 1: Scrape Legislators**
```bash
uv run python ingestion/legislators/scrape_mo_legislators.py --year 2023
```

**Step 2: Scrape Bills**
```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023
```

#### All Sessions (2026-2000)

To scrape all sessions at once:
```bash
uv run python ingestion/scrape_all_sessions.py
```

This will process sessions from 2026 back to 2000. The script is idempotent and can be safely interrupted and resumed.

**Step 3: Generate Embeddings**

After scraping bills, generate vector embeddings for semantic search:
```bash
uv run python -m ingestion.embeddings.embeddings_pipeline --year 2026 --session-code R
```

Options:
- `--year`: Legislative year (required)
- `--session-code`: Session code - R (Regular), S1 (First Special), S2 (Second Special)
- `--limit`: Optional limit on number of bills to process

The pipeline will:
- Extract text from bill PDFs in Supabase Storage
- Filter to "Introduced" + most recent version (excludes fiscal notes)
- Chunk using section-based or sentence-based strategies
- Generate embeddings via OpenAI text-embedding-3-small
- Store with comprehensive metadata (sponsors, committees, session info)

For detailed usage instructions and options, see:
- [Legislator Scraper Documentation](ingestion/legislators/README.md)
- [Bill Scraper Documentation](ingestion/bills/README.md)

## Documentation

- **[Database Schema](DATABASE_SCHEMA.md)** - Complete schema documentation with table definitions, relationships, and example queries
- **[Legislator Scraper](ingestion/legislators/README.md)** - Scraper usage, options, and data sources
- **[Bill Scraper](ingestion/bills/README.md)** - Scraper usage, options, and data sources

## Project Structure

```
mo-bills/
├── ingestion/
│   ├── bills/                      # Bill scraper
│   ├── legislators/                # Legislator scraper
│   ├── embeddings/                 # Embeddings pipeline
│   │   ├── chunking.py             # Text chunking strategies
│   │   └── embeddings_pipeline.py  # Main embeddings pipeline
│   ├── scrape_all_sessions.py      # Batch scraper for all sessions
│   └── db_utils.py                 # Shared database utilities
├── database/
│   └── migrations/                 # Database migrations
├── bill_pdfs/                      # Downloaded PDFs (gitignored)
├── DATABASE_SCHEMA.md              # Database documentation
├── pyproject.toml                  # Project dependencies
├── .env                            # Credentials (gitignored)
└── README.md                       # This file
```

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open an issue or submit a pull request.

## License

MIT License - See LICENSE file for details

## Contact

Nathan Ortbals - nathan.ortbals@gmail.com

Project Link: https://github.com/nathanortbals/mo-bills
