# Missouri House Bill Scraper

This script scrapes Missouri House of Representatives bills and inserts them into Supabase.

## Purpose

Run this script **after** scraping legislators to ensure all bill sponsors can be properly linked to their complete profiles in the database.

## Installation

Dependencies are already installed via the main project. Make sure you've run:

```bash
uv sync
uv run playwright install chromium
```

## Usage

### Recommended Workflow

For best results, always scrape legislators first, then bills:

**Step 1: Scrape Legislators**

```bash
uv run python ingestion/legislators/scrape_mo_legislators.py --year 2023
```

**Step 2: Scrape Bills**

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023
```

This ensures all legislator profiles are complete before bills reference them as sponsors.

### Scrape Current Session Bills

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py
```

Omit the `--year` parameter to scrape bills from the current legislative session.

### Scrape Specific Year

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023
```

This will:
- Scrape all bills from the 2023 regular session
- Link sponsors to existing legislators in the database
- Download all bill text PDFs to `bill_pdfs/`
- Insert all data directly into Supabase database

### Scrape Extraordinary Session

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023 --session-code E
```

### Test with Limited Bills

To test the scraper with just a few bills:

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023 --limit 5
```

### Custom PDF Directory

By default, PDFs are saved to `bill_pdfs/`. You can specify a custom directory:

```bash
uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023 --pdf-dir my_pdfs
```

## Options

- `--year`: Legislative year (omit for current session)
- `--session-code`: Session type - `R` for Regular (default), `E` for Extraordinary
- `--limit`: Limit number of bills to scrape (useful for testing)
- `--pdf-dir`: Directory to save PDFs (default: `bill_pdfs`)
- `--supabase-url`: Override SUPABASE_URL env var
- `--supabase-key`: Override SUPABASE_KEY env var

## Output

The script provides progress output showing:
- Number of bills found
- Progress for each bill (X/Y)
- Whether each bill was inserted or updated
- Warnings for any errors
- Final summary with counts

Example:
```
Found 1234 bills

Scraping detailed information for 1234 bills...
[1/1234] Scraping details for HB1...
  ✓ Inserted to database with ID: abc123...
[2/1234] Scraping details for HB2...
  ✓ Updated in database with ID: def456...
...

✓ Successfully processed 1234 bills into database
```

## Data Collected

For each bill:
- **Bill number** - Identifier (e.g., HB1607)
- **Title and description** - Full bill text summary
- **Sponsors** - Primary sponsor and co-sponsors linked to legislators table
- **Legislative details** - LR number, bill string, effective date
- **Status** - Last action, calendar status, hearing status
- **Complete history** - All bill actions with dates
- **Hearings** - Committee hearings with dates, times, and locations
- **Documents** - Bill text PDFs in multiple versions

## Idempotency

The scraper is idempotent - you can run it multiple times on the same session and it will:
- Update existing bills with latest information
- Insert new bills that weren't in the database
- Delete and re-insert related data (sponsors, actions, hearings, documents)
- Not create duplicates (uses bill_number + year + session_code as unique key)

## Data Sources

All data is scraped from official Missouri House of Representatives websites:

**Current session:**
- Bills: https://house.mo.gov/billlist.aspx
- Details: https://house.mo.gov/BillContent.aspx

**Archive sessions:**
- Bills: https://archive.house.mo.gov/billlist.aspx?year={year}&code={code}
- Details: https://archive.house.mo.gov/BillContent.aspx?bill={bill}&year={year}&code={code}
- Co-sponsors: https://archive.house.mo.gov/CoSponsors.aspx?bill={bill}&year={year}&code={code}
- Actions: https://archive.house.mo.gov/BillActions.aspx?bill={bill}&year={year}&code={code}
- Hearings: https://archive.house.mo.gov/BillHearings.aspx?Bill={bill}&year={year}&code={code}

## Environment Setup

The scraper requires Supabase credentials to be configured. Create a `.env` file in the project root:

```bash
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-api-key
```

The scraper will automatically load these credentials from the `.env` file.

## Legislator Linking

The scraper links bill sponsors to legislators in the database:

1. **Primary sponsors**: Looks up by name in legislators table
2. **Co-sponsors**: Looks up by name in legislators table
3. **Missing legislators**: Creates placeholder records with warning

If you see warnings like "Primary sponsor 'John Doe' not found in database", run the legislator scraper first to populate complete legislator profiles.
