/**
 * Missouri House of Representatives bill scraper.
 *
 * Orchestrates bill scraping from the official Missouri House website
 * and stores data in the database.
 */

import { chromium, Browser, Page } from 'playwright';
import {
  DatabaseClient,
  SponsorData,
  ActionData,
  HearingData,
  DocumentData,
} from '@/database/client';
import { Database } from '@/database/types';

// Import domain modules
import { BillData, DocumentInfo } from './types';
import { scrapeBillList, scrapeBillDetails } from './bills';
import { scrapeHearings, parseHearingTime } from './hearings';
import { scrapeActions } from './actions';
import { scrapeCosponsors, extractDistrictFromSponsor } from './sponsors';
import { downloadBillDocuments } from './documents';
import { generateEmbeddingsForBill } from './embeddings';

/**
 * Missouri House Bill Scraper
 *
 * Manages browser lifecycle, session creation, and legislator lookup caching.
 * Provides insertBillToDb for database operations that require state.
 */
class MoHouseBillScraper {
  private year?: number;
  private sessionCode: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db: DatabaseClient;
  private sessionLegislatorCache: Map<string, string> = new Map();
  private sessionId?: string;

  constructor(year: number | undefined, sessionCode: string, db: DatabaseClient) {
    this.year = year;
    this.sessionCode = sessionCode;
    this.db = db;
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first');
    }
    return this.page;
  }

  getYear(): number | undefined {
    return this.year;
  }

  getSessionCode(): string {
    return this.sessionCode;
  }

  async getOrCreateSession(): Promise<string> {
    const year = this.year || 2026;
    this.sessionId = await this.db.getOrCreateSession(year, this.sessionCode);
    return this.sessionId;
  }

  getSessionId(): string {
    if (!this.sessionId) {
      throw new Error('Session not initialized. Call getOrCreateSession() first');
    }
    return this.sessionId;
  }

  async getSessionLegislatorByDistrict(district: string): Promise<string | null> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    const cacheKey = `district:${district}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    const sessionLegislatorId = await this.db.getSessionLegislatorByDistrict(
      this.sessionId,
      district
    );

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  async getSessionLegislatorByName(name: string): Promise<string | null> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    const cacheKey = `name:${name}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    const sessionLegislatorId = await this.db.getSessionLegislatorByName(this.sessionId, name);

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  /**
   * Insert or update a complete bill with all related data into the database
   */
  async insertBillToDb(
    billData: BillData,
    documentInfo?: DocumentInfo[]
  ): Promise<[string, boolean]> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    // Prepare bill record
    const billRecord: Omit<
      Database['public']['Tables']['bills']['Insert'],
      'session_id'
    > = {
      bill_number: billData.bill_number,
      title: billData.title,
      description: billData.description,
      lr_number: billData.lr_number,
      bill_string: billData.bill_string,
      last_action: billData.last_action,
      proposed_effective_date: billData.proposed_effective_date,
      calendar_status: billData.calendar_status,
      hearing_status: billData.hearing_status,
      bill_url: billData.bill_url,
    };

    // Prepare sponsors data
    const sponsorsData: SponsorData[] = [];

    // Primary sponsor
    if (billData.sponsor) {
      const district = extractDistrictFromSponsor(billData.sponsor);
      if (district) {
        const sessionLegislatorId = await this.getSessionLegislatorByDistrict(district);
        if (sessionLegislatorId) {
          sponsorsData.push({
            session_legislator_id: sessionLegislatorId,
            is_primary: true,
          });
        } else {
          console.log(
            `  Warning: Primary sponsor from district '${district}' not found in session_legislators`
          );
        }
      } else {
        console.log(
          `  Warning: Could not extract district from primary sponsor: '${billData.sponsor}'`
        );
      }
    }

    // Co-sponsors
    if (billData.cosponsors) {
      const cosponsorsNames = billData.cosponsors.split('; ');
      for (const cosponsorName of cosponsorsNames) {
        if (cosponsorName.trim()) {
          const sessionLegislatorId = await this.getSessionLegislatorByName(
            cosponsorName.trim()
          );
          if (sessionLegislatorId) {
            sponsorsData.push({
              session_legislator_id: sessionLegislatorId,
              is_primary: false,
            });
          } else {
            console.log(`  Warning: Co-sponsor '${cosponsorName}' not found in session_legislators`);
          }
        }
      }
    }

    // Prepare actions data
    const actionsData: ActionData[] = [];
    if (billData.actions) {
      const actions = billData.actions.split(' || ');
      for (let i = 0; i < actions.length; i++) {
        const parts = actions[i].split(' | ');
        if (parts.length === 2) {
          actionsData.push({
            action_date: parts[0].trim(),
            description: parts[1].trim(),
            sequence_order: i,
          });
        }
      }
    }

    // Prepare hearings data
    const hearingsData: HearingData[] = [];
    if (billData.hearings) {
      const hearings = billData.hearings.split(' || ');
      for (const hearingStr of hearings) {
        const parts = hearingStr.split(' | ');
        if (parts.length === 4) {
          const timeText = parts[2].trim();
          hearingsData.push({
            committee_name: parts[0].trim(),
            hearing_date: parts[1].trim() || undefined,
            hearing_time: parseHearingTime(timeText) || undefined,
            hearing_time_text: timeText || undefined,
            location: parts[3].trim(),
          });
        }
      }
    }

    // Prepare documents data
    const documentsData: DocumentData[] = [];
    if (documentInfo) {
      for (const docInfo of documentInfo) {
        documentsData.push({
          document_type: docInfo.type,
          document_url: docInfo.url,
          storage_path: docInfo.storage_path || undefined,
          extracted_text: docInfo.extracted_text || undefined,
        });
      }
    } else if (billData.bill_documents) {
      const documents = billData.bill_documents.split(' || ');
      for (const docStr of documents) {
        const parts = docStr.split(' | ');
        if (parts.length === 2) {
          documentsData.push({
            document_type: parts[0].trim(),
            document_url: parts[1].trim(),
            storage_path: undefined,
            extracted_text: undefined,
          });
        }
      }
    }

    // Call database method to insert/update bill
    return await this.db.upsertBill(
      this.sessionId,
      billRecord,
      sponsorsData,
      actionsData,
      hearingsData,
      documentsData
    );
  }
}

/**
 * Scraped bill data ready for processing.
 */
interface ScrapedBill {
  bill: BillData;
  details: BillData;
  cosponsors: string;
  actions: string;
  hearings: string;
}

/**
 * Process a single bill: download PDFs, insert to DB, generate embeddings.
 * This is the parallelizable part of bill processing.
 */
async function processBill(
  scraper: MoHouseBillScraper,
  database: DatabaseClient,
  scrapedBill: ScrapedBill,
  pdfDir: string,
  index: number,
  total: number
): Promise<{ success: boolean; billNumber: string }> {
  const { bill, details, cosponsors, actions, hearings } = scrapedBill;
  const billNumber = bill.bill_number;

  console.log(`[${index}/${total}] Processing ${billNumber}...`);

  try {
    // Download PDFs and extract text
    let documentInfo: DocumentInfo[] = [];
    try {
      documentInfo = await downloadBillDocuments(billNumber, details.bill_documents || '', pdfDir);
    } catch (e) {
      console.log(`  Warning: Could not download PDFs for ${billNumber}: ${e}`);
    }

    // Merge basic info with detailed info
    const merged: BillData = {
      ...bill,
      ...details,
      cosponsors,
      actions,
      hearings,
    };

    // Insert to database
    const [billId, wasUpdated] = await scraper.insertBillToDb(merged, documentInfo);
    if (wasUpdated) {
      console.log(`  ✓ ${billNumber}: Updated in database`);
    } else {
      console.log(`  ✓ ${billNumber}: Inserted to database`);
    }

    // Generate embeddings
    try {
      const embeddingsCount = await generateEmbeddingsForBill(database, billId, documentInfo);
      if (embeddingsCount > 0) {
        console.log(`  ✓ ${billNumber}: Generated ${embeddingsCount} embeddings`);
      }
    } catch (e) {
      console.log(`  Warning: Could not generate embeddings for ${billNumber}: ${e}`);
    }

    return { success: true, billNumber };
  } catch (e) {
    console.log(`  Error processing ${billNumber}: ${e}`);
    return { success: false, billNumber };
  }
}

/** Number of bills to process in parallel during phase 2 */
const CONCURRENCY = 5;

/**
 * Scrape bills for a session.
 *
 * Main entry point for bill scraping. Uses a two-phase approach:
 * 1. Scrape all bill metadata sequentially (browser limitation)
 * 2. Process bills in parallel batches (PDF download + DB + embeddings)
 *
 * @param options - Scraper options (year, sessionCode, limit, pdfDir, force)
 * @param db - Optional database instance (creates one if not provided)
 */
export async function scrapeBillsForSession(
  options: {
    year?: number;
    sessionCode?: string;
    limit?: number;
    pdfDir?: string;
    force?: boolean;
  } = {},
  db?: DatabaseClient
): Promise<void> {
  const { year, sessionCode = 'R', limit, pdfDir = 'bill_pdfs', force = false } = options;

  const database = db || new DatabaseClient();
  const scraper = new MoHouseBillScraper(year, sessionCode, database);

  try {
    await scraper.start();

    const sessionId = await scraper.getOrCreateSession();
    const sessionYear = year || 2026;
    console.log(`Using session: ${sessionYear} ${sessionCode} (ID: ${sessionId})`);
    console.log(`Concurrency: ${CONCURRENCY} bills in parallel\n`);

    const page = scraper.getPage();
    const bills = await scrapeBillList(page, year, sessionCode);

    if (!bills || bills.length === 0) {
      console.log('No bills found!');
      return;
    }

    const billsToProcess = limit ? bills.slice(0, limit) : bills;
    if (limit) {
      console.log(`Limited to first ${limit} bills`);
    }

    // ========================================
    // PHASE 1: Scrape metadata (sequential)
    // ========================================
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PHASE 1: Scraping metadata for ${billsToProcess.length} bills...`);
    console.log('='.repeat(60));

    const scrapedBills: ScrapedBill[] = [];
    let skippedCount = 0;

    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];
      const billNumber = bill.bill_number;
      console.log(`[${i + 1}/${billsToProcess.length}] Scraping ${billNumber}...`);

      // Check if bill already has extracted text (skip unless forced)
      if (!force) {
        const existingBillId = await database.getBillIdByNumber(billNumber, sessionId);
        if (existingBillId) {
          const hasExtractedText = await database.billHasExtractedText(existingBillId);
          if (hasExtractedText) {
            console.log(`  ⏭️  Skipping - already has extracted text`);
            skippedCount++;
            continue;
          }
        }
      }

      try {
        const details = await scrapeBillDetails(page, billNumber, year, sessionCode);

        // Scrape co-sponsors
        let cosponsors = '';
        try {
          cosponsors = await scrapeCosponsors(page, billNumber, year, sessionCode);
        } catch (e) {
          console.log(`  Warning: Could not scrape co-sponsors: ${e}`);
        }

        // Scrape bill actions
        let actions = '';
        try {
          actions = await scrapeActions(page, billNumber, year, sessionCode);
        } catch (e) {
          console.log(`  Warning: Could not scrape actions: ${e}`);
        }

        // Scrape bill hearings
        let hearings = '';
        try {
          hearings = await scrapeHearings(page, billNumber, year, sessionCode);
        } catch (e) {
          console.log(`  Warning: Could not scrape hearings: ${e}`);
        }

        scrapedBills.push({ bill, details, cosponsors, actions, hearings });
      } catch (e) {
        console.log(`  Error scraping ${billNumber}: ${e}`);
      }
    }

    console.log(`\n✓ Phase 1 complete: ${scrapedBills.length} bills scraped`);
    if (skippedCount > 0) {
      console.log(`  (${skippedCount} skipped - already had extracted text)`);
    }

    // Close browser - no longer needed
    await scraper.close();

    if (scrapedBills.length === 0) {
      console.log('\nNo bills to process.');
      return;
    }

    // ========================================
    // PHASE 2: Process bills (parallel)
    // ========================================
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PHASE 2: Processing ${scrapedBills.length} bills (${CONCURRENCY} concurrent)...`);
    console.log('='.repeat(60));

    let processedCount = 0;
    let failedCount = 0;

    // Process in batches for controlled parallelism
    for (let i = 0; i < scrapedBills.length; i += CONCURRENCY) {
      const batch = scrapedBills.slice(i, i + CONCURRENCY);
      const batchStart = i + 1;
      const batchEnd = Math.min(i + CONCURRENCY, scrapedBills.length);

      console.log(`\n--- Batch ${Math.floor(i / CONCURRENCY) + 1}: Bills ${batchStart}-${batchEnd} ---`);

      const results = await Promise.all(
        batch.map((scrapedBill, batchIndex) =>
          processBill(
            scraper,
            database,
            scrapedBill,
            pdfDir,
            i + batchIndex + 1,
            scrapedBills.length
          )
        )
      );

      for (const result of results) {
        if (result.success) {
          processedCount++;
        } else {
          failedCount++;
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPLETE');
    console.log('='.repeat(60));
    console.log(`✓ Successfully processed: ${processedCount} bills`);
    if (failedCount > 0) {
      console.log(`✗ Failed: ${failedCount} bills`);
    }
    if (skippedCount > 0) {
      console.log(`⏭️  Skipped: ${skippedCount} bills (already had extracted text)`);
    }
  } finally {
    await scraper.close();
  }
}
