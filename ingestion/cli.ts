#!/usr/bin/env tsx
/**
 * CLI for Show-Me AI ingestion pipeline
 *
 * Provides commands for scraping legislators and bills.
 * Text extraction and embedding generation happen inline during bill scraping.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

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
import { chromium } from 'playwright';
import { scrapeBillsForSession } from './house/scraper';
import { scrapeSenateBillsForSession } from './senate/scraper';
import { scrapeBillList } from './house/bills';
import { scrapeSendBillList } from './senate/bills';
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
  .name('show-me-ai-ingest')
  .description('Show-Me AI ingestion tools')
  .version('0.1.0');

// List House bills command (outputs JSON array of bill numbers)
program
  .command('list-house-bills')
  .description('List all bill numbers for a House session (outputs JSON)')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--output <file>', 'Output file path (writes JSON to file instead of stdout)')
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      const bills = await scrapeBillList(page, year, sessionCode);
      const billNumbers = bills.map(b => b.bill_number);
      const json = JSON.stringify(billNumbers);

      if (options.output) {
        writeFileSync(options.output, json);
        console.log(`Wrote ${billNumbers.length} bill numbers to ${options.output}`);
      } else {
        console.log(json);
      }
    } finally {
      await browser.close();
    }
  });

// Scrape House command (legislators + bills)
program
  .command('scrape-house')
  .description('Scrape House legislators and bills for a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--force', 'Re-process bills that already have extracted text', false)
  .option('--bills <bills>', 'Comma-separated list of bill numbers to process')
  .option('--skip-legislators', 'Skip legislator scraping (use when legislators already exist)', false)
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;
    const force = options.force;
    const bills = options.bills ? options.bills.split(',').map((b: string) => b.trim()) : undefined;
    const skipLegislators = options.skipLegislators;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`SCRAPING HOUSE${skipLegislators ? ' BILLS' : ' LEGISLATORS & BILLS'}: ${year} ${sessionCode}`);
    console.log('='.repeat(80));
    if (bills) {
      console.log(`Processing ${bills.length} specific bill(s): ${bills.slice(0, 5).join(', ')}${bills.length > 5 ? '...' : ''}`);
    }
    if (!force) {
      console.log('Bills with existing extracted text will be skipped (use --force to re-process).\n');
    } else {
      console.log('--force enabled: All bills will be re-processed.\n');
    }

    try {
      await scrapeBillsForSession({ year, sessionCode, force, bills, skipLegislators });
      console.log('\n✅ House scraping complete');
    } catch (error) {
      console.error('\n❌ Failed to scrape bills:', error);
      process.exit(1);
    }
  });

// List Senate bills command (outputs JSON array of bill numbers)
program
  .command('list-senate-bills')
  .description('List all bill numbers for a Senate session (outputs JSON)')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--output <file>', 'Output file path (writes JSON to file instead of stdout)')
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      const bills = await scrapeSendBillList(page, year, sessionCode);
      const billNumbers = bills.map(b => b.bill_number);
      const json = JSON.stringify(billNumbers);

      if (options.output) {
        writeFileSync(options.output, json);
        console.log(`Wrote ${billNumbers.length} bill numbers to ${options.output}`);
      } else {
        console.log(json);
      }
    } finally {
      await browser.close();
    }
  });

// Scrape Senate command (senators + bills)
program
  .command('scrape-senate')
  .description('Scrape Senate senators and bills for a session')
  .option('--year <year>', 'Session year', '2026')
  .option('--session-code <code>', 'Session code (R, S1, S2)', 'R')
  .option('--limit <limit>', 'Limit number of bills to process')
  .option('--force', 'Re-process bills that already have extracted text', false)
  .option('--bills <bills>', 'Comma-separated list of bill numbers to process')
  .option('--skip-legislators', 'Skip legislator scraping (use when legislators already exist)', false)
  .action(async (options) => {
    const year = parseInt(options.year);
    const sessionCode = options.sessionCode;
    const force = options.force;
    const limit = options.limit ? parseInt(options.limit) : undefined;
    const bills = options.bills ? options.bills.split(',').map((b: string) => b.trim()) : undefined;
    const skipLegislators = options.skipLegislators;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`SCRAPING SENATE${skipLegislators ? ' BILLS' : ''}: ${year} ${sessionCode}`);
    console.log('='.repeat(80));
    if (bills) {
      console.log(`Processing ${bills.length} specific bill(s): ${bills.slice(0, 5).join(', ')}${bills.length > 5 ? '...' : ''}`);
    }
    if (!force) {
      console.log('Bills with existing extracted text will be skipped (use --force to re-process).\n');
    } else {
      console.log('--force enabled: All bills will be re-processed.\n');
    }

    try {
      await scrapeSenateBillsForSession({ year, sessionCode, force, limit, bills, skipLegislators });
      console.log('\n✅ Senate scraping complete');
    } catch (error) {
      console.error('\n❌ Failed to scrape Senate:', error);
      process.exit(1);
    }
  });

// Scrape all House sessions command
program
  .command('scrape-house-all')
  .description('Scrape all House sessions from 2026 to 2000')
  .option('--start-year <year>', 'Start from a specific year and work backwards', '2026')
  .action(async (options) => {
    const startYear = parseInt(options.startYear);

    // Filter sessions to start from specified year
    const sessionsToProcess = SESSIONS.filter(s => s.year <= startYear);

    console.log('='.repeat(80));
    console.log(`SCRAPING ALL HOUSE SESSIONS (${startYear}-2000)`);
    console.log('='.repeat(80));
    console.log(`\nTotal sessions to process: ${sessionsToProcess.length}`);

    const db = new DatabaseClient();

    const stats = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
    };

    for (const { year, sessionCode, description } of sessionsToProcess) {
      try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`SCRAPING HOUSE: ${description}`);
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

// Scrape all Senate sessions command
program
  .command('scrape-senate-all')
  .description('Scrape all Senate sessions from 2026 to 2000')
  .option('--start-year <year>', 'Start from a specific year and work backwards', '2026')
  .action(async (options) => {
    const startYear = parseInt(options.startYear);

    // Filter sessions to start from specified year
    const sessionsToProcess = SESSIONS.filter(s => s.year <= startYear);

    console.log('='.repeat(80));
    console.log(`SCRAPING ALL SENATE SESSIONS (${startYear}-2000)`);
    console.log('='.repeat(80));
    console.log(`\nTotal sessions to process: ${sessionsToProcess.length}`);

    const db = new DatabaseClient();

    const stats = {
      sessionsProcessed: 0,
      sessionsFailed: 0,
    };

    for (const { year, sessionCode, description } of sessionsToProcess) {
      try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`SCRAPING SENATE: ${description}`);
        console.log('='.repeat(80));

        await scrapeSenateBillsForSession({ year, sessionCode }, db);

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

program.parse();
