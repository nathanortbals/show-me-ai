# Missouri House Legislator Scraper

This script scrapes Missouri House of Representatives legislators and inserts them into Supabase.

## Purpose

Run this script **before** scraping bills to ensure all legislators are in the database with their full profile information. This allows the bill scraper to reference existing legislators when creating bill sponsor relationships.

## Installation

Dependencies are already installed via the main project. Make sure you've run:

```bash
uv sync
uv run playwright install chromium
```

## Usage

### Scrape All Legislators for a Session

```bash
uv run python ingestion/legislators/scrape_mo_legislators.py --year 2023
```

This will:
- Scrape the list of all legislators for the 2023 regular session
- For each legislator, visit their profile page and extract:
  - Name and legislator type (Representative/Senator)
  - District and party affiliation
  - Year elected and years served
  - Active status (current vs. former legislators)
  - Profile picture URL
- Upsert each legislator into the database (insert if new, update if exists)

### Scrape Current Session Legislators

```bash
uv run python ingestion/legislators/scrape_mo_legislators.py
```

Omit the `--year` parameter to scrape legislators from the current legislative session.

### Options

- `--year`: Legislative year (omit for current session)
- `--session-code`: Session type - `R` for Regular (default), `E` for Extraordinary
- `--supabase-url`: Override SUPABASE_URL env var
- `--supabase-key`: Override SUPABASE_KEY env var

## Recommended Workflow

1. **First**: Scrape legislators for the session
   ```bash
   uv run python ingestion/legislators/scrape_mo_legislators.py --year 2023
   ```

2. **Second**: Scrape bills for the same session
   ```bash
   uv run python ingestion/bills/scrape_mo_house_bills.py --year 2023
   ```

This ensures all legislator profiles are complete before bills reference them as sponsors.

## Output

The script provides progress output showing:
- Number of legislators found
- Progress for each legislator (X/Y)
- Whether each legislator was inserted or updated
- Final summary with counts

Example:
```
Found 163 legislators

Scraping detailed information for 163 legislators...
[1/163] Scraping Joe Adams (District 086)...
  ✓ Inserted to database with ID: abc123...
[2/163] Scraping Justin Alferman (District 061)...
  ✓ Updated in database with ID: def456...
...

✓ Successfully processed 163 legislators
  - Inserted: 150
  - Updated: 13
```

## Data Collected

For each legislator:
- **Name** - Full name without title prefix
- **Legislator Type** - "Representative" or "Senator"
- **District** - District number
- **Party Affiliation** - Full party name (Republican, Democrat, etc.)
- **Year Elected** - Year first elected to office
- **Years Served** - Total years of service
- **Active Status** - True for current legislators, False for former
- **Picture URL** - URL to official profile photo
- **Profile URL** - Link to official profile page

## Idempotency

The scraper is idempotent - you can run it multiple times on the same session and it will:
- Update existing legislators with latest information
- Insert new legislators that weren't in the database
- Not create duplicates (uses name + district as unique key)
