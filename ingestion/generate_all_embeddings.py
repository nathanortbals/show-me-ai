#!/usr/bin/env python3
"""
Generate embeddings for all Missouri House sessions from 2026 back to 2000.

This script runs the embeddings pipeline for each session, creating vector
embeddings for bill text and metadata to enable semantic search.
"""

import sys
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from db_utils import Database
from embeddings.embeddings_pipeline import EmbeddingsPipeline


# Define all sessions to process (year, session_code, description)
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


def generate_embeddings_for_session(
    year: int,
    session_code: str,
    description: str,
    db: Database,
    pipeline: EmbeddingsPipeline
) -> tuple[int, int]:
    """
    Generate embeddings for all bills in a session.

    Args:
        year: Legislative year
        session_code: Session code (R, S1, S2)
        description: Human-readable description
        db: Database instance
        pipeline: EmbeddingsPipeline instance

    Returns:
        Tuple of (bills_processed, embeddings_created)
    """
    print(f"\n{'='*80}")
    print(f"GENERATING EMBEDDINGS: {description}")
    print(f"{'='*80}")

    try:
        # Get or create session
        session_id = db.get_or_create_session(year, session_code)
        print(f"Session ID: {session_id}")

        # Process all bills in the session
        bills_processed, embeddings_created = pipeline.process_session(session_id)

        if bills_processed == 0:
            print(f"⚠️  No bills found for {description}")
            return 0, 0

        print(f"\n✅ Embeddings complete for {description}")
        print(f"   Bills processed: {bills_processed}")
        print(f"   Embeddings created: {embeddings_created}")
        print(f"   Average per bill: {embeddings_created / bills_processed if bills_processed else 0:.1f}")

        return bills_processed, embeddings_created

    except Exception as e:
        print(f"\n❌ Failed to generate embeddings for {description}: {e}")
        import traceback
        traceback.print_exc()
        return 0, 0


def main():
    """Main function to generate embeddings for all sessions."""
    print("="*80)
    print("MISSOURI HOUSE EMBEDDINGS GENERATOR - ALL SESSIONS (2026-2000)")
    print("="*80)
    print(f"\nTotal sessions to process: {len(SESSIONS)}")
    print("\nThis will:")
    print("- Extract text from bill PDFs in Supabase Storage")
    print("- Filter to 'Introduced' + most recent version (excludes fiscal notes)")
    print("- Chunk using section-based or sentence-based strategies")
    print("- Generate embeddings via OpenAI text-embedding-3-small")
    print("- Store with comprehensive metadata (sponsors, committees, session info)")

    # Initialize Database and EmbeddingsPipeline (shared across all sessions)
    db = Database()
    pipeline = EmbeddingsPipeline(db=db)

    overall_stats = {
        'sessions_processed': 0,
        'sessions_failed': 0,
        'total_bills_processed': 0,
        'total_embeddings_created': 0,
    }

    for year, session_code, description in SESSIONS:
        try:
            bills_processed, embeddings_created = generate_embeddings_for_session(
                year, session_code, description, db, pipeline
            )

            overall_stats['total_bills_processed'] += bills_processed
            overall_stats['total_embeddings_created'] += embeddings_created

            if bills_processed > 0:
                overall_stats['sessions_processed'] += 1
            else:
                overall_stats['sessions_failed'] += 1

        except Exception as e:
            print(f"\n❌ FATAL ERROR processing {description}: {e}")
            overall_stats['sessions_failed'] += 1
            continue

    # Print final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Sessions processed: {overall_stats['sessions_processed']}/{len(SESSIONS)}")
    print(f"Sessions failed/empty: {overall_stats['sessions_failed']}")
    print(f"\nBills processed: {overall_stats['total_bills_processed']}")
    print(f"Total embeddings created: {overall_stats['total_embeddings_created']}")
    if overall_stats['total_bills_processed'] > 0:
        avg = overall_stats['total_embeddings_created'] / overall_stats['total_bills_processed']
        print(f"Average embeddings per bill: {avg:.1f}")
    print("="*80)


if __name__ == '__main__':
    main()
