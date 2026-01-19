#!/usr/bin/env python3
"""
Scrapes Missouri House of Representatives bills from the official website.
"""

import asyncio
import os
import re
from pathlib import Path
from typing import List, Dict, Optional, Any
import httpx
from playwright.async_api import async_playwright, Page, Browser
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class MoHouseBillScraper:
    """Scraper for Missouri House bills."""

    BASE_URL = "https://house.mo.gov/billlist.aspx"
    ARCHIVE_URL_TEMPLATE = "https://archive.house.mo.gov/billlist.aspx?year={year}&code={code}"

    def __init__(self, year: Optional[int] = None, session_code: str = "R", supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        """
        Initialize the scraper.

        Args:
            year: Legislative year (None for current session)
            session_code: Session code (R for Regular, E for Extraordinary)
            supabase_url: Supabase project URL (defaults to env var SUPABASE_URL)
            supabase_key: Supabase API key (defaults to env var SUPABASE_KEY)
        """
        self.year = year
        self.session_code = session_code
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

        # Initialize Supabase client if credentials provided
        self.supabase: Optional[Client] = None
        url = supabase_url or os.getenv('SUPABASE_URL')
        key = supabase_key or os.getenv('SUPABASE_KEY')
        if url and key:
            self.supabase = create_client(url, key)

        # Cache for session legislators to avoid duplicate lookups
        self.session_legislator_cache: Dict[str, str] = {}  # Maps district -> session_legislator_id
        self.session_id: Optional[str] = None  # Will be set when scraping starts

    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def start(self):
        """Start the browser and page."""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=True)
        self.page = await self.browser.new_page()

    async def close(self):
        """Close the browser."""
        if self.browser:
            await self.browser.close()

    def _get_url(self) -> str:
        """Get the appropriate URL based on year."""
        if self.year:
            return self.ARCHIVE_URL_TEMPLATE.format(year=self.year, code=self.session_code)
        return self.BASE_URL

    async def scrape_bills(self) -> List[Dict[str, str]]:
        """
        Scrape all bills from the Missouri House website.

        Returns:
            List of bill dictionaries containing bill information
        """
        if not self.page:
            raise RuntimeError("Browser not started. Use async context manager or call start()")

        url = self._get_url()
        print(f"Navigating to {url}...")

        # Navigate to the page
        await self.page.goto(url, wait_until="networkidle")

        # Wait for the table to load
        await self.page.wait_for_selector('table', timeout=10000)

        print("Extracting bill data...")

        # Extract bill data using JavaScript
        bills = await self.page.evaluate("""
            () => {
                const bills = [];
                const tables = Array.from(document.querySelectorAll('table'));
                const billTable = tables.find(t => t.innerText.includes('HB') || t.innerText.includes('SB'));

                if (!billTable) {
                    return [];
                }

                const rows = Array.from(billTable.querySelectorAll('tr'));
                let currentBill = null;

                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td'));

                    // Skip header rows
                    if (cells.length === 0 || row.querySelector('th')) {
                        continue;
                    }

                    // Check if this is a bill number row (typically has 5 cells)
                    if (cells.length >= 4) {
                        const billNumberCell = cells[0];
                        const billLink = billNumberCell.querySelector('a');

                        if (billLink) {
                            const billNumber = billLink.textContent.trim();
                            const billUrl = billLink.href;

                            // Extract sponsor
                            const sponsorCell = cells[1];
                            const sponsorLink = sponsorCell.querySelector('a');
                            const sponsor = sponsorLink ? sponsorLink.textContent.trim() : sponsorCell.textContent.trim();
                            const sponsorUrl = sponsorLink ? sponsorLink.href : '';

                            currentBill = {
                                bill_number: billNumber,
                                bill_url: billUrl,
                                sponsor: sponsor,
                                sponsor_url: sponsorUrl,
                                description: ''
                            };

                            bills.push(currentBill);
                        }
                    }
                    // Check if this is a description row (typically has 2 cells)
                    else if (cells.length === 2 && currentBill) {
                        const descriptionCell = cells[1];
                        currentBill.description = descriptionCell.textContent.trim();
                    }
                }

                return bills;
            }
        """)

        print(f"Found {len(bills)} bills")
        return bills

    def _get_bill_detail_url(self, bill_number: str) -> str:
        """
        Get the bill detail URL for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            URL to the bill detail page
        """
        if self.year:
            return f"https://archive.house.mo.gov/BillContent.aspx?bill={bill_number}&year={self.year}&code={self.session_code}&style=new"
        return f"https://house.mo.gov/BillContent.aspx?bill={bill_number}&year={self.year}&code={self.session_code}&style=new"

    def _get_cosponsors_url(self, bill_number: str) -> str:
        """
        Get the co-sponsors URL for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            URL to the co-sponsors page
        """
        if self.year:
            return f"https://archive.house.mo.gov/CoSponsors.aspx?bill={bill_number}&year={self.year}&code={self.session_code}"
        return f"https://house.mo.gov/CoSponsors.aspx?bill={bill_number}&year={self.year}&code={self.session_code}"

    def _get_bill_actions_url(self, bill_number: str) -> str:
        """
        Get the bill actions URL for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            URL to the bill actions page
        """
        if self.year:
            return f"https://archive.house.mo.gov/BillActions.aspx?bill={bill_number}&year={self.year}&code={self.session_code}"
        return f"https://house.mo.gov/BillActions.aspx?bill={bill_number}&year={self.year}&code={self.session_code}"

    def _get_bill_hearings_url(self, bill_number: str) -> str:
        """
        Get the bill hearings URL for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            URL to the bill hearings page
        """
        if self.year:
            return f"https://archive.house.mo.gov/BillHearings.aspx?Bill={bill_number}&year={self.year}&code={self.session_code}"
        return f"https://house.mo.gov/BillHearings.aspx?Bill={bill_number}&year={self.year}&code={self.session_code}"

    async def scrape_bill_details(self, bill_number: str) -> Dict[str, str]:
        """
        Scrape detailed information for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            Dictionary containing detailed bill information
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        url = self._get_bill_detail_url(bill_number)
        await self.page.goto(url, wait_until="networkidle")

        # Extract detailed information
        details = await self.page.evaluate("""
            () => {
                const details = {
                    bill_number: '',
                    title: '',
                    sponsor: '',
                    sponsor_url: '',
                    lr_number: '',
                    last_action: '',
                    last_action_date: '',
                    proposed_effective_date: '',
                    bill_string: '',
                    calendar_status: '',
                    hearing_status: '',
                    bill_documents: ''
                };

                // Extract bill number from h1
                const h1 = document.querySelector('h1');
                if (h1) {
                    details.bill_number = h1.textContent.trim();
                }

                // Extract title from main div
                const mainDiv = document.querySelector('main > div');
                if (mainDiv) {
                    const fullText = mainDiv.textContent;
                    const lines = fullText.split('\\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
                    let foundBill = false;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i] === details.bill_number || lines[i].indexOf(details.bill_number) >= 0) {
                            foundBill = true;
                        } else if (foundBill) {
                            details.title = lines[i];
                            break;
                        }
                    }
                }

                // Helper function to extract labeled data
                const extractLabeledData = (labelText) => {
                    const elements = Array.from(document.querySelectorAll('main *'));
                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        if (el.textContent.trim() === labelText) {
                            const nextEl = elements[i + 1];
                            if (nextEl) {
                                return nextEl.textContent.trim();
                            }
                        }
                    }
                    return '';
                };

                // Extract sponsor
                const sponsorLink = document.querySelector('a[href*="MemberDetails"]');
                if (sponsorLink) {
                    details.sponsor = sponsorLink.textContent.trim();
                    details.sponsor_url = sponsorLink.href;
                }

                // Extract various fields
                details.proposed_effective_date = extractLabeledData('Proposed Effective Date:');
                details.lr_number = extractLabeledData('LR Number:');
                details.last_action = extractLabeledData('Last Action:');
                details.bill_string = extractLabeledData('Bill String:');
                details.hearing_status = extractLabeledData('Next House Hearing:');
                details.calendar_status = extractLabeledData('Calendar:');

                // Extract bill documents
                const billDocuments = document.getElementById('BillDocuments');
                const documentStrings = [];
                if (billDocuments) {
                    const docLinks = Array.from(billDocuments.querySelectorAll('a[href*=".pdf"]'));
                    for (let i = 0; i < docLinks.length; i++) {
                        const link = docLinks[i];
                        const docType = link.textContent.trim();
                        const docUrl = link.href;
                        if (docType && docUrl && docType.indexOf('Roll Call') === -1 && docType.indexOf('Witnesses') === -1) {
                            documentStrings.push(docType + ' | ' + docUrl);
                        }
                    }
                }
                details.bill_documents = documentStrings.join(' || ');

                return details;
            }
        """)

        return details

    async def scrape_cosponsors(self, bill_number: str) -> str:
        """
        Scrape co-sponsors for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            Semicolon-separated string of co-sponsor names
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        url = self._get_cosponsors_url(bill_number)
        await self.page.goto(url, wait_until="networkidle")

        # Extract co-sponsor names only (district column is not reliable)
        cosponsors = await self.page.evaluate("""
            () => {
                const rows = Array.from(document.querySelectorAll('tr'));
                const cosponsorNames = [];

                for (let i = 0; i < rows.length; i++) {
                    const cells = Array.from(rows[i].querySelectorAll('td'));
                    if (cells.length >= 4) {
                        const name = cells[0].textContent.trim();
                        if (name && name !== 'Member') {
                            cosponsorNames.push(name);
                        }
                    }
                }

                return cosponsorNames.join('; ');
            }
        """)

        return cosponsors

    async def scrape_bill_actions(self, bill_number: str) -> str:
        """
        Scrape bill actions for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            Pipe-separated string of actions (date | description)
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        url = self._get_bill_actions_url(bill_number)
        await self.page.goto(url, wait_until="networkidle")

        # Extract bill actions
        actions = await self.page.evaluate("""
            () => {
                const rows = Array.from(document.querySelectorAll('tr'));
                const actionStrings = [];

                for (let i = 0; i < rows.length; i++) {
                    const cells = Array.from(rows[i].querySelectorAll('td'));
                    if (cells.length >= 3) {
                        const date = cells[0].textContent.trim();
                        const description = cells[2].textContent.trim();

                        if (date && description && date !== 'Date') {
                            actionStrings.push(date + ' | ' + description);
                        }
                    }
                }

                return actionStrings.join(' || ');
            }
        """)

        return actions

    async def scrape_bill_hearings(self, bill_number: str) -> str:
        """
        Scrape bill hearings for a specific bill.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)

        Returns:
            Pipe-separated string of hearings (committee | date | time | location)
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        url = self._get_bill_hearings_url(bill_number)
        await self.page.goto(url, wait_until="networkidle")

        # Extract bill hearings
        hearings = await self.page.evaluate("""
            () => {
                const table = document.querySelector('table');
                if (!table) return '';

                const rows = Array.from(table.querySelectorAll('tr'));
                const hearingStrings = [];

                let currentCommittee = '';
                let currentDate = '';
                let currentTime = '';
                let currentLocation = '';

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = Array.from(row.querySelectorAll('td, th'));

                    if (cells.length === 1 && cells[0].tagName === 'TH') {
                        // This is a committee header row
                        if (currentCommittee && currentDate) {
                            hearingStrings.push(currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation);
                        }

                        const committeeLink = cells[0].querySelector('a');
                        currentCommittee = committeeLink ? committeeLink.textContent.trim() : cells[0].textContent.trim();
                        currentDate = '';
                        currentTime = '';
                        currentLocation = '';
                    } else if (cells.length === 2) {
                        const label = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();

                        if (label === 'Date:') {
                            currentDate = value;
                        } else if (label === 'Time:') {
                            currentTime = value;
                        } else if (label === 'Location:') {
                            currentLocation = value;
                        }
                    }
                }

                // Add the last hearing
                if (currentCommittee && currentDate) {
                    hearingStrings.push(currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation);
                }

                return hearingStrings.join(' || ');
            }
        """)

        return hearings

    def _extract_district_from_sponsor(self, sponsor_text: str) -> Optional[str]:
        """
        Extract district number from sponsor text like "LastName, FirstName (151)".

        Args:
            sponsor_text: Raw sponsor text from bill list page

        Returns:
            District number as string, or None if not found
        """
        match = re.search(r'\((\d+)\)$', sponsor_text)
        if match:
            return match.group(1)
        return None

    async def get_or_create_session(self) -> str:
        """
        Get or create the session record for this scraper's year/session_code.

        Returns:
            The UUID of the session
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")

        year = self.year or 2026  # Default to current year if not specified

        # Try to find existing session
        response = self.supabase.table('sessions').select('id').eq(
            'year', year
        ).eq(
            'session_code', self.session_code
        ).execute()

        if response.data:
            return response.data[0]['id']
        else:
            # Create new session
            insert_response = self.supabase.table('sessions').insert({
                'year': year,
                'session_code': self.session_code
            }).execute()
            return insert_response.data[0]['id']

    async def get_session_legislator_by_district(self, district: str) -> Optional[str]:
        """
        Look up a session_legislator in the database by district for the current session.

        Args:
            district: District number (e.g., "151")

        Returns:
            The session_legislator UUID if found, None otherwise
        """
        if not self.supabase or not self.session_id:
            raise RuntimeError("Supabase client or session not initialized")

        # Check cache first
        cache_key = f"district:{district}"
        if cache_key in self.session_legislator_cache:
            return self.session_legislator_cache[cache_key]

        # Search database for session_legislator by district
        response = self.supabase.table('session_legislators').select('id').eq(
            'session_id', self.session_id
        ).eq(
            'district', district
        ).execute()

        if response.data:
            session_legislator_id = response.data[0]['id']
            self.session_legislator_cache[cache_key] = session_legislator_id
            return session_legislator_id

        return None

    async def get_session_legislator_by_name(self, name: str) -> Optional[str]:
        """
        Look up a session_legislator in the database by legislator name for the current session.

        Args:
            name: Legislator name

        Returns:
            The session_legislator UUID if found, None otherwise
        """
        if not self.supabase or not self.session_id:
            raise RuntimeError("Supabase client or session not initialized")

        # Check cache first
        cache_key = f"name:{name}"
        if cache_key in self.session_legislator_cache:
            return self.session_legislator_cache[cache_key]

        # First, find the legislator by name
        leg_response = self.supabase.table('legislators').select('id').eq('name', name).execute()

        if not leg_response.data:
            return None

        legislator_id = leg_response.data[0]['id']

        # Then find the session_legislator record for this session and legislator
        sl_response = self.supabase.table('session_legislators').select('id').eq(
            'session_id', self.session_id
        ).eq(
            'legislator_id', legislator_id
        ).execute()

        if sl_response.data:
            session_legislator_id = sl_response.data[0]['id']
            self.session_legislator_cache[cache_key] = session_legislator_id
            return session_legislator_id

        return None

    async def download_bill_documents(self, bill_number: str, documents_string: str, output_dir: Path) -> List[str]:
        """
        Download bill document PDFs.

        Args:
            bill_number: Bill number (e.g., HB1, HRM1)
            documents_string: Pipe-separated string of documents (type | url)
            output_dir: Directory to save PDFs

        Returns:
            List of downloaded file paths
        """
        if not documents_string:
            return []

        # Parse the documents string
        document_pairs = documents_string.split(' || ')
        downloaded_files = []

        # Create output directory for this bill
        bill_dir = output_dir / bill_number
        bill_dir.mkdir(parents=True, exist_ok=True)

        async with httpx.AsyncClient(timeout=30.0) as client:
            for pair in document_pairs:
                parts = pair.split(' | ')
                if len(parts) != 2:
                    continue

                doc_type = parts[0].strip()
                doc_url = parts[1].strip()

                # Create safe filename
                safe_doc_type = doc_type.replace(' ', '_').replace('/', '_')
                filename = f"{bill_number}_{safe_doc_type}.pdf"
                filepath = bill_dir / filename

                try:
                    print(f"    Downloading {doc_type}...")
                    response = await client.get(doc_url)
                    response.raise_for_status()

                    # Save PDF
                    filepath.write_bytes(response.content)
                    downloaded_files.append(str(filepath))
                    print(f"    Saved to {filepath}")

                except Exception as e:
                    print(f"    Error downloading {doc_type}: {e}")

        return downloaded_files

    async def insert_bill_to_db(self, bill_data: Dict[str, Any]) -> tuple[str, bool]:
        """
        Insert or update a complete bill with all related data into the database.

        Args:
            bill_data: Dictionary containing all bill information

        Returns:
            Tuple of (bill_id, was_updated) where was_updated is True if bill was updated, False if inserted
        """
        if not self.supabase or not self.session_id:
            raise RuntimeError("Supabase client or session not initialized")

        # Check if bill already exists
        existing_bill = self.supabase.table('bills').select('id').eq(
            'bill_number', bill_data['bill_number']
        ).eq(
            'session_id', self.session_id
        ).execute()

        bill_record = {
            'bill_number': bill_data['bill_number'],
            'session_id': self.session_id,
            'title': bill_data.get('title'),
            'description': bill_data.get('description'),
            'lr_number': bill_data.get('lr_number'),
            'bill_string': bill_data.get('bill_string'),
            'last_action': bill_data.get('last_action'),
            'proposed_effective_date': bill_data.get('proposed_effective_date'),
            'calendar_status': bill_data.get('calendar_status'),
            'hearing_status': bill_data.get('hearing_status'),
            'bill_url': bill_data.get('bill_url'),
        }

        if existing_bill.data:
            # Update existing bill
            bill_id = existing_bill.data[0]['id']
            was_updated = True
            self.supabase.table('bills').update(bill_record).eq('id', bill_id).execute()

            # Delete existing related data to re-insert fresh data
            self.supabase.table('bill_sponsors').delete().eq('bill_id', bill_id).execute()
            self.supabase.table('bill_actions').delete().eq('bill_id', bill_id).execute()
            self.supabase.table('bill_hearings').delete().eq('bill_id', bill_id).execute()
            self.supabase.table('bill_documents').delete().eq('bill_id', bill_id).execute()
        else:
            # Insert new bill
            was_updated = False
            bill_response = self.supabase.table('bills').insert(bill_record).execute()
            bill_id = bill_response.data[0]['id']

        # Insert primary sponsor
        if bill_data.get('sponsor'):
            try:
                # Extract district from sponsor text
                district = self._extract_district_from_sponsor(bill_data['sponsor'])

                if district:
                    # Look up session_legislator by district
                    session_legislator_id = await self.get_session_legislator_by_district(district)

                    if session_legislator_id:
                        self.supabase.table('bill_sponsors').insert({
                            'bill_id': bill_id,
                            'session_legislator_id': session_legislator_id,
                            'is_primary': True
                        }).execute()
                    else:
                        print(f"  Warning: Primary sponsor from district '{district}' not found in session_legislators")
                else:
                    print(f"  Warning: Could not extract district from primary sponsor: '{bill_data['sponsor']}'")
            except Exception as e:
                print(f"  Warning: Could not insert primary sponsor: {e}")

        # Insert co-sponsors
        if bill_data.get('cosponsors'):
            cosponsors = bill_data['cosponsors'].split('; ')
            for cosponsor_name in cosponsors:
                if cosponsor_name.strip():
                    try:
                        # Look up session_legislator by name
                        session_legislator_id = await self.get_session_legislator_by_name(cosponsor_name.strip())

                        if session_legislator_id:
                            self.supabase.table('bill_sponsors').insert({
                                'bill_id': bill_id,
                                'session_legislator_id': session_legislator_id,
                                'is_primary': False
                            }).execute()
                        else:
                            print(f"  Warning: Co-sponsor '{cosponsor_name}' not found in session_legislators")
                    except Exception as e:
                        print(f"  Warning: Could not insert co-sponsor {cosponsor_name}: {e}")

        # Insert bill actions
        if bill_data.get('actions'):
            actions = bill_data['actions'].split(' || ')
            for i, action_str in enumerate(actions):
                parts = action_str.split(' | ')
                if len(parts) == 2:
                    try:
                        self.supabase.table('bill_actions').insert({
                            'bill_id': bill_id,
                            'action_date': parts[0].strip(),
                            'description': parts[1].strip(),
                            'sequence_order': i
                        }).execute()
                    except Exception as e:
                        print(f"  Warning: Could not insert action: {e}")

        # Insert bill hearings
        if bill_data.get('hearings'):
            hearings = bill_data['hearings'].split(' || ')
            for hearing_str in hearings:
                parts = hearing_str.split(' | ')
                if len(parts) == 4:
                    try:
                        committee_name = parts[0].strip()

                        # Upsert committee
                        committee_response = self.supabase.table('committees').select('id').eq(
                            'name', committee_name
                        ).execute()

                        if committee_response.data:
                            committee_id = committee_response.data[0]['id']
                        else:
                            committee_insert = self.supabase.table('committees').insert({
                                'name': committee_name
                            }).execute()
                            committee_id = committee_insert.data[0]['id']

                        self.supabase.table('bill_hearings').insert({
                            'bill_id': bill_id,
                            'committee_id': committee_id,
                            'hearing_date': parts[1].strip() or None,
                            'hearing_time': parts[2].strip() or None,
                            'location': parts[3].strip()
                        }).execute()
                    except Exception as e:
                        print(f"  Warning: Could not insert hearing: {e}")

        # Insert bill documents
        if bill_data.get('bill_documents'):
            documents = bill_data['bill_documents'].split(' || ')
            for doc_str in documents:
                parts = doc_str.split(' | ')
                if len(parts) == 2:
                    try:
                        self.supabase.table('bill_documents').insert({
                            'bill_id': bill_id,
                            'document_type': parts[0].strip(),
                            'document_url': parts[1].strip(),
                            'storage_path': None  # Will be updated when PDF is uploaded
                        }).execute()
                    except Exception as e:
                        print(f"  Warning: Could not insert document: {e}")

        return bill_id, was_updated


async def main():
    """Main function to run the scraper."""
    import argparse

    parser = argparse.ArgumentParser(description='Scrape Missouri House bills and insert into Supabase')
    parser.add_argument('--year', type=int, help='Legislative year (omit for current session)')
    parser.add_argument('--session-code', default='R', choices=['R', 'E'],
                        help='Session code: R=Regular, E=Extraordinary')
    parser.add_argument('--limit', type=int,
                        help='Limit number of bills to scrape (useful for testing)')
    parser.add_argument('--pdf-dir', type=str, default='bill_pdfs',
                        help='Directory to save downloaded PDFs (default: bill_pdfs)')
    parser.add_argument('--supabase-url', type=str,
                        help='Supabase project URL (defaults to SUPABASE_URL env var)')
    parser.add_argument('--supabase-key', type=str,
                        help='Supabase API key (defaults to SUPABASE_KEY env var)')

    args = parser.parse_args()

    # Run scraper
    async with MoHouseBillScraper(
        year=args.year,
        session_code=args.session_code,
        supabase_url=args.supabase_url,
        supabase_key=args.supabase_key
    ) as scraper:
        # Get or create session
        scraper.session_id = await scraper.get_or_create_session()
        year = args.year or 2026
        print(f"Using session: {year} {scraper.session_code} (ID: {scraper.session_id})\n")

        bills = await scraper.scrape_bills()

        if not bills:
            print("No bills found!")
            return

        # Limit bills if requested
        if args.limit:
            bills = bills[:args.limit]
            print(f"Limited to first {args.limit} bills")

        # Always scrape detailed information
        print(f"Scraping detailed information for {len(bills)} bills...")
        detailed_bills = []

        for i, bill in enumerate(bills, 1):
            bill_number = bill['bill_number']
            print(f"[{i}/{len(bills)}] Scraping details for {bill_number}...")

            try:
                details = await scraper.scrape_bill_details(bill_number)

                # Scrape co-sponsors
                try:
                    cosponsors = await scraper.scrape_cosponsors(bill_number)
                    details['cosponsors'] = cosponsors
                except Exception as e:
                    print(f"  Warning: Could not scrape co-sponsors for {bill_number}: {e}")
                    details['cosponsors'] = ''

                # Scrape bill actions
                try:
                    actions = await scraper.scrape_bill_actions(bill_number)
                    details['actions'] = actions
                except Exception as e:
                    print(f"  Warning: Could not scrape actions for {bill_number}: {e}")
                    details['actions'] = ''

                # Scrape bill hearings
                try:
                    hearings = await scraper.scrape_bill_hearings(bill_number)
                    details['hearings'] = hearings
                except Exception as e:
                    print(f"  Warning: Could not scrape hearings for {bill_number}: {e}")
                    details['hearings'] = ''

                # Always download PDFs (for now, even with database mode)
                try:
                    pdf_dir = Path(args.pdf_dir)
                    downloaded = await scraper.download_bill_documents(
                        bill_number,
                        details.get('bill_documents', ''),
                        pdf_dir
                    )
                    details['downloaded_pdfs'] = '; '.join(downloaded)
                except Exception as e:
                    print(f"  Warning: Could not download PDFs for {bill_number}: {e}")
                    details['downloaded_pdfs'] = ''

                # Merge basic info with detailed info
                merged = {**bill, **details}
                detailed_bills.append(merged)

                # Insert to database
                try:
                    bill_id, was_updated = await scraper.insert_bill_to_db(merged)
                    if was_updated:
                        print(f"  ✓ Updated in database with ID: {bill_id}")
                    else:
                        print(f"  ✓ Inserted to database with ID: {bill_id}")
                except Exception as e:
                    print(f"  Error inserting/updating to database: {e}")

            except Exception as e:
                print(f"  Error scraping {bill_number}: {e}")
                # Keep the basic info even if detailed scraping fails
                detailed_bills.append(bill)

        print(f"\n✓ Successfully processed {len(detailed_bills)} bills into database")


if __name__ == '__main__':
    asyncio.run(main())
