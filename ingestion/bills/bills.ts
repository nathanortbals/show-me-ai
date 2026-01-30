/**
 * Bill list and details scraping functions.
 */

import { Page } from 'playwright';
import { BillListItem, BillDetails } from './types';

const BASE_URL = 'https://house.mo.gov/billlist.aspx';
const ARCHIVE_URL = 'https://archive.house.mo.gov/billlist.aspx';

/**
 * Get the bill list URL for a session.
 */
function getBillListUrl(year?: number, sessionCode: string = 'R'): string {
  if (year) {
    return `${ARCHIVE_URL}?year=${year}&code=${sessionCode}`;
  }
  return BASE_URL;
}

/**
 * Get the bill detail URL for a specific bill.
 */
function getBillDetailUrl(billNumber: string, year?: number, sessionCode: string = 'R'): string {
  const base = year ? 'https://archive.house.mo.gov' : 'https://house.mo.gov';
  return `${base}/BillContent.aspx?bill=${billNumber}&year=${year}&code=${sessionCode}&style=new`;
}

/**
 * Scrape all bills from the Missouri House bill list page.
 *
 * @param page - Playwright page instance
 * @param year - Session year (optional, uses current session if not provided)
 * @param sessionCode - Session code (R, S1, S2)
 * @returns Array of bill list items
 */
export async function scrapeBillList(
  page: Page,
  year?: number,
  sessionCode: string = 'R'
): Promise<BillListItem[]> {
  const url = getBillListUrl(year, sessionCode);
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('table', { timeout: 10000 });

  console.log('Extracting bill data...');

  const bills = await page.evaluate(() => {
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
 * Scrape detailed information for a specific bill.
 *
 * @param page - Playwright page instance
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Bill details
 */
export async function scrapeBillDetails(
  page: Page,
  billNumber: string,
  year?: number,
  sessionCode: string = 'R'
): Promise<BillDetails> {
  const url = getBillDetailUrl(billNumber, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const details = await page.evaluate(() => {
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
      'Calendar:': 'calendar_status',
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
