#!/usr/bin/env tsx
/**
 * CLI for Missouri Bills ingestion pipeline
 *
 * Provides commands for scraping legislators, bills, and generating embeddings.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Promise Rejection:');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.log('\nContinuing with next operation...\n');
  // Don't exit - let the process continue
});

import { Command } from 'commander';
import { runLegislatorScraper } from './legislators/scraper';
import { scrapeBillsForSession } from './bills/scraper';
import { processSession } from './embeddings/pipeline';
import { extractTextForSession } from './text-extraction/extractor';
import { DatabaseClient } from '@/database/client';

// All Missouri House sessions from 2026 to 2000
const SESSIONS = [
  // 2026
  { year: 2026, sessionCode: 'R', description: '2026 Regular Session' },

  // 2025
  { year: 2025, sessionCode: 'S2', description: '2025 2nd Extraordinary Session' },
  { year: 2025, sessionCode: 'S1', description: '2025 1st Extraordinary Session' },
  { year: 2025, sessionCode: 'R', description: '2025 Regular Session' },

  // 2024
  { year: 2024, sessionCode: 'R', description: '2024 Regular Session' },

  // 2023
  { year: 2023, sessionCode: 'R', description: '2023 Regular Session' },

  // 2022
  { year: 2022, sessionCode: 'S1', description: '2022 1st Extraordinary Session' },
  { year: 2022, sessionCode: 'R', description: '2022 Regular Session' },

  // 2021
  { year: 2021, sessionCode: 'S1', description: '2021 1st Extraordinary Session' },
  { year: 2021, sessionCode: 'R', description: '2021 Regular Session' },

  // 2020
  { year: 2020, sessionCode: 'S2', description: '2020 2nd Extraordinary Session' },
  { year: 2020, sessionCode: 'S1', description: '2020 1st Extraordinary Session' },
  { year: 2020, sessionCode: 'R', description: '2020 Regular Session' },

  // 2019
  { year: 2019, sessionCode: 'S1', description: '2019 1st Extraordinary Session' },
  { year: 2019, sessionCode: 'R', description: '2019 Regular Session' },

  // 2018
  { year: 2018, sessionCode: 'S2', description: '2018 1st Extraordinary Session' },
  { year: 2018, sessionCode: 'S1', description: '2018 Special Session' },
  { year: 2018, sessionCode: 'R', description: '2018 Regular Session' },

  // 2017
  { year: 2017, sessionCode: 'S2', description: '2017 2nd Extraordinary Session' },
  { year: 2017, sessionCode: 'S1', description: '2017 Extraordinary Session' },
  { year: 2017, sessionCode: 'R', description: '2017 Regular Session' },

  // 2016
  { year: 2016, sessionCode: 'R', description: '2016 Regular Session' },

  // 2015
  { year: 2015, sessionCode: 'R', description: '2015 Regular Session' },

  // 2014
  { year: 2014, sessionCode: 'R', description: '2014 Regular Session' },

  // 2013
  { year: 2013, sessionCode: 'S1', description: '2013 Extraordinary Session' },
  { year: 2013, sessionCode: 'R', description: '2013 Regular Session' },

  // 2012
  { year: 2012, sessionCode: 'R', description: '2012 Regular Session' },

  // 2011
  { year: 2011, sessionCode: 'S1', description: '2011 Extraordinary Session' },
  { year: 2011, sessionCode: 'R', description: '2011 Regular Session' },

  // 2010
  { year: 2010, sessionCode: 'S1', description: '2010 Extraordinary Session' },
  { year: 2010, sessionCode: 'R', description: '2010 Regular Session' },

  // 2009
  { year: 2009, sessionCode: 'R', description: '2009 Regular Session' },

  // 2008
  { year: 2008, sessionCode: 'R', description: '2008 Regular Session' },

  // 2007
  { year: 2007, sessionCode: 'S1', description: '2007 Extraordinary Session' },
  { year: 2007, sessionCode: 'R', description: '2007 Regular Session' },

  // 2006
  { year: 2006, sessionCode: 'R', description: '2006 Regular Session' },

  // 2005
  { year: 2005, sessionCode: 'S1', description: '2005 Extraordinary Session' },
  { year: 2005, sessionCode: 'R', description: '2005 Regular Session' },

  // 2004
  { year: 2004, sessionCode: 'R', description: '2004 Regular Session' },

  // 2003
  { year: 2003, sessionCode: 'S2', description: '2003 2nd Extraordinary Session' },
  { year: 2003, sessionCode: 'S1', description: '2003 1st Extraordinary Session' },
  { year: 2003, sessionCode: 'R', description: '2003 Regular Session' },

  // 2002
  { year: 2002, sessionCode: 'R', description: '2002 Regular Session' },

  // 2001
  { year: 2001, sessionCode: 'S1', description: '2001 Extraordinary Session' },
  { year: 2001, sessionCode: 'R', description: '2001 Regular Session' },

  // 2000
  { year: 2000, sessionCode: 'R', description: '2000 Regular Session' },
];

const program = new Command();

program
  .name('mo-bills-ingest')
  .description('Missouri Bills ingestion tools')
  .version('0.1.0');

// Scrape legislators command
program
  .command('scrape-legislators')
  .description('Scrape legislators for a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`SCRAPING LEGISLATORS: ${year} ${sessionCode}`);
    console.log('='.repeat(80));

    try {
      await runLegislatorScraper({ year, sessionCode });
      console.log('\n✅ Legislators scraping complete');
    } catch (error) {
      console.error('\n❌ Failed to scrape legislators:', error);
      process.exit(1);
    }
  });

// Scrape bills command
program
  .command('scrape-bills')
  .description('Scrape bills for a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`SCRAPING BILLS: ${year} ${sessionCode}`);
    console.log('='.repeat(80));

    try {
      await scrapeBillsForSession({ year, sessionCode });
      console.log('\n✅ Bills scraping complete');
    } catch (error) {
      console.error('\n❌ Failed to scrape bills:', error);
      process.exit(1);
    }
  });

// Generate embeddings command
program
  .command('generate-embeddings')
  .description('Generate embeddings for bills in a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--force', 'Re-generate embeddings for bills that already have them', false)
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;
    const skipEmbedded = !options.force;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`GENERATING EMBEDDINGS: ${year} ${sessionCode}`);
    console.log('='.repeat(80));
    console.log(`Skip already embedded bills: ${skipEmbedded}`);

    try {
      const db = new DatabaseClient();
      const sessionId = await db.getOrCreateSession(year, sessionCode);
      console.log(`Session ID: ${sessionId}`);

      const result = await processSession(sessionId, undefined, skipEmbedded);

      console.log('\n✅ Embeddings generation complete');
      console.log(`   Bills processed: ${result.billsProcessed}`);
      console.log(`   Embeddings created: ${result.totalEmbeddings}`);
      if (result.billsProcessed > 0) {
        const avg = result.totalEmbeddings / result.billsProcessed;
        console.log(`   Average per bill: ${avg.toFixed(1)}`);
      }
    } catch (error) {
      console.error('\n❌ Failed to generate embeddings:', error);
      process.exit(1);
    }
  });

// Scrape all sessions command
program
  .command('scrape-all')
  .description('Scrape all sessions from 2026 to 2000 (legislators + bills)')
  .option('--start-year <year>', 'Start from a specific year and work backwards', '2026')
  .action(async (options) => {
    const startYear = parseInt(options.startYear);

    // Filter sessions to start from specified year
    const sessionsToProcess = SESSIONS.filter(s => s.year <= startYear);

    console.log('='.repeat(80));
    console.log(`MISSOURI HOUSE SCRAPER - SESSIONS (${startYear}-2000)`);
    console.log('='.repeat(80));
    console.log(`\nTotal sessions to process: ${sessionsToProcess.length}`);

    const db = new DatabaseClient();

    const stats = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
      legislatorsInserted: 0,
      legislatorsUpdated: 0,
      billsInserted: 0,
      billsUpdated: 0,
    };

    for (const { year, sessionCode, description } of sessionsToProcess) {
      try {
        // Step 1: Scrape legislators
        console.log(`\n${'='.repeat(80)}`);
        console.log(`SCRAPING LEGISLATORS: ${description}`);
        console.log('='.repeat(80));

        await runLegislatorScraper({ year, sessionCode }, db);

        // Step 2: Scrape bills
        console.log(`\n${'='.repeat(80)}`);
        console.log(`SCRAPING BILLS: ${description}`);
        console.log('='.repeat(80));

        await scrapeBillsForSession({ year, sessionCode }, db);

        stats.sessionsProcessed++;
      } catch (error) {
        console.error(`\n❌ FATAL ERROR processing ${description}:`, error);
        stats.sessionsFailed++;
        continue;
      }
    }

    // Print final summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Sessions processed: ${stats.sessionsProcessed}/${sessionsToProcess.length}`);
    console.log(`Sessions failed: ${stats.sessionsFailed}`);
    console.log('='.repeat(80));
  });

// Generate all embeddings command
program
  .command('generate-all-embeddings')
  .description('Generate embeddings for all sessions from 2026 to 2000')
  .option('--start-year <year>', 'Start from a specific year and work backwards', '2026')
  .option('--force', 'Re-generate embeddings for bills that already have them', false)
  .action(async (options) => {
    const startYear = parseInt(options.startYear);
    const skipEmbedded = !options.force;

    // Filter sessions to start from specified year
    const sessionsToProcess = SESSIONS.filter(s => s.year <= startYear);

    console.log('='.repeat(80));
    console.log(`MISSOURI HOUSE EMBEDDINGS GENERATOR - SESSIONS (${startYear}-2000)`);
    console.log('='.repeat(80));
    console.log(`\nTotal sessions to process: ${sessionsToProcess.length}`);
    console.log(`Skip already embedded bills: ${skipEmbedded}`);
    console.log('\nThis will:');
    console.log('- Extract text from bill PDFs in Supabase Storage');
    console.log("- Filter to 'Introduced' + most recent version (excludes fiscal notes)");
    console.log('- Chunk using section-based or sentence-based strategies');
    console.log('- Generate embeddings via OpenAI text-embedding-3-small');
    console.log('- Store with comprehensive metadata (sponsors, committees, session info)');

    const db = new DatabaseClient();

    const stats = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
      totalBillsProcessed: 0,
      totalEmbeddingsCreated: 0,
    };

    for (const { year, sessionCode, description } of sessionsToProcess) {
      try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`GENERATING EMBEDDINGS: ${description}`);
        console.log('='.repeat(80));

        const sessionId = await db.getOrCreateSession(year, sessionCode);
        console.log(`Session ID: ${sessionId}`);

        const result = await processSession(sessionId, undefined, skipEmbedded);

        if (result.billsProcessed === 0) {
          console.log(`⚠️  No bills found for ${description}`);
          stats.sessionsFailed++;
        } else {
          console.log(`\n✅ Embeddings complete for ${description}`);
          console.log(`   Bills processed: ${result.billsProcessed}`);
          console.log(`   Embeddings created: ${result.totalEmbeddings}`);
          const avg = result.totalEmbeddings / result.billsProcessed;
          console.log(`   Average per bill: ${avg.toFixed(1)}`);

          stats.sessionsProcessed++;
          stats.totalBillsProcessed += result.billsProcessed;
          stats.totalEmbeddingsCreated += result.totalEmbeddings;
        }
      } catch (error) {
        console.error(`\n❌ FATAL ERROR processing ${description}:`, error);
        stats.sessionsFailed++;
        continue;
      }
    }

    // Print final summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Sessions processed: ${stats.sessionsProcessed}/${sessionsToProcess.length}`);
    console.log(`Sessions failed/empty: ${stats.sessionsFailed}`);
    console.log(`\nBills processed: ${stats.totalBillsProcessed}`);
    console.log(`Total embeddings created: ${stats.totalEmbeddingsCreated}`);
    if (stats.totalBillsProcessed > 0) {
      const avg = stats.totalEmbeddingsCreated / stats.totalBillsProcessed;
      console.log(`Average embeddings per bill: ${avg.toFixed(1)}`);
    }
    console.log('='.repeat(80));
  });

// Extract text from bill documents command
program
  .command('extract-text')
  .description('Extract full text from bill document PDFs for a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--force', 'Re-extract text for documents that already have it', false)
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;
    const skipExtracted = !options.force;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`EXTRACTING TEXT: ${year} ${sessionCode}`);
    console.log('='.repeat(80));
    console.log(`Skip already extracted: ${skipExtracted}\n`);

    const db = new DatabaseClient();

    try {
      const sessionId = await db.getOrCreateSession(year, sessionCode);
      console.log(`Session ID: ${sessionId}`);

      const result = await extractTextForSession(sessionId, skipExtracted);

      console.log('\n✅ Text extraction complete');
      console.log(`   Documents processed: ${result.documentsProcessed}`);
      console.log(`   Succeeded: ${result.documentsSucceeded}`);
      console.log(`   Failed: ${result.documentsFailed}`);
    } catch (error) {
      console.error('\n❌ Failed to extract text:', error);
      process.exit(1);
    }
  });

// Extract text for all sessions command
program
  .command('extract-all-text')
  .description('Extract text from all bill documents (2026-2000)')
  .option('--start-year <year>', 'Start from a specific year and work backwards', '2026')
  .option('--force', 'Re-extract text for documents that already have it', false)
  .action(async (options) => {
    const startYear = parseInt(options.startYear);
    const skipExtracted = !options.force;

    // Filter sessions to start from specified year
    const sessionsToProcess = SESSIONS.filter(s => s.year <= startYear);

    console.log('='.repeat(80));
    console.log(`TEXT EXTRACTION - SESSIONS (${startYear}-2000)`);
    console.log('='.repeat(80));
    console.log(`\nTotal sessions to process: ${sessionsToProcess.length}`);
    console.log(`Skip already extracted: ${skipExtracted}\n`);

    const db = new DatabaseClient();

    const stats = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
      totalDocumentsProcessed: 0,
      totalDocumentsSucceeded: 0,
      totalDocumentsFailed: 0,
    };

    for (const { year, sessionCode, description } of sessionsToProcess) {
      try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`EXTRACTING TEXT: ${description}`);
        console.log('='.repeat(80));

        const sessionId = await db.getOrCreateSession(year, sessionCode);
        const result = await extractTextForSession(sessionId, skipExtracted);

        stats.sessionsProcessed++;
        stats.totalDocumentsProcessed += result.documentsProcessed;
        stats.totalDocumentsSucceeded += result.documentsSucceeded;
        stats.totalDocumentsFailed += result.documentsFailed;

        console.log(`\n✓ Session complete: ${result.documentsSucceeded}/${result.documentsProcessed} succeeded`);
      } catch (error) {
        console.error(`\n❌ FATAL ERROR processing ${description}:`, error);
        stats.sessionsFailed++;
        continue;
      }
    }

    // Print final summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Sessions processed: ${stats.sessionsProcessed}/${sessionsToProcess.length}`);
    console.log(`Sessions failed: ${stats.sessionsFailed}`);
    console.log(`\nDocuments processed: ${stats.totalDocumentsProcessed}`);
    console.log(`Documents succeeded: ${stats.totalDocumentsSucceeded}`);
    console.log(`Documents failed: ${stats.totalDocumentsFailed}`);
    console.log('='.repeat(80));
  });

program.parse();
