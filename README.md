# Show-Me AI

An AI-powered chatbot for querying and analyzing Missouri legislative bills (House and Senate) using RAG (Retrieval-Augmented Generation). Named after Missouri's nickname, "The Show-Me State."

## Vision

This project aims to make Missouri legislative information accessible and queryable through natural language. Users will be able to ask questions about bills, sponsors, legislative actions, and more, with the AI agent providing informed responses based on comprehensive bill data.

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

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nathanortbals/show-me-ai.git
cd show-me-ai
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
# Using Desktop App: File -> Open Project -> select show-me-ai directory

# Using CLI:
langgraphjs dev
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

**House (legislators + bills):**
```bash
npm run ingest:house -- --year 2026
```

**Senate (senators + bills):**
```bash
npm run ingest:senate -- --year 2026
```

Options:
- `--year`: Legislative year (default: 2026)
- `--session-code`: Session code - R (Regular), S1 (First Special), S2 (Second Special)
- `--limit`: Optional limit on number of bills to process (Senate only)
- `--force`: Re-process bills that already have extracted text

##### All Sessions (2026-2000)

To scrape all House sessions:
```bash
npm run ingest:house-all
```

To scrape all Senate sessions:
```bash
npm run ingest:senate-all
```

Options:
- `--start-year <year>`: Start from a specific year and work backwards (default: 2026)

The scraping pipeline will:
- Scrape legislators/senators first (required for sponsor linking)
- Download bill PDFs and extract text
- Generate embeddings via OpenAI text-embedding-3-small
- Store with comprehensive metadata (sponsors, committees, session info)
- Skip already-processed bills by default (use `--force` to re-process)


## Documentation

- **[Database Schema](DATABASE_SCHEMA.md)** - Complete schema documentation with table definitions, relationships, and example queries
- **[Claude Code Guidance](CLAUDE.md)** - Development guidance for working with this codebase

## Project Structure

```
show-me-ai/
├── app/                          # Next.js application
│   ├── app/                      # Next.js app directory
│   │   ├── api/chat/            # Chat API endpoint
│   │   └── page.tsx             # Main page with chat interface
│   └── components/              # React components
├── agent/                        # LangGraph.js agent
│   ├── graph.ts                 # Agent graph definition
│   └── tools.ts                 # Agent tools (6 specialized tools)
├── ingestion/                    # TypeScript data ingestion
│   ├── house/                   # House scraper modules
│   │   ├── bills/              # House bill scraper
│   │   └── legislators/        # House legislator scraper
│   ├── senate/                  # Senate scraper modules
│   │   ├── bills/              # Senate bill scraper
│   │   └── legislators/        # Senator scraper
│   ├── shared/                  # Shared ingestion utilities
│   │   ├── chunking.ts         # Text chunking strategies
│   │   ├── embeddings.ts       # Embeddings generation
│   │   └── documents.ts        # PDF download and extraction
│   └── cli.ts                   # Command-line interface
├── database/                     # Database types and migrations
│   ├── client.ts                # Database client class
│   ├── types.ts                 # Shared TypeScript types
│   └── migrations/              # SQL migration files
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

Project Link: https://github.com/nathanortbals/show-me-ai
