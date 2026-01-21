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

🟢 **Phase 3: AI Agent with Next.js** (Complete)

- ✅ LangGraph.js agent with 6 specialized tools
- ✅ Semantic search using vector embeddings
- ✅ Bill lookup, timeline, and hearing queries
- ✅ Next.js 15 full-stack application with chat interface
- ✅ API routes for agent interactions

## Architecture

```
┌─────────────────┐
│  Next.js        │
│  Frontend       │
│  (React)        │
└────────┬────────┘
         │
┌────────▼────────┐
│  Next.js        │
│  API Routes     │
└────────┬────────┘
         │
┌────────▼────────┐
│  LangGraph.js   │
│  Agent          │
│  (TypeScript)   │
└────────┬────────┘
         │
┌────────▼────────┐
│  PostgreSQL     │
│  (Supabase)     │
│  + pgvector     │
└─────────────────┘
```

## Technology Stack

- **TypeScript** - Entire codebase including ingestion, agent, and app
- **Node.js 18+** - Runtime environment
- **Playwright** - Web scraping and automation
- **Next.js 15** - Full-stack React framework
- **LangGraph.js** - AI agent orchestration with RAG
- **OpenAI** - Embeddings (text-embedding-3-small) and LLM (GPT-4o)
- **Supabase** - PostgreSQL database with pgvector extension
- **Tailwind CSS** - Styling

**Next Steps:**
- Additional UI features and optimizations
- Production deployment

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

- [x] **Phase 3: AI Agent with Next.js**
  - [x] Build LangGraph.js agent in TypeScript
  - [x] Implement RAG pipeline
  - [x] Create 6 specialized tools for querying bill data
  - [x] Build Next.js full-stack application
  - [x] Create API routes for chat interactions
  - [x] Implement React chat interface

- [ ] **Phase 4: UI Improvements**
  - [ ] Enhanced chat interface with message history
  - [ ] Bill detail views
  - [ ] Search filters and facets
  - [ ] Responsive design improvements

- [ ] **Phase 5: Production Deployment**
  - [ ] Authentication and user management
  - [ ] Performance optimizations
  - [ ] Monitoring and analytics
  - [ ] Deploy to production

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nathanortbals/mo-bills.git
cd mo-bills
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Configure environment variables:

Create `.env.local` file in the root directory:
```bash
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-api-key
OPENAI_API_KEY=your-openai-api-key
```

### Usage

#### Running the Next.js App

Start the development server:
```bash
npm run dev
```

Open your browser to `http://localhost:3000` and start asking questions through the chat interface:
- "What bills are about healthcare in 2026?"
- "Tell me about HB 1366"
- "Show me the timeline for HB 2146"
- "What bills did Rep. Smith sponsor?"

**Available Agent Tools:**
The AI agent has access to 6 specialized tools:
- `search_bills_semantic` - Find bills by topic using vector search
- `get_bill_by_number` - Get detailed information about a specific bill
- `get_legislator_info` - Look up legislator details
- `get_bill_timeline` - View legislative history and actions
- `get_committee_hearings` - Find hearing information
- `search_bills_by_year` - Search bills by session year

**API Endpoint:**
You can also interact with the agent programmatically:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What bills are about education funding?"}'
```

#### Running the Agent in LangGraph Studio

LangGraph Studio provides a visual interface for debugging and testing your agent with real-time visualization of the agent's decision-making process.

**Prerequisites:**
- [LangGraph Studio Desktop App](https://github.com/langchain-ai/langgraph-studio) or LangGraph CLI
- Environment variables configured in `.env.local`

**Setup:**

1. Create a `langgraph.json` configuration file in the root directory:
```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./agent/graph.ts:createAgent"
  },
  "env": ".env.local"
}
```

2. Install LangGraph Studio Desktop or CLI:
```bash
# Desktop App (recommended)
# Download from: https://github.com/langchain-ai/langgraph-studio/releases

# OR CLI
npm install -g @langchain/langgraph-cli
```

3. Open the project in LangGraph Studio:
```bash
# Using Desktop App: File -> Open Project -> select mo-bills directory

# Using CLI:
langgraph dev
```

4. In the Studio interface:
   - Select the "agent" graph
   - Enter a test query like "What bills are about healthcare?"
   - Watch the agent execution flow in real-time
   - Inspect tool calls, messages, and state transitions
   - Debug with breakpoints and step-through execution

**Benefits of LangGraph Studio:**
- Visual graph representation of your agent
- Real-time execution tracing
- Tool call inspection
- State debugging
- Performance profiling

#### Data Ingestion

##### Single Session

The scraping process follows a 2-step workflow:

**Step 1: Scrape Legislators**
```bash
npm run ingest:legislators -- --year 2026
```

**Step 2: Scrape Bills**
```bash
npm run ingest:bills -- --year 2026
```

**Step 3: Generate Embeddings**
```bash
npm run ingest:embeddings -- --year 2026 --session-code R
```

Options:
- `--year`: Legislative year (required)
- `--session-code`: Session code - R (Regular), S1 (First Special), S2 (Second Special)
- `--limit`: Optional limit on number of bills to process

##### All Sessions (2026-2000)

To scrape all sessions at once:
```bash
npm run ingest:all
```

This will process sessions from 2026 back to 2000. The script is idempotent and can be safely interrupted and resumed.

To generate embeddings for all sessions:
```bash
npm run ingest -- generate-all-embeddings
```

The embeddings pipeline will:
- Extract text from bill PDFs in Supabase Storage
- Filter to "Introduced" + most recent version (excludes fiscal notes)
- Chunk using section-based or sentence-based strategies
- Generate embeddings via OpenAI text-embedding-3-small
- Store with comprehensive metadata (sponsors, committees, session info)


## Documentation

- **[Database Schema](DATABASE_SCHEMA.md)** - Complete schema documentation with table definitions, relationships, and example queries
- **[Claude Code Guidance](CLAUDE.md)** - Development guidance for working with this codebase

## Project Structure

```
mo-bills/
├── app/                          # Next.js application
│   ├── app/                      # Next.js app directory
│   │   ├── api/chat/            # Chat API endpoint
│   │   └── page.tsx             # Main page with chat interface
│   └── components/              # React components
├── agent/                        # LangGraph.js agent
│   ├── graph.ts                 # Agent graph definition
│   └── tools.ts                 # Agent tools (6 specialized tools)
├── ingestion/                    # TypeScript data ingestion
│   ├── bills/                   # Bill scraper
│   ├── legislators/             # Legislator scraper
│   ├── embeddings/              # Embeddings pipeline
│   │   ├── chunking.ts         # Text chunking strategies
│   │   └── embeddingsPipeline.ts # Main embeddings pipeline
│   ├── scrapeAllSessions.ts    # Batch scraper for all sessions
│   └── generateAllEmbeddings.ts # Batch embeddings generator
├── database/                     # Database types and migrations
│   ├── types.ts                 # Shared TypeScript types
│   └── migrations/              # SQL migration files
├── shared/                       # Shared utilities
│   └── db.ts                    # Database client and utilities
├── package.json                  # Node.js dependencies
├── .env.local                   # Environment variables (gitignored)
├── DATABASE_SCHEMA.md           # Database documentation
├── CLAUDE.md                    # Claude Code guidance
└── README.md                    # This file
```

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open an issue or submit a pull request.

## License

MIT License - See LICENSE file for details

## Contact

Nathan Ortbals - nathan.ortbals@gmail.com

Project Link: https://github.com/nathanortbals/mo-bills
