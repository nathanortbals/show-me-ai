/**
 * Bill list and details scraping functions.
 */

import { Page } from 'playwright';
import { BillListItem, BillDetails } from '../shared/types';

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

  const details = await page.evaluate((): BillDetails => {
    const result: BillDetails = {
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
      bill_documents: [],
    };

    // Extract bill number from h1
    const h1 = document.querySelector('h1');
    if (h1) {
      result.bill_number = h1.textContent?.trim() || '';
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
        if (lines[i] === result.bill_number || lines[i].indexOf(result.bill_number) >= 0) {
          foundBill = true;
        } else if (foundBill) {
          result.title = lines[i];
          break;
        }
      }
    }

    // Extract sponsor
    const sponsorLink = document.querySelector('a[href*="MemberDetails"]');
    if (sponsorLink) {
      result.sponsor = sponsorLink.textContent?.trim() || '';
      result.sponsor_url = (sponsorLink as HTMLAnchorElement).href;
    }

    // Extract various labeled fields by searching for label text
    const allElements = Array.from(document.querySelectorAll('main *'));
    const labelTexts = [
      'Proposed Effective Date:',
      'LR Number:',
      'Last Action:',
      'Bill String:',
      'Next House Hearing:',
      'Calendar:',
    ];

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const text = el.textContent?.trim() || '';
      if (labelTexts.includes(text)) {
        const nextEl = allElements[i + 1];
        if (nextEl) {
          const value = nextEl.textContent?.trim() || '';
          switch (text) {
            case 'Proposed Effective Date:':
              result.proposed_effective_date = value;
              break;
            case 'LR Number:':
              result.lr_number = value;
              break;
            case 'Last Action:':
              result.last_action = value;
              break;
            case 'Bill String:':
              result.bill_string = value;
              break;
            case 'Next House Hearing:':
              result.hearing_status = value;
              break;
            case 'Calendar:':
              result.calendar_status = value;
              break;
          }
        }
      }
    }

    // Extract bill documents from DocRows structure
    // DOM structure:
    //   <div id="DocRows">
    //     <div class="DocHeaderRow"><h2>Bill Text</h2></div>
    //     <div class="DocRow">
    //       <div class="DocInfoCell">
    //         <div class="textLR">5106H.01I</div>
    //         <div class="textType"><a href="...pdf">Introduced</a></div>
    //       </div>
    //     </div>
    //   </div>
    const docRows = document.getElementById('DocRows');
    if (docRows) {
      const rows = Array.from(docRows.querySelectorAll('.DocRow'));
      for (const row of rows) {
        const docIdEl = row.querySelector('.textLR');
        const linkEl = row.querySelector('.textType a') as HTMLAnchorElement | null;

        if (!linkEl) continue;

        const docUrl = linkEl.href;
        const docTitle = linkEl.textContent?.trim() || '';
        const docId = docIdEl?.textContent?.trim() || docTitle;

        // Skip Testimony (witnesses) and Fiscal Notes (.ORG files)
        const isTestimony = docUrl.includes('/witnesses/');
        const isFiscalNote = docUrl.includes('/fiscal/') || docUrl.includes('.ORG');
        if (isTestimony || isFiscalNote) continue;

        // Determine document type from URL path
        const isSummary = docUrl.includes('/sumpdf/');
        const docType = isSummary ? 'Bill Summary' : 'Bill Text';

        result.bill_documents.push({
          doc_id: docId,
          type: docType,
          title: docTitle,
          url: docUrl,
        });
      }
    }

    return result;
  });

  return details as BillDetails;
}
