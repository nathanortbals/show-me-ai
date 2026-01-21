/**
 * Scrapes Missouri House of Representatives legislators and inserts them into Supabase.
 */

import { chromium, Browser, Page } from 'playwright';
import { DatabaseClient } from '@/ingestion/database/client';

/**
 * Legislator list item from roster page
 */
interface LegislatorListItem {
  name: string;
  district: string;
  party_abbrev: string;
  profile_url: string;
}

/**
 * Detailed legislator information from profile page
 */
interface LegislatorDetails {
  name: string;
  legislator_type: string;
  district: string;
  party_affiliation: string;
  year_elected: string;
  years_served: string;
  picture_url: string;
  is_active: boolean;
  profile_url: string;
}

/**
 * Scraper for Missouri House legislators.
 */
export class MoLegislatorScraper {
  private static readonly MEMBER_ROSTER_TEMPLATE =
    'https://archive.house.mo.gov/MemberGridCluster.aspx?year={year}&code={code}';
  private static readonly CURRENT_ROSTER_URL = 'https://house.mo.gov/MemberGridCluster.aspx';

  private year: number | null;
  private sessionCode: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db: DatabaseClient;

  /**
   * Initialize the legislator scraper.
   *
   * @param year - Legislative year (null for current session)
   * @param sessionCode - Session code (R for Regular, E for Extraordinary)
   * @param db - Database instance for all database operations
   */
  constructor(year: number | null = null, sessionCode: string = 'R', db?: DatabaseClient) {
    this.year = year;
    this.sessionCode = sessionCode;
    this.db = db || new DatabaseClient();
  }

  /**
   * Start the browser and page.
   */
  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  /**
   * Close the browser.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Get the appropriate roster URL based on year.
   */
  private getRosterUrl(): string {
    if (this.year) {
      return MoLegislatorScraper.MEMBER_ROSTER_TEMPLATE.replace('{year}', String(this.year)).replace(
        '{code}',
        this.sessionCode
      );
    }
    return MoLegislatorScraper.CURRENT_ROSTER_URL;
  }

  /**
   * Scrape the list of legislators from the member roster page.
   *
   * @returns List of legislator objects with basic info (name, district, party, profile_url)
   */
  async scrapeLegislatorList(): Promise<LegislatorListItem[]> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    const url = this.getRosterUrl();
    console.log(`Navigating to ${url}...`);
    await this.page.goto(url, { waitUntil: 'networkidle' });

    // Wait for content to load
    await this.page.waitForSelector('main', { timeout: 10000 });

    console.log('Extracting legislator list...');

    // Extract legislator data
    const legislators = await this.page.evaluate(() => {
      const legislators: LegislatorListItem[] = [];
      const main = document.querySelector('main');
      if (!main) return legislators;

      // Find all links that go to MemberDetails
      const links = Array.from(main.querySelectorAll('a[href*="MemberDetails"]'));

      // Group links by district (each legislator has 2 links - first and last name)
      const districtMap = new Map<
        string,
        {
          profile_url: string;
          district: string;
          name_parts: string[];
        }
      >();

      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const districtMatch = href.match(/district=(\d+)/);
        if (districtMatch) {
          const district = districtMatch[1];
          if (!districtMap.has(district)) {
            districtMap.set(district, {
              profile_url: href,
              district: district,
              name_parts: [],
            });
          }
          districtMap.get(district)!.name_parts.push(link.textContent?.trim() || '');
        }
      }

      // Now find party affiliations by looking at StaticText elements
      const staticTexts = Array.from(document.querySelectorAll('main *'));
      const parties: string[] = [];

      for (const el of staticTexts) {
        const text = el.textContent?.trim() || '';
        if (text === 'R' || text === 'D' || text === 'Republican' || text === 'Democrat') {
          parties.push(text);
        }
      }

      // Convert map to array and add party info
      const districtArray = Array.from(districtMap.values());
      for (let i = 0; i < districtArray.length && i < parties.length; i++) {
        const legislator = districtArray[i];
        // Combine name parts (usually last name, first name)
        const name = legislator.name_parts.join(' ');

        // Add party
        const party = parties[i];
        let partyAbbrev: string;
        if (party === 'R') {
          partyAbbrev = 'R';
        } else if (party === 'D') {
          partyAbbrev = 'D';
        } else {
          partyAbbrev = party;
        }

        legislators.push({
          name,
          district: legislator.district,
          party_abbrev: partyAbbrev,
          profile_url: legislator.profile_url,
        });
      }

      return legislators;
    });

    console.log(`Found ${legislators.length} legislators`);
    return legislators;
  }

  /**
   * Scrape detailed information for a specific legislator.
   *
   * @param profileUrl - URL to the legislator's profile page
   * @returns Object containing legislator details
   */
  async scrapeLegislatorDetails(profileUrl: string): Promise<LegislatorDetails> {
    if (!this.page) {
      throw new Error('Browser not started');
    }

    await this.page.goto(profileUrl, { waitUntil: 'networkidle' });

    // Extract legislator details
    const details = await this.page.evaluate(() => {
      const details: LegislatorDetails = {
        name: '',
        legislator_type: '',
        district: '',
        party_affiliation: '',
        year_elected: '',
        years_served: '',
        picture_url: '',
        is_active: true,
        profile_url: window.location.href,
      };

      // Extract name and type from h1
      const h1 = document.querySelector('h1');
      if (h1) {
        let fullName = h1.textContent?.trim() || '';
        // Fix missing space between title and name
        fullName = fullName.replace(/^(Representative|Senator)([A-Z])/, '$1 $2');

        // Extract legislator type
        const typeMatch = fullName.match(/^(Representative|Senator)\s+/);
        if (typeMatch) {
          details.legislator_type = typeMatch[1];
        }

        // Remove "Representative" or "Senator" prefix from name
        details.name = fullName.replace(/^(Representative|Senator)\s+/, '');
      }

      // Extract picture URL
      const pictureImg = document.querySelector('img[src*="MemberPhoto"]');
      if (pictureImg) {
        details.picture_url = (pictureImg as HTMLImageElement).src;
      }

      // Check if this is a former member (inactive)
      const pageText = document.body.textContent || '';
      if (
        pageText.indexOf('This record belongs to a former Representative') !== -1 ||
        pageText.indexOf('This record belongs to a former Senator') !== -1
      ) {
        details.is_active = false;
      }

      // Find all StaticText nodes in main content
      const mainElement = document.querySelector('main');
      if (mainElement) {
        // Get all text nodes
        const walker = document.createTreeWalker(mainElement, NodeFilter.SHOW_TEXT, null);

        const textNodes: string[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim() || '';
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
          if (
            text === 'Republican' ||
            text === 'Democrat' ||
            text === 'Democratic' ||
            text === 'Independent'
          ) {
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
    });

    return details;
  }
}

/**
 * Options for running the scraper.
 */
export interface ScraperOptions {
  year?: number;
  sessionCode?: string;
}

/**
 * Run the legislator scraper.
 *
 * @param options - Scraper options (year, sessionCode)
 * @param db - Optional database instance
 */
export async function runLegislatorScraper(
  options: ScraperOptions = {},
  db?: DatabaseClient
): Promise<void> {
  const { year, sessionCode = 'R' } = options;

  // Get or create Database instance
  const database = db || new DatabaseClient();

  // Create scraper instance
  const scraper = new MoLegislatorScraper(year || null, sessionCode, database);

  try {
    // Start browser
    await scraper.start();

    // Get or create session
    const actualYear = year || 2026;
    const sessionId = await database.getOrCreateSession(actualYear, sessionCode);
    console.log(`Using session: ${actualYear} ${sessionCode} (ID: ${sessionId})`);

    // Get list of legislators
    const legislators = await scraper.scrapeLegislatorList();

    if (!legislators || legislators.length === 0) {
      console.log('No legislators found!');
      return;
    }

    console.log(`\nScraping detailed information for ${legislators.length} legislators...`);
    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < legislators.length; i++) {
      const legislator = legislators[i];
      console.log(
        `[${i + 1}/${legislators.length}] Scraping ${legislator.name} (District ${legislator.district})...`
      );

      try {
        // Scrape full profile
        const details = await scraper.scrapeLegislatorDetails(legislator.profile_url);

        // Skip vacant districts (no legislator_type means vacant)
        if (!details.legislator_type) {
          console.log(`  ⊘ Skipped (vacant district)`);
          continue;
        }

        // Parse year_elected and years_served to numbers
        const yearElected = details.year_elected ? parseInt(details.year_elected, 10) : undefined;
        const yearsServed = details.years_served ? parseInt(details.years_served, 10) : undefined;

        // Upsert to database
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

        // Link legislator to session
        const district = details.district || legislator.district;
        await database.linkLegislatorToSession(sessionId, legislatorId, district);

        if (wasUpdated) {
          console.log(`  ✓ Updated in database with ID: ${legislatorId}`);
          updatedCount++;
        } else {
          console.log(`  ✓ Inserted to database with ID: ${legislatorId}`);
          insertedCount++;
        }
      } catch (e) {
        console.log(`  Error processing legislator: ${e}`);
      }
    }

    console.log(`\n✓ Successfully processed ${legislators.length} legislators`);
    console.log(`  - Inserted: ${insertedCount}`);
    console.log(`  - Updated: ${updatedCount}`);
  } finally {
    // Close browser
    await scraper.close();
  }
}
