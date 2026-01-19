# Missouri Bills AI Chatbot

An AI-powered chatbot for querying and analyzing Missouri House of Representatives bills using RAG (Retrieval-Augmented Generation).

## Vision

This project aims to make Missouri legislative information accessible and queryable through natural language. Users will be able to ask questions about bills, sponsors, legislative actions, and more, with the AI agent providing informed responses based on comprehensive bill data.

## Current Status

🟢 **Phase 1: Data Ingestion** (Completed)

We have a fully functional web scraper that extracts comprehensive bill data from the Missouri House of Representatives website.

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

### Current (Ingestion)
- **Python 3.9+** - Core language
- **Playwright** - Web scraping and automation
- **UV** - Fast Python package management
- **httpx** - Async HTTP client for PDF downloads

### Planned
- **LangGraph/LangChain** - AI agent orchestration
- **FastAPI** - REST API backend
- **React** - Frontend user interface
- **PostgreSQL (Supabase)** - Database with pgvector extension
- **pgvector** - Vector similarity search for RAG

## Project Roadmap

- [x] **Phase 1: Data Ingestion**
  - [x] Scrape bill metadata (sponsors, actions, hearings)
  - [x] Download bill text PDFs
  - [x] Export to structured CSV format

- [ ] **Phase 2: Database & Vectorization**
  - [ ] Set up Supabase PostgreSQL instance
  - [ ] Configure pgvector extension
  - [ ] Import bill data into database
  - [ ] Generate embeddings for bill text and metadata
  - [ ] Create vector indexes for similarity search

- [ ] **Phase 3: AI Agent Development**
  - [ ] Build LangChain/LangGraph agent
  - [ ] Implement RAG pipeline
  - [ ] Create tools for querying bill data
  - [ ] Add conversation memory and context handling

- [ ] **Phase 4: API Backend**
  - [ ] Build FastAPI application
  - [ ] Create REST endpoints for chat interactions
  - [ ] Implement authentication and rate limiting
  - [ ] Add API documentation

- [ ] **Phase 5: Frontend**
  - [ ] Build React chat interface
  - [ ] Implement real-time messaging
  - [ ] Add bill visualization components
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

### Usage

#### Scrape Bills

Scrape all bills from a specific legislative session:

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023
```

This will:
- Scrape comprehensive bill data (sponsors, co-sponsors, actions, hearings)
- Download all bill text PDFs
- Save data to `mo-house-bills-2023-R.csv`
- Store PDFs in `bill_pdfs/` organized by bill number

#### Options

- `--year`: Legislative year (omit for current session)
- `--session-code`: Session type - `R` for Regular (default), `E` for Extraordinary
- `--output`: Custom output CSV filename
- `--limit`: Limit number of bills (useful for testing)
- `--pdf-dir`: Custom directory for PDFs (default: `bill_pdfs`)

#### Example: Test with Limited Bills

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023 --limit 10
```

## Data Collected

For each bill, the scraper extracts:

### Basic Information
- Bill number and title
- Full description
- Bill URLs

### Sponsors
- Primary sponsor with profile URL
- All co-sponsors

### Legislative History
- All legislative actions with dates
- Committee hearings (date, time, location, committee)

### Documents
- Bill text in multiple versions (Introduced, Committee, Perfected, Truly Agreed)
- Downloaded PDF files with local paths

### Status Information
- LR number and bill string
- Last action and effective date
- Calendar and hearing status

## Project Structure

```
mo-bills/
├── ingestion/
│   └── bills/
│       ├── scrape_mo_house_bills.py  # Bill scraper
│       ├── README.md                  # Ingestion documentation
│       └── __init__.py
├── bill_pdfs/                         # Downloaded bill PDFs (gitignored)
├── pyproject.toml                     # Project dependencies
├── .gitignore
└── README.md                          # This file
```

## Data Sources

- **Current session**: https://house.mo.gov/billlist.aspx
- **Archive sessions**: https://archive.house.mo.gov/billlist.aspx
- **Bill details**: https://archive.house.mo.gov/BillContent.aspx
- **Co-sponsors**: https://archive.house.mo.gov/CoSponsors.aspx
- **Bill actions**: https://archive.house.mo.gov/BillActions.aspx
- **Bill hearings**: https://archive.house.mo.gov/BillHearings.aspx

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open an issue or submit a pull request.

## License

MIT License - See LICENSE file for details

## Contact

Nathan Ortbals - nathan.ortbals@gmail.com

Project Link: https://github.com/nathanortbals/mo-bills
