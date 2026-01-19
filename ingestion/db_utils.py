"""
Database class for interacting with Supabase.
"""

import os
from typing import Optional, Dict, Any
from supabase import Client, create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Database:
    """Database wrapper for all Supabase operations."""

    def __init__(self, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        """
        Initialize the database connection.

        Args:
            supabase_url: Supabase project URL (defaults to env var SUPABASE_URL)
            supabase_key: Supabase API key (defaults to env var SUPABASE_KEY)

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

        self._client: Client = create_client(url, key)

    def get_or_create_session(self, year: int, session_code: str) -> str:
        """
        Get or create a session record.

        Args:
            year: Legislative year
            session_code: Session code ('R', 'S1', 'S2')

        Returns:
            Session UUID
        """
        # Try to find existing session
        response = self._client.table('sessions').select('id').eq(
            'year', year
        ).eq(
            'session_code', session_code
        ).execute()

        if response.data:
            return response.data[0]['id']

        # Create new session
        insert_response = self._client.table('sessions').insert({
            'year': year,
            'session_code': session_code
        }).execute()

        return insert_response.data[0]['id']

    def get_or_create_committee(self, committee_name: str) -> str:
        """
        Get or create a committee record.

        Args:
            committee_name: Name of the committee

        Returns:
            Committee UUID
        """
        # Try to find existing committee
        response = self._client.table('committees').select('id').eq(
            'name', committee_name
        ).execute()

        if response.data:
            return response.data[0]['id']

        # Create new committee
        insert_response = self._client.table('committees').insert({
            'name': committee_name
        }).execute()

        return insert_response.data[0]['id']

    def upsert_legislator(self, legislator_data: Dict[str, Any]) -> tuple[str, bool]:
        """
        Insert or update a legislator record.

        Args:
            legislator_data: Dictionary with legislator details

        Returns:
            Tuple of (legislator_id, was_updated)
        """
        # Try to find existing legislator by name
        response = self._client.table('legislators').select('id').eq(
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
            self._client.table('legislators').update(legislator_record).eq('id', legislator_id).execute()
            was_updated = True
        else:
            # Insert new legislator
            insert_response = self._client.table('legislators').insert(legislator_record).execute()
            legislator_id = insert_response.data[0]['id']

        return legislator_id, was_updated

    def link_legislator_to_session(self, session_id: str, legislator_id: str, district: str) -> str:
        """
        Create or update a session_legislators record linking a legislator to a session.

        Args:
            session_id: Session UUID
            legislator_id: Legislator UUID
            district: District number for this session

        Returns:
            session_legislator UUID
        """
        # Check if this session-district mapping already exists
        response = self._client.table('session_legislators').select('id').eq(
            'session_id', session_id
        ).eq(
            'district', district
        ).execute()

        if response.data:
            # Update existing record to point to this legislator
            session_legislator_id = response.data[0]['id']
            self._client.table('session_legislators').update({
                'legislator_id': legislator_id
            }).eq('id', session_legislator_id).execute()
        else:
            # Create new session_legislator record
            insert_response = self._client.table('session_legislators').insert({
                'session_id': session_id,
                'legislator_id': legislator_id,
                'district': district
            }).execute()
            session_legislator_id = insert_response.data[0]['id']

        return session_legislator_id

    def get_session_legislator_by_district(self, session_id: str, district: str) -> Optional[str]:
        """
        Look up a session_legislator by district for a specific session.

        Args:
            session_id: Session UUID
            district: District number

        Returns:
            session_legislator UUID if found, None otherwise
        """
        response = self._client.table('session_legislators').select('id').eq(
            'session_id', session_id
        ).eq(
            'district', district
        ).execute()

        if response.data:
            return response.data[0]['id']
        return None

    def get_session_legislator_by_name(self, session_id: str, legislator_name: str) -> Optional[str]:
        """
        Look up a session_legislator by legislator name for a specific session.

        Args:
            session_id: Session UUID
            legislator_name: Name of the legislator

        Returns:
            session_legislator UUID if found, None otherwise
        """
        # First, find the legislator by name
        leg_response = self._client.table('legislators').select('id').eq(
            'name', legislator_name
        ).execute()

        if not leg_response.data:
            return None

        legislator_id = leg_response.data[0]['id']

        # Then find the session_legislator record
        sl_response = self._client.table('session_legislators').select('id').eq(
            'session_id', session_id
        ).eq(
            'legislator_id', legislator_id
        ).execute()

        if sl_response.data:
            return sl_response.data[0]['id']
        return None

    def upload_pdf_to_storage(
        self,
        pdf_content: bytes,
        storage_path: str,
        bucket_name: str = 'bill-pdfs'
    ) -> Optional[str]:
        """
        Upload a PDF to Supabase Storage.

        Args:
            pdf_content: PDF file content as bytes
            storage_path: Path within bucket (e.g., "2016/R/HB1366/HB1366_Introduced.pdf")
            bucket_name: Storage bucket name (default: 'bill-pdfs')

        Returns:
            Storage path if successful, None otherwise
        """
        try:
            self._client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=pdf_content,
                file_options={'content-type': 'application/pdf', 'upsert': 'true'}
            )
            return storage_path
        except Exception as e:
            print(f"    Warning: Could not upload to storage: {e}")
            return None

    def upsert_bill(
        self,
        session_id: str,
        bill_record: Dict[str, Any],
        sponsors_data: Optional[list] = None,
        actions_data: Optional[list] = None,
        hearings_data: Optional[list] = None,
        documents_data: Optional[list] = None
    ) -> tuple[str, bool]:
        """
        Insert or update a bill with all related data.

        Args:
            session_id: Session UUID
            bill_record: Dictionary with bill fields (bill_number, title, description, etc.)
            sponsors_data: List of dicts with 'session_legislator_id' and 'is_primary'
            actions_data: List of dicts with 'action_date', 'description', 'sequence_order'
            hearings_data: List of dicts with 'committee_name', 'hearing_date', 'hearing_time', 'hearing_time_text', 'location'
            documents_data: List of dicts with 'document_type', 'document_url', 'storage_path'

        Returns:
            Tuple of (bill_id, was_updated)
        """
        # Ensure session_id is in bill_record
        bill_record['session_id'] = session_id

        # Check if bill already exists
        existing_bill = self._client.table('bills').select('id').eq(
            'bill_number', bill_record['bill_number']
        ).eq(
            'session_id', session_id
        ).execute()

        if existing_bill.data:
            # Update existing bill
            bill_id = existing_bill.data[0]['id']
            was_updated = True
            self._client.table('bills').update(bill_record).eq('id', bill_id).execute()

            # Delete existing related data to re-insert fresh data
            self._client.table('bill_sponsors').delete().eq('bill_id', bill_id).execute()
            self._client.table('bill_actions').delete().eq('bill_id', bill_id).execute()
            self._client.table('bill_hearings').delete().eq('bill_id', bill_id).execute()
            self._client.table('bill_documents').delete().eq('bill_id', bill_id).execute()
        else:
            # Insert new bill
            was_updated = False
            bill_response = self._client.table('bills').insert(bill_record).execute()
            bill_id = bill_response.data[0]['id']

        # Insert sponsors
        if sponsors_data:
            for sponsor in sponsors_data:
                if sponsor.get('session_legislator_id'):
                    try:
                        self._client.table('bill_sponsors').insert({
                            'bill_id': bill_id,
                            'session_legislator_id': sponsor['session_legislator_id'],
                            'is_primary': sponsor.get('is_primary', False)
                        }).execute()
                    except Exception as e:
                        print(f"  Warning: Could not insert sponsor: {e}")

        # Insert actions
        if actions_data:
            for action in actions_data:
                try:
                    self._client.table('bill_actions').insert({
                        'bill_id': bill_id,
                        'action_date': action['action_date'],
                        'description': action['description'],
                        'sequence_order': action.get('sequence_order', 0)
                    }).execute()
                except Exception as e:
                    print(f"  Warning: Could not insert action: {e}")

        # Insert hearings
        if hearings_data:
            for hearing in hearings_data:
                try:
                    # Get or create committee
                    committee_id = self.get_or_create_committee(hearing['committee_name'])

                    hearing_record = {
                        'bill_id': bill_id,
                        'committee_id': committee_id,
                        'hearing_date': hearing.get('hearing_date'),
                        'hearing_time': hearing.get('hearing_time'),
                        'location': hearing.get('location')
                    }

                    # Add hearing_time_text if provided (may not exist in older schema)
                    if 'hearing_time_text' in hearing:
                        hearing_record['hearing_time_text'] = hearing.get('hearing_time_text')

                    self._client.table('bill_hearings').insert(hearing_record).execute()
                except Exception as e:
                    print(f"  Warning: Could not insert hearing: {e}")

        # Insert documents
        if documents_data:
            for doc in documents_data:
                try:
                    self._client.table('bill_documents').insert({
                        'bill_id': bill_id,
                        'document_type': doc['document_type'],
                        'document_url': doc['document_url'],
                        'storage_path': doc.get('storage_path')
                    }).execute()
                except Exception as e:
                    print(f"  Warning: Could not insert document: {e}")

        return bill_id, was_updated
