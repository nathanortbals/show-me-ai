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
import { BillData, DocumentInfo } from '../shared/types';
import { scrapeBillList, scrapeBillDetails } from './bills';
import { scrapeHearings, parseHearingTime } from './hearings';
import { scrapeActions } from './actions';
import { scrapeCosponsors, extractDistrictFromSponsor } from './sponsors';
import { downloadBillDocuments } from '../shared/documents';
import { generateEmbeddingsForBill } from '../shared/embeddings';
import {
  MoLegislatorScraper,
  LegislatorListItem,
  LegislatorDetails,
} from './legislators';

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

    // Prepare documents data (only include documents with extracted text)
    const documentsData: DocumentData[] = [];
    if (documentInfo && documentInfo.length > 0) {
      for (const docInfo of documentInfo) {
        if (!docInfo.extracted_text) {
          console.log(`    Skipping ${docInfo.doc_id} - no extracted text`);
          continue;
        }
        documentsData.push({
          document_id: docInfo.doc_id,
          document_title: docInfo.title,
          document_type: docInfo.type,
          document_url: docInfo.url,
          extracted_text: docInfo.extracted_text,
        });
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
 * Scrape House bills for a session.
 *
 * Process:
 * 1. Scrape legislators and insert into database (unless skipLegislators is true)
 * 2. Scrape bill list
 * 3. For each bill: scrape details → download PDFs → extract text → DB → embeddings
 *
 * @param options - Scraper options (year, sessionCode, limit, pdfDir, force, bills, skipLegislators)
 * @param db - Optional database instance (creates one if not provided)
 */
export async function scrapeBillsForSession(
  options: {
    year?: number;
    sessionCode?: string;
    limit?: number;
    pdfDir?: string;
    force?: boolean;
    bills?: string[];
    skipLegislators?: boolean;
  } = {},
  db?: DatabaseClient
): Promise<void> {
  const { year, sessionCode = 'R', limit, pdfDir = 'bill_pdfs', force = false, bills: billFilter, skipLegislators = false } = options;

  const database = db || new DatabaseClient();
  const scraper = new MoHouseBillScraper(year, sessionCode, database);

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    await scraper.start();

    const sessionId = await scraper.getOrCreateSession();
    const sessionYear = year || 2026;
    console.log(`Session: ${sessionYear} ${sessionCode} (ID: ${sessionId})\n`);

    // Step 1: Scrape legislators (unless skipped)
    if (!skipLegislators) {
      const legislatorScraper = new MoLegislatorScraper(year || null, sessionCode, database);
      await legislatorScraper.start();

      console.log('Step 1: Scraping legislators...');
      const legislators = await legislatorScraper.scrapeLegislatorList();

      if (!legislators || legislators.length === 0) {
        console.log('No legislators found!');
      } else {
        console.log(`Found ${legislators.length} legislators`);
        let insertedCount = 0;
        let updatedCount = 0;

        for (let i = 0; i < legislators.length; i++) {
          const legislator = legislators[i];
          try {
            const details = await legislatorScraper.scrapeLegislatorDetails(legislator.profile_url);

            // Skip vacant districts
            if (!details.legislator_type) {
              continue;
            }

            const yearElected = details.year_elected ? parseInt(details.year_elected, 10) : undefined;
            const yearsServed = details.years_served ? parseInt(details.years_served, 10) : undefined;

            const [legislatorId, wasUpdated] = await database.upsertLegislator({
              name: details.name,
              legislator_type: details.legislator_type,
              party_affiliation: details.party_affiliation,
              year_elected: yearElected,
              years_served: yearsServed,
              picture_url: details.picture_url,
              is_active: details.is_active,
              profile_url: details.profile_url,
            });

            const district = details.district || legislator.district;
            await database.linkLegislatorToSession(sessionId, legislatorId, district);

            if (wasUpdated) {
              updatedCount++;
            } else {
              insertedCount++;
            }
          } catch (e) {
            // Silently continue on individual legislator errors
          }
        }

        console.log(`  ✓ Inserted: ${insertedCount}, Updated: ${updatedCount}`);
      }

      // Close legislator scraper browser
      await legislatorScraper.close();
    } else {
      console.log('Step 1: Skipping legislators (--skip-legislators flag set)');
    }

    // Step 2: Get bill list
    console.log('\nStep 2: Fetching bill list...');
    const page = scraper.getPage();
    let bills = await scrapeBillList(page, year, sessionCode);

    if (!bills || bills.length === 0) {
      console.log('No bills found!');
      return;
    }
    console.log(`Found ${bills.length} bills`);

    // Filter to specific bills if provided
    if (billFilter && billFilter.length > 0) {
      const billFilterSet = new Set(billFilter.map(b => b.toUpperCase().replace(/\s+/g, ' ')));
      bills = bills.filter(b => billFilterSet.has(b.bill_number.toUpperCase().replace(/\s+/g, ' ')));
      console.log(`Filtered to ${bills.length} bills matching --bills filter`);
    }

    // Step 3: Process bills
    const billsToProcess = limit ? bills.slice(0, limit) : bills;
    console.log(
      `\nStep 3: Processing ${billsToProcess.length} bills${limit ? ` (limited from ${bills.length})` : ''}...\n`
    );
    console.log('='.repeat(60));

    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];
      const billNumber = bill.bill_number;
      console.log(`\n[${i + 1}/${billsToProcess.length}] ${billNumber}`);

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
        // Scrape bill details
        const details = await scrapeBillDetails(page, billNumber, year, sessionCode);
        console.log(`  Found ${details.bill_documents?.length || 0} document(s)`);

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

        // Download PDFs and extract text
        let documentInfo: DocumentInfo[] = [];
        try {
          documentInfo = await downloadBillDocuments(billNumber, details.bill_documents || [], pdfDir);
        } catch (e) {
          console.log(`  Warning: Could not download PDFs: ${e}`);
        }

        // Merge and insert to database
        // Use title from details page, fall back to description from list page
        const merged: BillData = {
          ...bill,
          ...details,
          title: details.title || bill.description,
          cosponsors,
          actions,
          hearings,
        };

        const [billId, wasUpdated] = await scraper.insertBillToDb(merged, documentInfo);
        console.log(`  ✓ ${wasUpdated ? 'Updated' : 'Inserted'} in database`);

        // Delete existing embeddings if force flag is set (ensures idempotency)
        if (force) {
          try {
            await database.deleteEmbeddingsForBill(billId);
          } catch (e) {
            console.log(`  Warning: Could not delete existing embeddings: ${e}`);
          }
        }

        // Generate embeddings
        try {
          const embeddingsCount = await generateEmbeddingsForBill(database, billId, documentInfo);
          if (embeddingsCount > 0) {
            console.log(`  ✓ Generated ${embeddingsCount} embeddings`);
          }
        } catch (e) {
          console.log(`  Warning: Could not generate embeddings: ${e}`);
        }

        processedCount++;
      } catch (e) {
        console.log(`  ✗ Error: ${e}`);
        failedCount++;
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPLETE');
    console.log(`  ✓ Processed: ${processedCount}`);
    if (skippedCount > 0) console.log(`  ⏭️  Skipped: ${skippedCount}`);
    if (failedCount > 0) console.log(`  ✗ Failed: ${failedCount}`);
  } finally {
    await scraper.close();
  }
}
