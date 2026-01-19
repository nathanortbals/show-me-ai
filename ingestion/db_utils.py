"""
Shared database utilities for interacting with Supabase.
"""

import os
from typing import Optional, Dict, Any
from supabase import Client, create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def get_supabase_client(
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None
) -> Client:
    """
    Create and return a Supabase client.

    Args:
        supabase_url: Supabase project URL (defaults to env var SUPABASE_URL)
        supabase_key: Supabase API key (defaults to env var SUPABASE_KEY)

    Returns:
        Configured Supabase client

    Raises:
        RuntimeError: If credentials are not provided
    """
    url = supabase_url or os.getenv('SUPABASE_URL')
    key = supabase_key or os.getenv('SUPABASE_KEY')

    if not url or not key:
        raise RuntimeError(
            "Supabase credentials not found. "
            "Set SUPABASE_URL and SUPABASE_KEY environment variables or pass them as arguments."
        )

    return create_client(url, key)


def get_or_create_session(
    supabase: Client,
    year: int,
    session_code: str
) -> str:
    """
    Get or create a session record.

    Args:
        supabase: Supabase client
        year: Legislative year
        session_code: Session code ('R' for Regular, 'E' for Extraordinary)

    Returns:
        Session UUID
    """
    # Try to find existing session
    response = supabase.table('sessions').select('id').eq(
        'year', year
    ).eq(
        'session_code', session_code
    ).execute()

    if response.data:
        return response.data[0]['id']

    # Create new session
    insert_response = supabase.table('sessions').insert({
        'year': year,
        'session_code': session_code
    }).execute()

    return insert_response.data[0]['id']


def get_or_create_committee(supabase: Client, committee_name: str) -> str:
    """
    Get or create a committee record.

    Args:
        supabase: Supabase client
        committee_name: Name of the committee

    Returns:
        Committee UUID
    """
    # Try to find existing committee
    response = supabase.table('committees').select('id').eq(
        'name', committee_name
    ).execute()

    if response.data:
        return response.data[0]['id']

    # Create new committee
    insert_response = supabase.table('committees').insert({
        'name': committee_name
    }).execute()

    return insert_response.data[0]['id']


def upsert_legislator(
    supabase: Client,
    legislator_data: Dict[str, Any]
) -> tuple[str, bool]:
    """
    Insert or update a legislator record.

    Args:
        supabase: Supabase client
        legislator_data: Dictionary with legislator details

    Returns:
        Tuple of (legislator_id, was_updated)
    """
    # Try to find existing legislator by name
    response = supabase.table('legislators').select('id').eq(
        'name', legislator_data['name']
    ).execute()

    legislator_record = {
        'name': legislator_data['name'],
        'legislator_type': legislator_data.get('legislator_type'),
        'party_affiliation': legislator_data.get('party_affiliation'),
        'year_elected': int(legislator_data['year_elected']) if legislator_data.get('year_elected') else None,
        'years_served': int(legislator_data['years_served']) if legislator_data.get('years_served') else None,
        'picture_url': legislator_data.get('picture_url'),
        'is_active': legislator_data.get('is_active', True),
        'profile_url': legislator_data.get('profile_url'),
    }

    was_updated = False
    if response.data:
        # Update existing legislator
        legislator_id = response.data[0]['id']
        supabase.table('legislators').update(legislator_record).eq('id', legislator_id).execute()
        was_updated = True
    else:
        # Insert new legislator
        insert_response = supabase.table('legislators').insert(legislator_record).execute()
        legislator_id = insert_response.data[0]['id']

    return legislator_id, was_updated


def link_legislator_to_session(
    supabase: Client,
    session_id: str,
    legislator_id: str,
    district: str
) -> str:
    """
    Create or update a session_legislators record linking a legislator to a session.

    Args:
        supabase: Supabase client
        session_id: Session UUID
        legislator_id: Legislator UUID
        district: District number for this session

    Returns:
        session_legislator UUID
    """
    # Check if this session-district mapping already exists
    response = supabase.table('session_legislators').select('id').eq(
        'session_id', session_id
    ).eq(
        'district', district
    ).execute()

    if response.data:
        # Update existing record to point to this legislator
        session_legislator_id = response.data[0]['id']
        supabase.table('session_legislators').update({
            'legislator_id': legislator_id
        }).eq('id', session_legislator_id).execute()
    else:
        # Create new session_legislator record
        insert_response = supabase.table('session_legislators').insert({
            'session_id': session_id,
            'legislator_id': legislator_id,
            'district': district
        }).execute()
        session_legislator_id = insert_response.data[0]['id']

    return session_legislator_id


def get_session_legislator_by_district(
    supabase: Client,
    session_id: str,
    district: str
) -> Optional[str]:
    """
    Look up a session_legislator by district for a specific session.

    Args:
        supabase: Supabase client
        session_id: Session UUID
        district: District number

    Returns:
        session_legislator UUID if found, None otherwise
    """
    response = supabase.table('session_legislators').select('id').eq(
        'session_id', session_id
    ).eq(
        'district', district
    ).execute()

    if response.data:
        return response.data[0]['id']
    return None


def get_session_legislator_by_name(
    supabase: Client,
    session_id: str,
    legislator_name: str
) -> Optional[str]:
    """
    Look up a session_legislator by legislator name for a specific session.

    Args:
        supabase: Supabase client
        session_id: Session UUID
        legislator_name: Name of the legislator

    Returns:
        session_legislator UUID if found, None otherwise
    """
    # First, find the legislator by name
    leg_response = supabase.table('legislators').select('id').eq(
        'name', legislator_name
    ).execute()

    if not leg_response.data:
        return None

    legislator_id = leg_response.data[0]['id']

    # Then find the session_legislator record
    sl_response = supabase.table('session_legislators').select('id').eq(
        'session_id', session_id
    ).eq(
        'legislator_id', legislator_id
    ).execute()

    if sl_response.data:
        return sl_response.data[0]['id']
    return None
