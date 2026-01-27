/**
 * Missouri House of Representatives bill scraper.
 *
 * Scrapes bills from the official Missouri House website and stores them in the database.
 */

import { chromium, Browser, Page } from 'playwright';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import {
  DatabaseClient,
  SponsorData,
  ActionData,
  HearingData,
  DocumentData,
} from '@/database/client';
import { Database } from '@/database/types';

/**
 * Bill list item from the bill list page
 */
export interface BillListItem {
  bill_number: string;
  bill_url: string;
  sponsor: string;
  sponsor_url: string;
  description: string;
}

/**
 * Detailed bill information from the bill detail page
 */
export interface BillDetails {
  bill_number: string;
  title: string;
  sponsor: string;
  sponsor_url: string;
  lr_number: string;
  last_action: string;
  last_action_date: string;
  proposed_effective_date: string;
  bill_string: string;
  calendar_status: string;
  hearing_status: string;
  bill_documents: string;
}

/**
 * Document information including storage path
 */
export interface DocumentInfo {
  type: string;
  url: string;
  local_path: string;
  storage_path: string | null;
}

/**
 * Bill data for database insertion
 */
export interface BillData {
  bill_number: string;
  title?: string;
  description?: string;
  lr_number?: string;
  sponsor?: string;
  sponsor_url?: string;
  bill_string?: string;
  last_action?: string;
  proposed_effective_date?: string;
  calendar_status?: string;
  hearing_status?: string;
  bill_url?: string;
  bill_documents?: string;
  cosponsors?: string;
  actions?: string;
  hearings?: string;
}

/**
 * Scraper options
 */
export interface ScraperOptions {
  year?: number;
  sessionCode?: string;
  db?: DatabaseClient;
}

/**
 * Missouri House Bill Scraper
 */
export class MoHouseBillScraper {
  private static readonly BASE_URL = 'https://house.mo.gov/billlist.aspx';
  private static readonly ARCHIVE_URL_TEMPLATE =
    'https://archive.house.mo.gov/billlist.aspx?year={year}&code={code}';

  private year?: number;
  private sessionCode: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db?: DatabaseClient;
  private sessionLegislatorCache: Map<string, string> = new Map();
  private sessionId?: string;
  private storageBucket = 'bill-pdfs';

  constructor(options: ScraperOptions = {}) {
    this.year = options.year;
    this.sessionCode = options.sessionCode || 'R';
    this.db = options.db;
  }

  /**
   * Start the browser and create a new page
   */
  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Parse hearing time from text string.
   *
   * Extracts time patterns like "4:30 PM" and converts to 24-hour format.
   * Returns null for strings like "Upon Adjournment" or "TBA".
   *
   * @param timeStr - Raw hearing time string
   * @returns Time in HH:MM:SS format, or null if no parseable time found
   */
  private static parseHearingTime(timeStr: string): string | null {
    if (!timeStr) {
      return null;
    }

    // Try to find time patterns like "4:30 PM", "2:00 PM", etc.
    const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/;
    const match = timeStr.match(timePattern);

    if (match) {
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const period = match[3].toUpperCase();

      // Convert to 24-hour format
      if (period === 'PM' && hour !== 12) {
        hour += 12;
      } else if (period === 'AM' && hour === 12) {
        hour = 0;
      }

      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    }

    // No valid time found
    return null;
  }

  /**
   * Get the appropriate URL based on year
   */
  private getUrl(): string {
    if (this.year) {
      return MoHouseBillScraper.ARCHIVE_URL_TEMPLATE.replace('{year}', this.year.toString()).replace(
        '{code}',
        this.sessionCode
      );
    }
    return MoHouseBillScraper.BASE_URL;
  }

  /**
   * Get the bill detail URL for a specific bill
   */
  private getBillDetailUrl(billNumber: string): string {
    if (this.year) {
      return `https://archive.house.mo.gov/BillContent.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}&style=new`;
    }
    return `https://house.mo.gov/BillContent.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}&style=new`;
  }

  /**
   * Get the co-sponsors URL for a specific bill
   */
  private getCosponsorsUrl(billNumber: string): string {
    if (this.year) {
      return `https://archive.house.mo.gov/CoSponsors.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
    }
    return `https://house.mo.gov/CoSponsors.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
  }

  /**
   * Get the bill actions URL for a specific bill
   */
  private getBillActionsUrl(billNumber: string): string {
    if (this.year) {
      return `https://archive.house.mo.gov/BillActions.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
    }
    return `https://house.mo.gov/BillActions.aspx?bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
  }

  /**
   * Get the bill hearings URL for a specific bill
   */
  private getBillHearingsUrl(billNumber: string): string {
    if (this.year) {
      return `https://archive.house.mo.gov/BillHearings.aspx?Bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
    }
    return `https://house.mo.gov/BillHearings.aspx?Bill=${billNumber}&year=${this.year}&code=${this.sessionCode}`;
  }

  /**
   * Extract district number from sponsor text like "LastName, FirstName (151)"
   */
  private extractDistrictFromSponsor(sponsorText: string): string | null {
    const match = sponsorText.match(/\((\d+)\)$/);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Get or create the session record for this scraper's year/session_code
   */
  async getOrCreateSession(): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const year = this.year || 2026; // Default to current year if not specified
    return await this.db.getOrCreateSession(year, this.sessionCode);
  }

  /**
   * Look up a session_legislator in the database by district for the current session
   */
  async getSessionLegislatorByDistrict(district: string): Promise<string | null> {
    if (!this.db || !this.sessionId) {
      throw new Error('Database or session not initialized');
    }

    // Check cache first
    const cacheKey = `district:${district}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    // Use Database method
    const sessionLegislatorId = await this.db.getSessionLegislatorByDistrict(
      this.sessionId,
      district
    );

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  /**
   * Look up a session_legislator in the database by legislator name for the current session
   */
  async getSessionLegislatorByName(name: string): Promise<string | null> {
    if (!this.db || !this.sessionId) {
      throw new Error('Database or session not initialized');
    }

    // Check cache first
    const cacheKey = `name:${name}`;
    if (this.sessionLegislatorCache.has(cacheKey)) {
      return this.sessionLegislatorCache.get(cacheKey)!;
    }

    // Use Database method
    const sessionLegislatorId = await this.db.getSessionLegislatorByName(this.sessionId, name);

    if (sessionLegislatorId) {
      this.sessionLegislatorCache.set(cacheKey, sessionLegislatorId);
    }

    return sessionLegislatorId;
  }

  /**
   * Scrape all bills from the Missouri House website
   */
  async scrapeBills(): Promise<BillListItem[]> {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first');
    }

    const url = this.getUrl();
    console.log(`Navigating to ${url}...`);

    // Navigate to the page
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Wait for the table to load
    await this.page.waitForSelector('table', { timeout: 10000 });

    console.log('Extracting bill data...');

    // Extract bill data using JavaScript
    const bills = await this.page.evaluate(() => {
      const bills: BillListItem[] = [];
      const tables = Array.from(document.querySelectorAll('table'));
      const billTable = tables.find(
        (t) => t.innerText.includes('HB') || t.innerText.includes('SB')
      );

      if (!billTable) {
        return [];
      }

      const rows = Array.from(billTable.querySelectorAll('tr'));
      let currentBill: BillListItem | null = null;

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
            const billNumber = billLink.textContent?.trim() || '';
            const billUrl = (billLink as HTMLAnchorElement).href;

            // Extract sponsor
            const sponsorCell = cells[1];
            const sponsorLink = sponsorCell.querySelector('a');
            const sponsor = sponsorLink
              ? sponsorLink.textContent?.trim() || ''
              : sponsorCell.textContent?.trim() || '';
            const sponsorUrl = sponsorLink ? (sponsorLink as HTMLAnchorElement).href : '';

            currentBill = {
              bill_number: billNumber,
              bill_url: billUrl,
              sponsor: sponsor,
              sponsor_url: sponsorUrl,
              description: '',
            };

            bills.push(currentBill);
          }
        }
        // Check if this is a description row (typically has 2 cells)
        else if (cells.length === 2 && currentBill) {
          const descriptionCell = cells[1];
          currentBill.description = descriptionCell.textContent?.trim() || '';
        }
      }

      return bills;
    });

    console.log(`Found ${bills.length} bills`);
    return bills as BillListItem[];
  }

  /**
   * Scrape detailed information for a specific bill
   */
  async scrapeBillDetails(billNumber: string): Promise<BillDetails> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    const url = this.getBillDetailUrl(billNumber);
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Extract detailed information
    const details = await this.page.evaluate(() => {
      const details: BillDetails = {
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
        bill_documents: '',
      };

      // Extract bill number from h1
      const h1 = document.querySelector('h1');
      if (h1) {
        details.bill_number = h1.textContent?.trim() || '';
      }

      // Extract title from main div
      const mainDiv = document.querySelector('main > div');
      if (mainDiv) {
        const fullText = mainDiv.textContent || '';
        const lines = fullText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
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

      // Extract sponsor
      const sponsorLink = document.querySelector('a[href*="MemberDetails"]');
      if (sponsorLink) {
        details.sponsor = sponsorLink.textContent?.trim() || '';
        details.sponsor_url = (sponsorLink as HTMLAnchorElement).href;
      }

      // Extract various labeled fields by searching for label text
      const allElements = Array.from(document.querySelectorAll('main *'));
      const labels = {
        'Proposed Effective Date:': 'proposed_effective_date',
        'LR Number:': 'lr_number',
        'Last Action:': 'last_action',
        'Bill String:': 'bill_string',
        'Next House Hearing:': 'hearing_status',
        'Calendar:': 'calendar_status'
      };

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const text = el.textContent?.trim() || '';
        if (text in labels) {
          const nextEl = allElements[i + 1];
          if (nextEl) {
            const fieldName = labels[text as keyof typeof labels] as keyof BillDetails;
            details[fieldName] = nextEl.textContent?.trim() || '';
          }
        }
      }

      // Extract bill documents
      const billDocuments = document.getElementById('BillDocuments');
      const documentStrings: string[] = [];
      if (billDocuments) {
        const docLinks = Array.from(billDocuments.querySelectorAll('a[href*=".pdf"]'));
        for (let i = 0; i < docLinks.length; i++) {
          const link = docLinks[i];
          const docType = link.textContent?.trim() || '';
          const docUrl = (link as HTMLAnchorElement).href;
          if (
            docType &&
            docUrl &&
            docType.indexOf('Roll Call') === -1 &&
            docType.indexOf('Witnesses') === -1
          ) {
            documentStrings.push(docType + ' | ' + docUrl);
          }
        }
      }
      details.bill_documents = documentStrings.join(' || ');

      return details;
    });

    return details as BillDetails;
  }

  /**
   * Scrape co-sponsors for a specific bill
   */
  async scrapeCosponsors(billNumber: string): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    const url = this.getCosponsorsUrl(billNumber);
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Extract co-sponsor names only (district column is not reliable)
    const cosponsors = await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const cosponsorNames: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td'));
        if (cells.length >= 4) {
          const name = cells[0].textContent?.trim() || '';
          if (name && name !== 'Member') {
            cosponsorNames.push(name);
          }
        }
      }

      return cosponsorNames.join('; ');
    });

    return cosponsors;
  }

  /**
   * Scrape bill actions for a specific bill
   */
  async scrapeBillActions(billNumber: string): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    const url = this.getBillActionsUrl(billNumber);
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Extract bill actions
    const actions = await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const actionStrings: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td'));
        if (cells.length >= 3) {
          const date = cells[0].textContent?.trim() || '';
          const description = cells[2].textContent?.trim() || '';

          if (date && description && date !== 'Date') {
            actionStrings.push(date + ' | ' + description);
          }
        }
      }

      return actionStrings.join(' || ');
    });

    return actions;
  }

  /**
   * Scrape bill hearings for a specific bill
   */
  async scrapeBillHearings(billNumber: string): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    const url = this.getBillHearingsUrl(billNumber);
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Extract bill hearings
    const hearings = await this.page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return '';

      const rows = Array.from(table.querySelectorAll('tr'));
      const hearingStrings: string[] = [];

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
            hearingStrings.push(
              currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation
            );
          }

          const committeeLink = cells[0].querySelector('a');
          currentCommittee = committeeLink
            ? committeeLink.textContent?.trim() || ''
            : cells[0].textContent?.trim() || '';
          currentDate = '';
          currentTime = '';
          currentLocation = '';
        } else if (cells.length === 2) {
          const label = cells[0].textContent?.trim() || '';
          const value = cells[1].textContent?.trim() || '';

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
        hearingStrings.push(
          currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation
        );
      }

      return hearingStrings.join(' || ');
    });

    return hearings;
  }

  /**
   * Download bill document PDFs and upload to Supabase Storage
   */
  async downloadBillDocuments(
    billNumber: string,
    documentsString: string,
    outputDir: string
  ): Promise<DocumentInfo[]> {
    if (!documentsString) {
      return [];
    }

    // Parse the documents string
    const documentPairs = documentsString.split(' || ');
    const documentInfo: DocumentInfo[] = [];

    // Create output directory for this bill
    const billDir = path.join(outputDir, billNumber);
    await fs.mkdir(billDir, { recursive: true });

    for (const pair of documentPairs) {
      const parts = pair.split(' | ');
      if (parts.length !== 2) {
        continue;
      }

      const docType = parts[0].trim();
      const docUrl = parts[1].trim();

      // Create safe filename
      const safeDocType = docType.replace(/ /g, '_').replace(/\//g, '_');
      const filename = `${billNumber}_${safeDocType}.pdf`;
      const filepath = path.join(billDir, filename);

      try {
        console.log(`    Downloading ${docType}...`);
        const response = await axios.get(docUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        // Save PDF locally
        const pdfContent = Buffer.from(response.data);
        await fs.writeFile(filepath, pdfContent);
        console.log(`    Saved locally to ${filepath}`);

        // Upload to Supabase Storage
        let storagePath: string | null = null;
        if (this.db && this.sessionId) {
          // Create storage path: {year}/{session_code}/{bill_number}/{filename}
          const storagePathTemplate = `${this.year}/${this.sessionCode}/${billNumber}/${filename}`;
          storagePath = await this.db.uploadPdfToStorage(
            pdfContent,
            storagePathTemplate,
            this.storageBucket
          );
          if (storagePath) {
            console.log(`    ✓ Uploaded to storage: ${storagePath}`);
          }
        }

        documentInfo.push({
          type: docType,
          url: docUrl,
          local_path: filepath,
          storage_path: storagePath,
        });
      } catch (error) {
        console.log(`    Error downloading ${docType}: ${error}`);
      }
    }

    return documentInfo;
  }

  /**
   * Insert or update a complete bill with all related data into the database
   */
  async insertBillToDb(
    billData: BillData,
    documentInfo?: DocumentInfo[]
  ): Promise<[string, boolean]> {
    if (!this.db || !this.sessionId) {
      throw new Error('Database or session not initialized');
    }

    // Prepare bill record (session_id added later via upsertBill)
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
      const district = this.extractDistrictFromSponsor(billData.sponsor);
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
      const cosponsors = billData.cosponsors.split('; ');
      for (const cosponsorName of cosponsors) {
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
            hearing_time: MoHouseBillScraper.parseHearingTime(timeText) || undefined,
            hearing_time_text: timeText || undefined,
            location: parts[3].trim(),
          });
        }
      }
    }

    // Prepare documents data
    const documentsData: DocumentData[] = [];
    if (documentInfo) {
      // Use the document_info with storage paths if provided
      for (const docInfo of documentInfo) {
        documentsData.push({
          document_type: docInfo.type,
          document_url: docInfo.url,
          storage_path: docInfo.storage_path || undefined,
        });
      }
    } else if (billData.bill_documents) {
      // Fallback to old format if no document_info provided
      const documents = billData.bill_documents.split(' || ');
      for (const docStr of documents) {
        const parts = docStr.split(' | ');
        if (parts.length === 2) {
          documentsData.push({
            document_type: parts[0].trim(),
            document_url: parts[1].trim(),
            storage_path: undefined,
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
 * Convenience function to scrape bills for a session.
 *
 * @param options - Scraper options (year, sessionCode, limit, pdfDir)
 * @param db - Optional database instance (creates one if not provided)
 */
export async function scrapeBillsForSession(
  options: { year?: number; sessionCode?: string; limit?: number; pdfDir?: string } = {},
  db?: DatabaseClient
): Promise<void> {
  const { year, sessionCode = 'R', limit, pdfDir = 'bill_pdfs' } = options;

  // Get or create Database instance
  const database = db || new DatabaseClient();

  const scraper = new MoHouseBillScraper({ year, sessionCode, db: database });

  try {
    await scraper.start();

    // Get or create session
    scraper['sessionId'] = await scraper.getOrCreateSession();
    const sessionYear = year || 2026;
    console.log(`Using session: ${sessionYear} ${sessionCode} (ID: ${scraper['sessionId']})\n`);

    const bills = await scraper.scrapeBills();

    if (!bills || bills.length === 0) {
      console.log('No bills found!');
      return;
    }

    // Limit bills if requested
    const billsToProcess = limit ? bills.slice(0, limit) : bills;
    if (limit) {
      console.log(`Limited to first ${limit} bills`);
    }

    // Scrape detailed information
    console.log(`Scraping detailed information for ${billsToProcess.length} bills...`);

    for (let i = 0; i < billsToProcess.length; i++) {
      const bill = billsToProcess[i];
      const billNumber = bill.bill_number;
      console.log(`[${i + 1}/${billsToProcess.length}] Scraping details for ${billNumber}...`);

      try {
        const details = await scraper.scrapeBillDetails(billNumber);

        // Scrape co-sponsors
        let cosponsors = '';
        try {
          cosponsors = await scraper.scrapeCosponsors(billNumber);
        } catch (e) {
          console.log(`  Warning: Could not scrape co-sponsors for ${billNumber}: ${e}`);
        }

        // Scrape bill actions
        let actions = '';
        try {
          actions = await scraper.scrapeBillActions(billNumber);
        } catch (e) {
          console.log(`  Warning: Could not scrape actions for ${billNumber}: ${e}`);
        }

        // Scrape bill hearings
        let hearings = '';
        try {
          hearings = await scraper.scrapeBillHearings(billNumber);
        } catch (e) {
          console.log(`  Warning: Could not scrape hearings for ${billNumber}: ${e}`);
        }

        // Download PDFs and upload to Supabase Storage
        let documentInfo: DocumentInfo[] = [];
        try {
          documentInfo = await scraper.downloadBillDocuments(
            billNumber,
            details.bill_documents,
            pdfDir
          );
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

        // Insert to database with document info (including storage paths)
        try {
          const [billId, wasUpdated] = await scraper.insertBillToDb(merged, documentInfo);
          if (wasUpdated) {
            console.log(`  ✓ Updated in database with ID: ${billId}`);
          } else {
            console.log(`  ✓ Inserted to database with ID: ${billId}`);
          }
        } catch (e) {
          console.log(`  Error inserting/updating to database: ${e}`);
        }
      } catch (e) {
        console.log(`  Error scraping ${billNumber}: ${e}`);
      }
    }

    console.log(`\n✓ Successfully processed ${billsToProcess.length} bills into database`);
  } finally {
    await scraper.close();
  }
}
