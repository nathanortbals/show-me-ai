/**
 * Missouri Senate bill scraper.
 *
 * Orchestrates bill scraping from the official Missouri Senate website
 * and stores data in the database.
 *
 * Process:
 * 1. Get list of bills from the main bill list page
 * 2. For each bill, optionally scrape senator profile information
 * 3. Get bill details (title, LR number, effective date, committee)
 * 4. Get bill actions
 * 5. Get bill documents (PDFs)
 * 6. Download PDFs and extract text
 * 7. Store in database
 * 8. Generate embeddings
 */

import { chromium, Browser, Page } from 'playwright';
import { DatabaseClient, SponsorData, ActionData, DocumentData } from '@/database/client';
import { Database } from '@/database/types';

// Import domain modules
import { BillData, DocumentInfo } from '../shared/types';
import {
  scrapeSendBillList,
  scrapeSendBillDetails,
  SenateBillListItem,
  SenateBillDetails,
} from './bills';
import { scrapeSendBillActions } from './actions';
import { scrapeSendBillDocuments, scrapeSendBillSummaries } from './documents';
import { scrapeSenatorProfile, SenatorProfile } from './senators';
import { scrapeSenateCoSponsors } from './sponsors';
import { downloadBillDocuments } from '../shared/documents';
import { generateEmbeddingsForBill } from '../shared/embeddings';

/**
 * Enhanced bill data with senator profile information.
 */
export interface EnhancedSenateBillListItem extends SenateBillListItem {
  senator_profile?: SenatorProfile;
}

/**
 * Missouri Senate Bill Scraper
 *
 * Manages browser lifecycle, session creation, and legislator lookup caching.
 */
class MoSenateBillScraper {
  private year: number;
  private sessionCode: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db: DatabaseClient;
  private sessionLegislatorCache: Map<string, string> = new Map();
  private senatorProfileCache: Map<string, SenatorProfile> = new Map();
  private sessionId?: string;

  constructor(year: number, sessionCode: string, db: DatabaseClient) {
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

  getYear(): number {
    return this.year;
  }

  getSessionCode(): string {
    return this.sessionCode;
  }

  async getOrCreateSession(): Promise<string> {
    this.sessionId = await this.db.getOrCreateSession(this.year, this.sessionCode);
    return this.sessionId;
  }

  getSessionId(): string {
    if (!this.sessionId) {
      throw new Error('Session not initialized. Call getOrCreateSession() first');
    }
    return this.sessionId;
  }

  /**
   * Scrape senator profile with caching.
   */
  async getSenatorProfile(senatorId: string): Promise<SenatorProfile> {
    if (this.senatorProfileCache.has(senatorId)) {
      return this.senatorProfileCache.get(senatorId)!;
    }

    const profile = await scrapeSenatorProfile(this.getPage(), senatorId);
    this.senatorProfileCache.set(senatorId, profile);
    return profile;
  }

  /**
   * Get session legislator by profile URL (from sponsor URL).
   * This is the most reliable method as it directly matches the stored profile_url.
   */
  async getSessionLegislatorByProfileUrl(profileUrl: string): Promise<string | null> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    const cacheKey = `profile_url:${profileUrl}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    const sessionLegislatorId = await this.db.getSessionLegislatorByProfileUrl(this.sessionId, profileUrl);

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  /**
   * Get session legislator by name (for Senate sponsors).
   * Senate bills use legislator names, not districts.
   * Filters to only match Senators for disambiguation.
   */
  async getSessionLegislatorByName(name: string): Promise<string | null> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    const cacheKey = `name:${name}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    // Pass 'Senator' to filter only senators (avoids conflicts with House reps with same last name)
    const sessionLegislatorId = await this.db.getSessionLegislatorByName(this.sessionId, name, 'Senator');

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  /**
   * Insert or update a complete Senate bill with all related data into the database
   */
  async insertBillToDb(
    billData: BillData,
    documentInfo?: DocumentInfo[]
  ): Promise<[string, boolean]> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    // Prepare bill record
    const billRecord: Omit<Database['public']['Tables']['bills']['Insert'], 'session_id'> = {
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

    // Primary sponsor - match by sponsor_url (profile URL)
    if (billData.sponsor_url) {
      const sessionLegislatorId = await this.getSessionLegislatorByProfileUrl(billData.sponsor_url);
      if (sessionLegislatorId) {
        sponsorsData.push({
          session_legislator_id: sessionLegislatorId,
          is_primary: true,
        });
      } else {
        console.log(`  Warning: Sponsor '${billData.sponsor}' (URL: ${billData.sponsor_url}) not found in session_legislators`);
      }
    }

    // Co-sponsors
    if (billData.cosponsors) {
      const cosponsorNames = billData.cosponsors.split('; ');
      for (const cosponsorName of cosponsorNames) {
        if (cosponsorName.trim()) {
          const sessionLegislatorId = await this.getSessionLegislatorByName(cosponsorName.trim());
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
    // Note: Senate bills don't have hearings in the same format as House bills
    return await this.db.upsertBill(
      this.sessionId,
      billRecord,
      sponsorsData,
      actionsData,
      [], // hearingsData - not scraped for Senate bills currently
      documentsData
    );
  }
}

/**
 * Scrape Senate bills for a session.
 *
 * Processes each bill sequentially: scrape → download PDFs → extract text → DB → embeddings.
 *
 * @param options - Scraper options (year, sessionCode, limit, pdfDir, force, bills, skipLegislators)
 * @param db - Optional database instance (creates one if not provided)
 */
export async function scrapeSenateBillsForSession(
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
  const {
    year = 2026,
    sessionCode = 'R',
    limit,
    pdfDir = 'bill_pdfs',
    force = false,
    bills: billFilter,
    skipLegislators = false,
  } = options;

  const database = db || new DatabaseClient();
  const scraper = new MoSenateBillScraper(year, sessionCode, database);

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    await scraper.start();

    const sessionId = await scraper.getOrCreateSession();
    console.log(`Session: ${year} ${sessionCode} (ID: ${sessionId})\n`);

    const page = scraper.getPage();

    // Step 1: Get list of bills from the main screen
    console.log('Step 1: Fetching bill list...');
    const bills = await scrapeSendBillList(page, year, sessionCode);

    if (!bills || bills.length === 0) {
      console.log('No Senate bills found!');
      return;
    }

    console.log(`Found ${bills.length} bills`);

    // Filter to specific bills if provided
    let filteredBills = bills;
    if (billFilter && billFilter.length > 0) {
      const billFilterSet = new Set(billFilter.map(b => b.toUpperCase().replace(/\s+/g, ' ')));
      filteredBills = bills.filter(b => billFilterSet.has(b.bill_number.toUpperCase().replace(/\s+/g, ' ')));
      console.log(`Filtered to ${filteredBills.length} bills matching --bills filter`);
    }

    // Step 2: Scrape and insert senator profiles (unless skipped)
    let enhancedBills: EnhancedSenateBillListItem[] = filteredBills;

    if (!skipLegislators) {
      console.log('\nStep 2: Fetching senator profiles...');

      // Get unique senator IDs from filtered bills
      const uniqueSenatorIds = [...new Set(filteredBills.map((b) => b.senator_id).filter(Boolean))];
      console.log(`Found ${uniqueSenatorIds.length} unique senators to scrape`);

      const senatorProfiles = new Map<string, SenatorProfile>();

      for (let i = 0; i < uniqueSenatorIds.length; i++) {
        const senatorId = uniqueSenatorIds[i]!;
        let retries = 3;
        while (retries > 0) {
          try {
            console.log(`  [${i + 1}/${uniqueSenatorIds.length}] Scraping senator ${senatorId}...`);
            const profile = await scraper.getSenatorProfile(senatorId);
            senatorProfiles.set(senatorId, profile);
            console.log(`    ${profile.name} (District ${profile.district})`);
            break; // Success, exit retry loop
          } catch (e) {
            retries--;
            if (retries > 0) {
              console.log(`    Retry (${3 - retries}/3) after error: ${e}`);
              await new Promise((r) => setTimeout(r, 2000)); // Wait 2s before retry
            } else {
              console.log(`    Failed after 3 attempts: ${e}`);
            }
          }
        }
      }

      // Insert senators into database
      console.log('\n  Inserting senators into database...');
      let insertedCount = 0;
      let updatedCount = 0;

      for (const profile of senatorProfiles.values()) {
        try {
          // Upsert legislator to database
          const [legislatorId, wasUpdated] = await database.upsertLegislator({
            name: profile.name,
            legislator_type: 'Senator',
            party_affiliation: profile.party || null,
            year_elected: profile.year_elected || null,
            picture_url: profile.photo_url || null,
            is_active: true,
            profile_url: profile.profile_url,
          });

          // Link to session
          await database.linkLegislatorToSession(sessionId, legislatorId, profile.district);

          if (wasUpdated) {
            updatedCount++;
          } else {
            insertedCount++;
          }
        } catch (e) {
          console.log(`    Warning: Failed to insert senator ${profile.name}: ${e}`);
        }
      }

      console.log(`  ✓ Inserted: ${insertedCount}, Updated: ${updatedCount}`);

      // Enhance bills with senator profiles
      enhancedBills = filteredBills.map((bill) => ({
        ...bill,
        senator_profile: bill.senator_id ? senatorProfiles.get(bill.senator_id) : undefined,
      }));
    } else {
      console.log('\nStep 2: Skipping legislators (--skip-legislators flag set)');
    }

    // Step 3+: Process bills
    const billsToProcess = limit ? enhancedBills.slice(0, limit) : enhancedBills;
    console.log(
      `\nStep 3: Processing ${billsToProcess.length} Senate bills${limit ? ` (limited from ${bills.length})` : ''}...\n`
    );
    console.log('='.repeat(60));

    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];
      const billNumber = bill.bill_number;
      const billId = bill.bill_id;
      console.log(`\n[${i + 1}/${billsToProcess.length}] ${billNumber}`);

      // Check if bill already has extracted text (skip unless forced)
      if (!force) {
        const existingBillId = await database.getBillIdByNumber(billNumber, sessionId);
        if (existingBillId) {
          const hasExtractedText = await database.billHasExtractedText(existingBillId);
          if (hasExtractedText) {
            console.log(`  Skipping - already has extracted text`);
            skippedCount++;
            continue;
          }
        }
      }

      try {
        // Scrape bill details
        const details: SenateBillDetails = await scrapeSendBillDetails(page, billId, year, sessionCode);
        console.log(`  Title: ${details.title?.substring(0, 50)}...`);
        if (details.committee_name) {
          console.log(`  Committee: ${details.committee_name}`);
        }
        if (details.bill_summary) {
          console.log(`  Summary: ${details.bill_summary.substring(0, 60)}...`);
        }

        // Scrape bill documents (PDFs)
        const billDocs = await scrapeSendBillDocuments(page, billId, billNumber, year, sessionCode);
        console.log(`  Found ${billDocs.length} bill text document(s)`);

        // Scrape bill summaries
        const summaryDocs = await scrapeSendBillSummaries(
          page,
          billId,
          billNumber,
          year,
          sessionCode
        );
        if (summaryDocs.length > 0) {
          console.log(`  Found ${summaryDocs.length} summary document(s)`);
        }

        // Combine all documents
        const allDocs = [...billDocs, ...summaryDocs];

        // Scrape bill actions
        let actions = '';
        try {
          actions = await scrapeSendBillActions(page, billId, year, sessionCode);
        } catch (e) {
          console.log(`  Warning: Could not scrape actions: ${e}`);
        }

        // Scrape co-sponsors
        let cosponsors = '';
        try {
          cosponsors = await scrapeSenateCoSponsors(page, billId, year, sessionCode);
          if (cosponsors) {
            const count = cosponsors.split('; ').length;
            console.log(`  Found ${count} co-sponsor(s)`);
          }
        } catch (e) {
          console.log(`  Warning: Could not scrape co-sponsors: ${e}`);
        }

        // Download PDFs and extract text
        let documentInfo: DocumentInfo[] = [];
        try {
          documentInfo = await downloadBillDocuments(billNumber, allDocs, pdfDir);
        } catch (e) {
          console.log(`  Warning: Could not download PDFs: ${e}`);
        }

        // Merge and insert to database
        // Use title from details page, fall back to description from list page
        const merged: BillData = {
          bill_number: billNumber,
          bill_url: bill.bill_url,
          sponsor: bill.sponsor || details.sponsor,
          sponsor_url: bill.sponsor_url || details.sponsor_url,
          title: details.title || bill.description,
          lr_number: details.lr_number,
          last_action: details.last_action,
          proposed_effective_date: details.proposed_effective_date,
          actions,
          cosponsors,
        };

        const [dbBillId, wasUpdated] = await scraper.insertBillToDb(merged, documentInfo);
        console.log(`  ${wasUpdated ? 'Updated' : 'Inserted'} in database`);

        // Delete existing embeddings if force flag is set (ensures idempotency)
        if (force) {
          try {
            await database.deleteEmbeddingsForBill(dbBillId);
          } catch (e) {
            console.log(`  Warning: Could not delete existing embeddings: ${e}`);
          }
        }

        // Generate embeddings
        try {
          const embeddingsCount = await generateEmbeddingsForBill(database, dbBillId, documentInfo);
          if (embeddingsCount > 0) {
            console.log(`  Generated ${embeddingsCount} embeddings`);
          }
        } catch (e) {
          console.log(`  Warning: Could not generate embeddings: ${e}`);
        }

        processedCount++;
      } catch (e) {
        console.log(`  Error: ${e}`);
        failedCount++;
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPLETE');
    console.log(`  Processed: ${processedCount}`);
    if (skippedCount > 0) console.log(`  Skipped: ${skippedCount}`);
    if (failedCount > 0) console.log(`  Failed: ${failedCount}`);
  } finally {
    await scraper.close();
  }
}
