#!/usr/bin/env python3
"""
Scrape all Missouri House sessions from 2026 back to 2000.

This script runs the 2-step workflow (legislators first, then bills) for each session.
Session codes: R = Regular, S1 = Special/1st Extraordinary, S2 = 2nd Extraordinary
"""

import asyncio
import sys
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from legislators.scrape_mo_legislators import MoLegislatorScraper
from bills.scrape_mo_house_bills import MoHouseBillScraper
from db_utils import Database


# Define all sessions to scrape (year, session_code, description)
SESSIONS = [
    # 2026
    (2026, 'R', '2026 Regular Session'),

    # 2025
    (2025, 'S2', '2025 2nd Extraordinary Session'),
    (2025, 'S1', '2025 1st Extraordinary Session'),
    (2025, 'R', '2025 Regular Session'),

    # 2024
    (2024, 'R', '2024 Regular Session'),

    # 2023
    (2023, 'R', '2023 Regular Session'),

    # 2022
    (2022, 'S1', '2022 1st Extraordinary Session'),
    (2022, 'R', '2022 Regular Session'),

    # 2021
    (2021, 'S1', '2021 1st Extraordinary Session'),
    (2021, 'R', '2021 Regular Session'),

    # 2020
    (2020, 'S2', '2020 2nd Extraordinary Session'),
    (2020, 'S1', '2020 1st Extraordinary Session'),
    (2020, 'R', '2020 Regular Session'),

    # 2019
    (2019, 'S1', '2019 1st Extraordinary Session'),
    (2019, 'R', '2019 Regular Session'),

    # 2018
    (2018, 'S2', '2018 1st Extraordinary Session'),
    (2018, 'S1', '2018 Special Session'),
    (2018, 'R', '2018 Regular Session'),

    # 2017
    (2017, 'S2', '2017 2nd Extraordinary Session'),
    (2017, 'S1', '2017 Extraordinary Session'),
    (2017, 'R', '2017 Regular Session'),

    # 2016
    (2016, 'R', '2016 Regular Session'),

    # 2015
    (2015, 'R', '2015 Regular Session'),

    # 2014
    (2014, 'R', '2014 Regular Session'),

    # 2013
    (2013, 'S1', '2013 Extraordinary Session'),
    (2013, 'R', '2013 Regular Session'),

    # 2012
    (2012, 'R', '2012 Regular Session'),

    # 2011
    (2011, 'S1', '2011 Extraordinary Session'),
    (2011, 'R', '2011 Regular Session'),

    # 2010
    (2010, 'S1', '2010 Extraordinary Session'),
    (2010, 'R', '2010 Regular Session'),

    # 2009
    (2009, 'R', '2009 Regular Session'),

    # 2008
    (2008, 'R', '2008 Regular Session'),

    # 2007
    (2007, 'S1', '2007 Extraordinary Session'),
    (2007, 'R', '2007 Regular Session'),

    # 2006
    (2006, 'R', '2006 Regular Session'),

    # 2005
    (2005, 'S1', '2005 Extraordinary Session'),
    (2005, 'R', '2005 Regular Session'),

    # 2004
    (2004, 'R', '2004 Regular Session'),

    # 2003
    (2003, 'S2', '2003 2nd Extraordinary Session'),
    (2003, 'S1', '2003 1st Extraordinary Session'),
    (2003, 'R', '2003 Regular Session'),

    # 2002
    (2002, 'R', '2002 Regular Session'),

    # 2001
    (2001, 'S1', '2001 Extraordinary Session'),
    (2001, 'R', '2001 Regular Session'),

    # 2000
    (2000, 'R', '2000 Regular Session'),
]


async def scrape_legislators_for_session(year: int, session_code: str, description: str, db: Database) -> tuple[int, int]:
    """
    Scrape all legislators for a session.

    Args:
        year: Legislative year
        session_code: Session code (R, S1, S2)
        description: Human-readable description
        db: Database instance

    Returns:
        Tuple of (inserted_count, updated_count)
    """
    print(f"\n{'='*80}")
    print(f"SCRAPING LEGISLATORS: {description}")
    print(f"{'='*80}")

    try:
        async with MoLegislatorScraper(year=year, session_code=session_code, db=db) as scraper:
            # Get or create session
            session_id = db.get_or_create_session(year, session_code)
            print(f"Session ID: {session_id}")

            # Get list of legislators
            legislators = await scraper.scrape_legislator_list()

            if not legislators:
                print(f"⚠️  No legislators found for {description}")
                return 0, 0

            print(f"Found {len(legislators)} legislators")

            # Scrape each legislator
            inserted_count = 0
            updated_count = 0

            for i, legislator in enumerate(legislators, 1):
                try:
                    print(f"[{i}/{len(legislators)}] {legislator['name']} (District {legislator['district']})")

                    # Scrape full profile
                    details = await scraper.scrape_legislator_details(legislator['profile_url'])

                    # Upsert to database
                    legislator_id, was_updated = db.upsert_legislator(details)

                    # Link legislator to session
                    district = details.get('district', '')
                    db.link_legislator_to_session(session_id, legislator_id, district)

                    if was_updated:
                        updated_count += 1
                    else:
                        inserted_count += 1

                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    continue

            print(f"\n✅ Legislators complete: {inserted_count} inserted, {updated_count} updated")
            return inserted_count, updated_count

    except Exception as e:
        print(f"\n❌ Failed to scrape legislators for {description}: {e}")
        return 0, 0


async def scrape_bills_for_session(year: int, session_code: str, description: str, db: Database) -> tuple[int, int]:
    """
    Scrape all bills for a session.

    Args:
        year: Legislative year
        session_code: Session code (R, S1, S2)
        description: Human-readable description
        db: Database instance

    Returns:
        Tuple of (inserted_count, updated_count)
    """
    print(f"\n{'='*80}")
    print(f"SCRAPING BILLS: {description}")
    print(f"{'='*80}")

    try:
        async with MoHouseBillScraper(year=year, session_code=session_code, db=db) as scraper:
            # Get or create session
            scraper.session_id = scraper.get_or_create_session_sync()
            print(f"Session ID: {scraper.session_id}")

            # Get list of bills
            bills = await scraper.scrape_bills()

            if not bills:
                print(f"⚠️  No bills found for {description}")
                return 0, 0

            print(f"Found {len(bills)} bills")

            # Scrape each bill
            inserted_count = 0
            updated_count = 0

            for i, bill in enumerate(bills, 1):
                bill_number = bill['bill_number']

                try:
                    print(f"[{i}/{len(bills)}] {bill_number}")

                    # Scrape bill details
                    details = await scraper.scrape_bill_details(bill_number)

                    # Scrape co-sponsors
                    try:
                        cosponsors = await scraper.scrape_cosponsors(bill_number)
                        details['cosponsors'] = cosponsors
                    except Exception as e:
                        print(f"  ⚠️  Could not scrape co-sponsors: {e}")
                        details['cosponsors'] = ''

                    # Scrape bill actions
                    try:
                        actions = await scraper.scrape_bill_actions(bill_number)
                        details['actions'] = actions
                    except Exception as e:
                        print(f"  ⚠️  Could not scrape actions: {e}")
                        details['actions'] = ''

                    # Scrape bill hearings
                    try:
                        hearings = await scraper.scrape_bill_hearings(bill_number)
                        details['hearings'] = hearings
                    except Exception as e:
                        print(f"  ⚠️  Could not scrape hearings: {e}")
                        details['hearings'] = ''

                    # Download PDFs and upload to Supabase Storage
                    document_info = []
                    try:
                        pdf_dir = Path('bill_pdfs')
                        document_info = await scraper.download_bill_documents(
                            bill_number,
                            details.get('bill_documents', ''),
                            pdf_dir
                        )
                        details['downloaded_pdfs'] = '; '.join([doc['local_path'] for doc in document_info])
                    except Exception as e:
                        print(f"  ⚠️  Could not download PDFs: {e}")
                        details['downloaded_pdfs'] = ''

                    # Merge and insert to database with document info (including storage paths)
                    merged = {**bill, **details}
                    bill_id, was_updated = await scraper.insert_bill_to_db(merged, document_info)

                    if was_updated:
                        updated_count += 1
                    else:
                        inserted_count += 1

                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    continue

            print(f"\n✅ Bills complete: {inserted_count} inserted, {updated_count} updated")
            return inserted_count, updated_count

    except Exception as e:
        print(f"\n❌ Failed to scrape bills for {description}: {e}")
        return 0, 0


async def main():
    """Main function to scrape all sessions."""
    print("="*80)
    print("MISSOURI HOUSE SCRAPER - ALL SESSIONS (2026-2000)")
    print("="*80)
    print(f"\nTotal sessions to process: {len(SESSIONS)}")

    # Get Database instance (shared across all sessions)
    db = Database()

    overall_stats = {
        'sessions_processed': 0,
        'sessions_failed': 0,
        'legislators_inserted': 0,
        'legislators_updated': 0,
        'bills_inserted': 0,
        'bills_updated': 0,
    }

    for year, session_code, description in SESSIONS:
        try:
            # Step 1: Scrape legislators
            leg_inserted, leg_updated = await scrape_legislators_for_session(year, session_code, description, db)
            overall_stats['legislators_inserted'] += leg_inserted
            overall_stats['legislators_updated'] += leg_updated

            # Step 2: Scrape bills
            bill_inserted, bill_updated = await scrape_bills_for_session(year, session_code, description, db)
            overall_stats['bills_inserted'] += bill_inserted
            overall_stats['bills_updated'] += bill_updated

            overall_stats['sessions_processed'] += 1

        except Exception as e:
            print(f"\n❌ FATAL ERROR processing {description}: {e}")
            overall_stats['sessions_failed'] += 1
            continue

    # Print final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Sessions processed: {overall_stats['sessions_processed']}/{len(SESSIONS)}")
    print(f"Sessions failed: {overall_stats['sessions_failed']}")
    print(f"\nLegislators:")
    print(f"  - Inserted: {overall_stats['legislators_inserted']}")
    print(f"  - Updated: {overall_stats['legislators_updated']}")
    print(f"\nBills:")
    print(f"  - Inserted: {overall_stats['bills_inserted']}")
    print(f"  - Updated: {overall_stats['bills_updated']}")
    print("="*80)


if __name__ == '__main__':
    asyncio.run(main())
