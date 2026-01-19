# Database Schema

The MO Bills database uses PostgreSQL (via Supabase) with a session-based normalized schema optimized for tracking legislative data across multiple sessions.

## Architecture Overview

The schema is built around **sessions** as the central organizing concept. Bills and legislators are linked through sessions, enabling proper historical tracking and allowing legislators to represent different districts in different sessions.

## Tables

### Core Tables

#### sessions
Legislative sessions representing a specific year and session type.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| year | integer | NOT NULL | Legislative year (e.g., 2023) |
| session_code | text | NOT NULL, CHECK | 'R' = Regular, 'S1' = Special/1st Extraordinary, 'S2' = 2nd Extraordinary |
| start_date | date | | Session start date (optional) |
| end_date | date | | Session end date (optional) |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |
| updated_at | timestamptz | DEFAULT NOW() | Record update timestamp |

**Unique Constraint:** (year, session_code)

#### legislators
Legislator profiles containing biographical and political information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| name | text | NOT NULL | Full name (FirstName LastName format) |
| legislator_type | text | CHECK | 'Representative' or 'Senator' |
| party_affiliation | text | | Full party name (e.g., 'Republican', 'Democrat') |
| year_elected | integer | | Year first elected to office |
| years_served | integer | | Total years of service |
| picture_url | text | | URL to official profile photo |
| is_active | boolean | DEFAULT TRUE | True for current legislators |
| profile_url | text | | URL to official profile page |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |
| updated_at | timestamptz | DEFAULT NOW() | Record update timestamp |

**Note:** District is NOT stored here - it's stored per-session in session_legislators.

#### session_legislators
Many-to-many join table linking legislators to sessions with their district.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| session_id | uuid | NOT NULL, FOREIGN KEY | References sessions(id) |
| legislator_id | uuid | NOT NULL, FOREIGN KEY | References legislators(id) |
| district | text | NOT NULL | District number for this session |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Unique Constraint:** (session_id, district)
**Foreign Keys:** CASCADE DELETE on both session and legislator

**Purpose:** Allows legislators to serve in multiple sessions and represent different districts in different sessions.

#### committees
Legislative committees that review bills.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| name | text | NOT NULL, UNIQUE | Committee name |
| description | text | | Committee description (optional) |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |
| updated_at | timestamptz | DEFAULT NOW() | Record update timestamp |

### Bill Tables

#### bills
Core bill information and status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_number | text | NOT NULL | Bill identifier (e.g., 'HB 1366') |
| session_id | uuid | NOT NULL, FOREIGN KEY | References sessions(id) |
| title | text | | Full bill title |
| description | text | | Brief description |
| lr_number | text | | Legislative Request number |
| bill_string | text | | Bill identifier string |
| last_action | text | | Most recent action taken |
| proposed_effective_date | text | | When bill would take effect |
| calendar_status | text | | Current calendar status |
| hearing_status | text | | Next hearing information |
| bill_url | text | | URL to bill detail page |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |
| updated_at | timestamptz | DEFAULT NOW() | Record update timestamp |

**Unique Constraint:** (bill_number, session_id)
**Foreign Key:** CASCADE DELETE on session

#### bill_sponsors
Links bills to their sponsors (primary and co-sponsors).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_id | uuid | NOT NULL, FOREIGN KEY | References bills(id) |
| session_legislator_id | uuid | NOT NULL, FOREIGN KEY | References session_legislators(id) |
| is_primary | boolean | DEFAULT FALSE | True for primary sponsor, false for co-sponsors |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Foreign Keys:** CASCADE DELETE on both bill and session_legislator

**Note:** Uses session_legislator_id (not legislator_id) to ensure proper district context.

#### bill_actions
Complete legislative history with all actions taken on a bill.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_id | uuid | NOT NULL, FOREIGN KEY | References bills(id) |
| action_date | date | | Date of action |
| description | text | NOT NULL | Action description |
| sequence_order | integer | | Order of actions (for sorting) |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Foreign Key:** CASCADE DELETE on bill

#### bill_hearings
Committee hearings scheduled for bills.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_id | uuid | NOT NULL, FOREIGN KEY | References bills(id) |
| committee_id | uuid | FOREIGN KEY | References committees(id) |
| hearing_date | date | | Date of hearing |
| hearing_time | time | | Time of hearing |
| location | text | | Hearing location |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Foreign Keys:** CASCADE DELETE on bill

#### bill_documents
Bill text PDFs in various versions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_id | uuid | NOT NULL, FOREIGN KEY | References bills(id) |
| document_type | text | NOT NULL | Type of document (e.g., 'Introduced', 'Perfected') |
| document_url | text | | URL to PDF on official website |
| storage_path | text | | Path in Supabase Storage (future) |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Foreign Key:** CASCADE DELETE on bill

#### bill_embeddings
Vector embeddings for RAG (Phase 2 - not yet in use).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PRIMARY KEY | Unique identifier |
| bill_id | uuid | NOT NULL, FOREIGN KEY | References bills(id) |
| document_id | uuid | FOREIGN KEY | References bill_documents(id) |
| content_type | text | NOT NULL | Type of content embedded |
| content | text | NOT NULL | Original text content |
| embedding | vector(1536) | | OpenAI embedding vector |
| created_at | timestamptz | DEFAULT NOW() | Record creation timestamp |

**Foreign Keys:** CASCADE DELETE on bill

## Indexes

Performance indexes are created on frequently queried columns:

- `idx_sessions_year_code` on sessions(year, session_code)
- `idx_session_legislators_session_id` on session_legislators(session_id)
- `idx_session_legislators_legislator_id` on session_legislators(legislator_id)
- `idx_session_legislators_district` on session_legislators(district)
- `idx_bills_session_id` on bills(session_id)
- `idx_bills_bill_number` on bills(bill_number)
- `idx_bill_sponsors_bill_id` on bill_sponsors(bill_id)
- `idx_bill_sponsors_session_legislator_id` on bill_sponsors(session_legislator_id)
- `idx_bill_actions_bill_id` on bill_actions(bill_id)
- `idx_bill_hearings_bill_id` on bill_hearings(bill_id)
- `idx_bill_documents_bill_id` on bill_documents(bill_id)
- `idx_bill_embeddings_bill_id` on bill_embeddings(bill_id)

## Row Level Security (RLS)

All tables have RLS enabled with permissive policies allowing all operations (SELECT, INSERT, UPDATE, DELETE) for now. Production deployment should implement proper access control policies.

## Key Design Decisions

### Session-Based Architecture

Bills and legislators are linked through sessions rather than directly. This design:
- ✅ Allows proper historical tracking across multiple legislative sessions
- ✅ Supports legislators changing districts between sessions
- ✅ Provides clear temporal boundaries for all data
- ✅ Enables efficient querying by session

### District Stored Per Session

Districts are stored in `session_legislators` rather than `legislators` because:
- A legislator may represent different districts in different sessions
- District boundaries can change over time
- District is contextual to a specific session

### Sponsor Matching Strategy

**Primary Sponsors:** Matched by district number extracted from bill list page
**Co-Sponsors:** Matched by legislator name (district info not reliable on co-sponsors page)

Both approaches use the session context to ensure correct legislator-to-bill linkage.

## Example Queries

### Get all sponsors for a bill
```sql
SELECT
    b.bill_number,
    s.year || ' ' || s.session_code AS session,
    l.name AS sponsor_name,
    l.party_affiliation,
    sl.district,
    bs.is_primary
FROM bills b
JOIN sessions s ON s.id = b.session_id
JOIN bill_sponsors bs ON bs.bill_id = b.id
JOIN session_legislators sl ON sl.id = bs.session_legislator_id
JOIN legislators l ON l.id = sl.legislator_id
WHERE b.bill_number = 'HB 1366'
ORDER BY bs.is_primary DESC, l.name;
```

### Get all bills sponsored by a legislator in a session
```sql
SELECT
    b.bill_number,
    b.title,
    bs.is_primary
FROM legislators l
JOIN session_legislators sl ON sl.legislator_id = l.id
JOIN sessions s ON s.id = sl.session_id
JOIN bill_sponsors bs ON bs.session_legislator_id = sl.id
JOIN bills b ON b.id = bs.bill_id
WHERE l.name = 'Tila Hubrecht'
  AND s.year = 2016
  AND s.session_code = 'R'
ORDER BY b.bill_number;
```

### Get all legislators who served in multiple sessions
```sql
SELECT
    l.name,
    COUNT(DISTINCT sl.session_id) AS session_count,
    ARRAY_AGG(DISTINCT s.year || ' ' || s.session_code) AS sessions
FROM legislators l
JOIN session_legislators sl ON sl.legislator_id = l.id
JOIN sessions s ON s.id = sl.session_id
GROUP BY l.id, l.name
HAVING COUNT(DISTINCT sl.session_id) > 1
ORDER BY session_count DESC;
```
