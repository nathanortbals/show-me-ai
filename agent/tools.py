"""
Tools for the Missouri Bills AI agent.

Provides functions for semantic search, bill lookup, and metadata queries.
"""
import re
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from ingestion.db_utils import Database


# Initialize global instances
_db = None
_vector_store = None

def _get_db():
    """Get or create database instance."""
    global _db
    if _db is None:
        _db = Database()
    return _db

def _get_vector_store():
    """Get or create vector store instance."""
    global _vector_store
    if _vector_store is None:
        db = _get_db()
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        _vector_store = SupabaseVectorStore(
            client=db.client,
            embedding=embeddings,
            table_name="bill_embeddings",
            query_name="match_bill_embeddings"
        )
    return _vector_store


@tool
def search_bills_semantic(query: str, limit: int = 5) -> str:
    """
    Search for bills using semantic similarity.

    Use this when the user asks about bill content, topics, or concepts.
    Examples: "healthcare bills", "education funding", "tax reform"

    Args:
        query: Natural language search query
        limit: Maximum number of results (default: 5)

    Returns:
        Formatted search results with bill numbers, content snippets, and metadata
    """
    db = _get_db()

    # Generate embedding for query
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    query_embedding = embeddings.embed_query(query)

    # Call RPC function directly
    response = db._client.rpc(
        'match_bill_embeddings',
        {
            'query_embedding': query_embedding,
            'match_count': limit,
            'match_threshold': 0.3
        }
    ).execute()

    if not response.data:
        return "No bills found matching that query."

    # Format results
    results = []
    for row in response.data:
        meta = row.get('metadata', {})
        content = row.get('content', '')

        result = f"""
Bill: {meta.get('bill_number', 'Unknown')}
Session: {meta.get('session_year')} {meta.get('session_code', '')}
Document Type: {meta.get('content_type', 'Unknown')}
Sponsor: {meta.get('primary_sponsor_name', 'Unknown')}
Similarity: {row.get('similarity', 0):.2f}
Content: {content[:300]}...
---
"""
        results.append(result.strip())

    return "\n\n".join(results)


@tool
def get_bill_by_number(bill_number: str, session_year: Optional[int] = None) -> str:
    """
    Get detailed information about a specific bill.

    Use this when the user asks about a specific bill by number.
    Examples: "Tell me about HB1366", "What is HB2146"

    Args:
        bill_number: Bill number (e.g., "HB1366", "HB 1366")
        session_year: Optional session year (defaults to most recent)

    Returns:
        Detailed bill information including title, sponsors, status, and documents
    """
    db = _get_db()

    # Normalize bill number - ensure space between prefix and number
    # e.g., "HB1366" -> "HB 1366", "HB 1366" -> "HB 1366"
    bill_number = bill_number.upper().strip()
    bill_number = re.sub(r'^([A-Z]+)(\d+)$', r'\1 \2', bill_number)

    # Build query
    query = db._client.table('bills').select(
        '''
        id,
        bill_number,
        title,
        description,
        lr_number,
        last_action,
        proposed_effective_date,
        sessions(year, session_code)
        '''
    ).eq('bill_number', bill_number)

    if session_year:
        # Get session first
        session_response = db._client.table('sessions').select('id').eq(
            'year', session_year
        ).execute()
        if session_response.data:
            query = query.eq('session_id', session_response.data[0]['id'])

    response = query.execute()

    if not response.data:
        return f"Bill {bill_number} not found{f' for session {session_year}' if session_year else ''}."

    bill = response.data[0]

    # Get sponsors
    sponsors_response = db._client.table('bill_sponsors').select(
        'is_primary, session_legislators(legislators(name, party_affiliation))'
    ).eq('bill_id', bill['id']).execute()

    primary_sponsors = []
    cosponsors = []
    for sponsor in sponsors_response.data:
        leg = sponsor.get('session_legislators', {}).get('legislators', {})
        name = leg.get('name', 'Unknown')
        party = leg.get('party_affiliation', '')
        sponsor_str = f"{name} ({party})" if party else name

        if sponsor.get('is_primary'):
            primary_sponsors.append(sponsor_str)
        else:
            cosponsors.append(sponsor_str)

    # Format response
    result = f"""
Bill: {bill['bill_number']}
Session: {bill['sessions']['year']} {bill['sessions']['session_code']}
Title: {bill.get('title', 'N/A')}
Description: {bill.get('description', 'N/A')}
LR Number: {bill.get('lr_number', 'N/A')}
Last Action: {bill.get('last_action', 'N/A')}
Proposed Effective Date: {bill.get('proposed_effective_date', 'N/A')}

Primary Sponsor(s): {', '.join(primary_sponsors) if primary_sponsors else 'None'}
Co-sponsors: {', '.join(cosponsors[:5]) if cosponsors else 'None'}
{f"(and {len(cosponsors) - 5} more)" if len(cosponsors) > 5 else ''}
"""
    return result.strip()


@tool
def get_legislator_info(name: str) -> str:
    """
    Get information about a legislator.

    Use this when the user asks about a specific legislator or representative.
    Examples: "Who is Rep. Smith?", "Tell me about Jane Doe"

    Args:
        name: Legislator name (full or partial)

    Returns:
        Legislator information including party, district, years served
    """
    db = _get_db()

    # Search for legislator (case-insensitive partial match)
    response = db._client.table('legislators').select(
        '''
        id,
        name,
        legislator_type,
        party_affiliation,
        year_elected,
        years_served,
        is_active
        '''
    ).ilike('name', f'%{name}%').execute()

    if not response.data:
        return f"No legislator found matching '{name}'."

    if len(response.data) > 1:
        names = [leg['name'] for leg in response.data[:10]]
        return f"Multiple legislators found: {', '.join(names)}. Please be more specific."

    leg = response.data[0]

    result = f"""
Name: {leg['name']}
Type: {leg.get('legislator_type', 'N/A')}
Party: {leg.get('party_affiliation', 'N/A')}
Year Elected: {leg.get('year_elected', 'N/A')}
Years Served: {leg.get('years_served', 'N/A')}
Status: {'Active' if leg.get('is_active') else 'Inactive'}
"""
    return result.strip()


@tool
def get_bill_timeline(bill_number: str, session_year: Optional[int] = None) -> str:
    """
    Get the legislative timeline/history for a bill.

    Use this when the user asks about a bill's progress, actions, or history.
    Examples: "What happened to HB1366?", "Show me the timeline for HB2146"

    Args:
        bill_number: Bill number (e.g., "HB1366")
        session_year: Optional session year

    Returns:
        Chronological list of actions taken on the bill
    """
    db = _get_db()

    # Normalize bill number - ensure space between prefix and number
    bill_number = bill_number.upper().strip()
    bill_number = re.sub(r'^([A-Z]+)(\d+)$', r'\1 \2', bill_number)

    # Get bill ID
    query = db._client.table('bills').select('id, bill_number, sessions(year, session_code)').eq(
        'bill_number', bill_number
    )

    if session_year:
        session_response = db._client.table('sessions').select('id').eq('year', session_year).execute()
        if session_response.data:
            query = query.eq('session_id', session_response.data[0]['id'])

    bill_response = query.execute()

    if not bill_response.data:
        return f"Bill {bill_number} not found{f' for session {session_year}' if session_year else ''}."

    bill = bill_response.data[0]

    # Get actions
    actions_response = db._client.table('bill_actions').select(
        'action_date, description, sequence_order'
    ).eq('bill_id', bill['id']).order('sequence_order').execute()

    if not actions_response.data:
        return f"No actions found for {bill_number}."

    # Format timeline
    result = [f"Timeline for {bill_number} ({bill['sessions']['year']} {bill['sessions']['session_code']}):"]
    for action in actions_response.data:
        result.append(f"{action['action_date']}: {action['description']}")

    return "\n".join(result)


@tool
def get_committee_hearings(bill_number: Optional[str] = None, committee_name: Optional[str] = None) -> str:
    """
    Get committee hearing information.

    Use this when the user asks about hearings for a specific bill or committee.
    Examples: "When was HB1366 heard?", "What bills are in the Health Committee?"

    Args:
        bill_number: Optional bill number
        committee_name: Optional committee name

    Returns:
        Hearing information with dates, times, locations
    """
    db = _get_db()

    if not bill_number and not committee_name:
        return "Please provide either a bill number or committee name."

    query = db._client.table('bill_hearings').select(
        '''
        hearing_date,
        hearing_time,
        hearing_time_text,
        location,
        bills(bill_number, sessions(year, session_code)),
        committees(name)
        '''
    )

    if bill_number:
        # Normalize bill number - ensure space between prefix and number
        bill_number = bill_number.upper().strip()
        bill_number = re.sub(r'^([A-Z]+)(\d+)$', r'\1 \2', bill_number)
        # Get bill ID first
        bill_response = db._client.table('bills').select('id').eq('bill_number', bill_number).execute()
        if not bill_response.data:
            return f"Bill {bill_number} not found."
        query = query.eq('bill_id', bill_response.data[0]['id'])

    if committee_name:
        # Get committee ID
        comm_response = db._client.table('committees').select('id').ilike('name', f'%{committee_name}%').execute()
        if not comm_response.data:
            return f"Committee matching '{committee_name}' not found."
        query = query.eq('committee_id', comm_response.data[0]['id'])

    response = query.execute()

    if not response.data:
        return "No hearings found."

    # Format results
    results = []
    for hearing in response.data[:10]:  # Limit to 10 results
        bill_info = hearing.get('bills', {})
        committee = hearing.get('committees', {}).get('name', 'Unknown')
        session = bill_info.get('sessions', {})

        result = f"""
Bill: {bill_info.get('bill_number', 'Unknown')} ({session.get('year', '')} {session.get('session_code', '')})
Committee: {committee}
Date: {hearing.get('hearing_date', 'TBD')}
Time: {hearing.get('hearing_time_text') or hearing.get('hearing_time', 'TBD')}
Location: {hearing.get('location', 'TBD')}
---
"""
        results.append(result.strip())

    return "\n\n".join(results)


@tool
def search_bills_by_year(session_year: int, limit: int = 10) -> str:
    """
    Search bills by legislative session year.

    Use this when the user asks about bills from a specific year.
    Examples: "Bills from 2026", "Show me 2025 bills"

    Args:
        session_year: Legislative year (e.g., 2026)
        limit: Maximum results (default: 10)

    Returns:
        List of bills from that session
    """
    db = _get_db()

    # Get session
    session_response = db._client.table('sessions').select('id').eq('year', session_year).execute()
    if not session_response.data:
        return f"No session found for year {session_year}."

    session_id = session_response.data[0]['id']

    # Get bills
    response = db._client.table('bills').select(
        '''
        id,
        bill_number,
        title,
        sessions(year, session_code)
        '''
    ).eq('session_id', session_id).limit(limit).execute()

    if not response.data:
        return f"No bills found for {session_year}."

    # Format results
    results = []
    for bill in response.data:
        session = bill.get('sessions', {})
        result = f"{bill['bill_number']} ({session.get('year', '')} {session.get('session_code', '')}): {bill.get('title', 'No title')}"
        results.append(result)

    return "\n".join(results)


def get_tools() -> List:
    """Get list of tool functions for the agent."""
    return [
        search_bills_semantic,
        get_bill_by_number,
        get_legislator_info,
        get_bill_timeline,
        get_committee_hearings,
        search_bills_by_year,
    ]
