#!/usr/bin/env python3
"""
Scrapes Missouri House of Representatives legislators and inserts them into Supabase.
"""

import asyncio
import sys
from pathlib import Path
from typing import List, Dict, Optional, Any
from playwright.async_api import async_playwright, Page, Browser

# Add parent directory to path for db_utils import
sys.path.insert(0, str(Path(__file__).parent.parent))
from db_utils import Database


class MoLegislatorScraper:
    """Scraper for Missouri House legislators."""

    MEMBER_ROSTER_TEMPLATE = "https://archive.house.mo.gov/MemberGridCluster.aspx?year={year}&code={code}"
    CURRENT_ROSTER_URL = "https://house.mo.gov/MemberGridCluster.aspx"

    def __init__(self, year: Optional[int] = None, session_code: str = "R", db: Optional[Database] = None):
        """
        Initialize the legislator scraper.

        Args:
            year: Legislative year (None for current session)
            session_code: Session code (R for Regular, E for Extraordinary)
            db: Database instance for all database operations
        """
        self.year = year
        self.session_code = session_code
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.db = db

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

    def _get_roster_url(self) -> str:
        """Get the appropriate roster URL based on year."""
        if self.year:
            return self.MEMBER_ROSTER_TEMPLATE.format(year=self.year, code=self.session_code)
        return self.CURRENT_ROSTER_URL

    async def scrape_legislator_list(self) -> List[Dict[str, str]]:
        """
        Scrape the list of legislators from the member roster page.

        Returns:
            List of dictionaries with legislator info (name, district, party, profile_url)
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        url = self._get_roster_url()
        print(f"Navigating to {url}...")
        await self.page.goto(url, wait_until="networkidle")

        # Wait for content to load
        await self.page.wait_for_selector('main', timeout=10000)

        print("Extracting legislator list...")

        # Extract legislator data
        legislators = await self.page.evaluate("""
            () => {
                const legislators = [];
                const main = document.querySelector('main');
                if (!main) return legislators;

                // Find all links that go to MemberDetails
                const links = Array.from(main.querySelectorAll('a[href*="MemberDetails"]'));

                // Group links by district (each legislator has 2 links - first and last name)
                const districtMap = new Map();

                for (const link of links) {
                    const href = link.href;
                    const districtMatch = href.match(/district=(\\d+)/);
                    if (districtMatch) {
                        const district = districtMatch[1];
                        if (!districtMap.has(district)) {
                            districtMap.set(district, {
                                profile_url: href,
                                district: district,
                                name_parts: []
                            });
                        }
                        districtMap.get(district).name_parts.push(link.textContent.trim());
                    }
                }

                // Now find party affiliations by looking at StaticText elements
                const staticTexts = Array.from(document.querySelectorAll('main *'));
                const parties = [];

                for (const el of staticTexts) {
                    const text = el.textContent.trim();
                    if (text === 'R' || text === 'D' || text === 'Republican' || text === 'Democrat') {
                        parties.push(text);
                    }
                }

                // Convert map to array and add party info
                const districtArray = Array.from(districtMap.values());
                for (let i = 0; i < districtArray.length && i < parties.length; i++) {
                    const legislator = districtArray[i];
                    // Combine name parts (usually last name, first name)
                    legislator.name = legislator.name_parts.join(' ');
                    delete legislator.name_parts;

                    // Add party
                    const party = parties[i];
                    if (party === 'R') {
                        legislator.party_abbrev = 'R';
                    } else if (party === 'D') {
                        legislator.party_abbrev = 'D';
                    } else {
                        legislator.party_abbrev = party;
                    }

                    legislators.push(legislator);
                }

                return legislators;
            }
        """)

        print(f"Found {len(legislators)} legislators")
        return legislators

    async def scrape_legislator_details(self, profile_url: str) -> Dict[str, Any]:
        """
        Scrape detailed information for a specific legislator.

        Args:
            profile_url: URL to the legislator's profile page

        Returns:
            Dictionary containing legislator details
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        await self.page.goto(profile_url, wait_until="networkidle")

        # Extract legislator details
        details = await self.page.evaluate("""
            () => {
                const details = {
                    name: '',
                    legislator_type: '',
                    district: '',
                    party_affiliation: '',
                    year_elected: '',
                    years_served: '',
                    picture_url: '',
                    is_active: true,
                    profile_url: window.location.href
                };

                // Extract name and type from h1
                const h1 = document.querySelector('h1');
                if (h1) {
                    let fullName = h1.textContent.trim();
                    // Fix missing space between title and name
                    fullName = fullName.replace(/^(Representative|Senator)([A-Z])/, '$1 $2');

                    // Extract legislator type
                    const typeMatch = fullName.match(/^(Representative|Senator)\\s+/);
                    if (typeMatch) {
                        details.legislator_type = typeMatch[1];
                    }

                    // Remove "Representative" or "Senator" prefix from name
                    details.name = fullName.replace(/^(Representative|Senator)\\s+/, '');
                }

                // Extract picture URL
                const pictureImg = document.querySelector('img[src*="MemberPhoto"]');
                if (pictureImg) {
                    details.picture_url = pictureImg.src;
                }

                // Check if this is a former member (inactive)
                const pageText = document.body.textContent;
                if (pageText.indexOf('This record belongs to a former Representative') !== -1 ||
                    pageText.indexOf('This record belongs to a former Senator') !== -1) {
                    details.is_active = false;
                }

                // Find all StaticText nodes in main content
                const mainElement = document.querySelector('main');
                if (mainElement) {
                    // Get all text nodes
                    const walker = document.createTreeWalker(
                        mainElement,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );

                    const textNodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        const text = node.textContent.trim();
                        if (text) {
                            textNodes.push(text);
                        }
                    }

                    for (let i = 0; i < textNodes.length; i++) {
                        const text = textNodes[i];

                        // Extract district
                        if (text.indexOf('District') === 0) {
                            details.district = text.replace('District ', '');
                        }

                        // Extract party
                        if (text === 'Republican' || text === 'Democrat' || text === 'Democratic' || text === 'Independent') {
                            details.party_affiliation = text;
                        }

                        // Extract year elected
                        if (text === 'Elected:' && i + 1 < textNodes.length) {
                            details.year_elected = textNodes[i + 1].trim();
                        }

                        // Extract years served
                        if (text === 'Years Served:' && i + 1 < textNodes.length) {
                            details.years_served = textNodes[i + 1].trim();
                        }
                    }
                }

                return details;
            }
        """)

        return details



async def main():
    """Main function to run the scraper."""
    import argparse

    parser = argparse.ArgumentParser(description='Scrape Missouri House legislators and insert into Supabase')
    parser.add_argument('--year', type=int, help='Legislative year (omit for current session)')
    parser.add_argument('--session-code', default='R', choices=['R', 'S1', 'S2'],
                        help='Session code: R=Regular, S1=Special/1st Extraordinary, S2=2nd Extraordinary')

    args = parser.parse_args()

    # Get Database instance
    db = Database()

    # Run scraper
    async with MoLegislatorScraper(
        year=args.year,
        session_code=args.session_code,
        db=db
    ) as scraper:
        # Get or create session
        year = args.year or 2026
        session_id = db.get_or_create_session(year, scraper.session_code)
        print(f"Using session: {year} {scraper.session_code} (ID: {session_id})")

        # Get list of legislators
        legislators = await scraper.scrape_legislator_list()

        if not legislators:
            print("No legislators found!")
            return

        print(f"\nScraping detailed information for {len(legislators)} legislators...")
        inserted_count = 0
        updated_count = 0

        for i, legislator in enumerate(legislators, 1):
            print(f"[{i}/{len(legislators)}] Scraping {legislator['name']} (District {legislator['district']})...")

            try:
                # Scrape full profile
                details = await scraper.scrape_legislator_details(legislator['profile_url'])

                # Upsert to database
                legislator_id, was_updated = db.upsert_legislator(details)

                # Link legislator to session
                district = details.get('district', '')
                db.link_legislator_to_session(session_id, legislator_id, district)

                if was_updated:
                    print(f"  ✓ Updated in database with ID: {legislator_id}")
                    updated_count += 1
                else:
                    print(f"  ✓ Inserted to database with ID: {legislator_id}")
                    inserted_count += 1

            except Exception as e:
                print(f"  Error processing legislator: {e}")

        print(f"\n✓ Successfully processed {len(legislators)} legislators")
        print(f"  - Inserted: {inserted_count}")
        print(f"  - Updated: {updated_count}")


if __name__ == '__main__':
    asyncio.run(main())
