/**
 * Missouri Senate bill list and details scraping functions.
 */

import { Page } from 'playwright';
import { BillListItem, BillDetails } from '../shared/types';

/**
 * Get the two-digit year code for Senate URLs.
 * e.g., 2026 -> "26", 2025 -> "25"
 */
function getYearCode(year: number): string {
  return String(year).slice(-2);
}

/**
 * Get the Senate bill list URL for a session.
 */
function getBillListUrl(year: number = 2026, sessionCode: string = 'R'): string {
  return `https://www.senate.mo.gov/BillTracking/Bills/BillList?year=${year}&session=${sessionCode}`;
}

/**
 * Get the Senate bill detail URL for a specific bill.
 */
function getBillDetailUrl(billId: string, year: number, sessionCode: string = 'R'): string {
  const yearCode = getYearCode(year);
  return `https://www.senate.mo.gov/${yearCode}info/BTS_Web/Bill.aspx?SessionType=${sessionCode}&BillID=${billId}`;
}

/**
 * Extract BillID from a Senate bill URL.
 * e.g., "https://www.senate.mo.gov/26info/BTS_Web/Bill.aspx?SessionType=R&BillID=416" -> "416"
 */
export function extractBillIdFromUrl(url: string): string | null {
  const match = url.match(/BillID=(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract Senator member ID from a Senate sponsor URL.
 * e.g., "https://www.senate.mo.gov/Senators/Member/28" -> "28"
 */
export function extractSenatorIdFromUrl(url: string): string | null {
  const match = url.match(/\/Member\/(\d+)/);
  return match ? match[1] : null;
}

export interface SenateBillListItem extends BillListItem {
  bill_id: string; // Internal Senate bill ID (e.g., "416")
  senator_id?: string; // Internal Senator member ID (e.g., "28")
}

/**
 * Scrape all bills from the Missouri Senate bill list page.
 *
 * @param page - Playwright page instance
 * @param year - Session year
 * @param sessionCode - Session code (R, S1, S2)
 * @returns Array of Senate bill list items
 */
export async function scrapeSendBillList(
  page: Page,
  year: number = 2026,
  sessionCode: string = 'R'
): Promise<SenateBillListItem[]> {
  const url = getBillListUrl(year, sessionCode);
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for the bill rows to load
  await page.waitForSelector('.row-even, .row-odd', { timeout: 15000 });

  console.log('Extracting Senate bill data...');

  const bills = await page.evaluate(() => {
    const bills: SenateBillListItem[] = [];

    // Select all bill rows (alternating even/odd)
    const rows = Array.from(document.querySelectorAll('main .row.row-even, main .row.row-odd'));

    // Bills come in pairs of rows: info row + links row
    // We only care about the info rows that contain the actual bill link (Bill.aspx, not Actions.aspx)
    for (const row of rows) {
      // Only look for links to Bill.aspx (not Actions.aspx or other pages)
      const billLink = row.querySelector('a[href*="Bill.aspx"][href*="BillID"]') as HTMLAnchorElement;
      if (!billLink) continue;

      const billNumber = billLink.textContent?.trim() || '';
      const billUrl = billLink.href;

      // Skip if this doesn't look like a bill number (e.g., "Actions", "Summaries")
      if (!billNumber.match(/^S[A-Z]+\s*\d+$/)) continue;

      // Extract BillID from URL
      const billIdMatch = billUrl.match(/BillID=(\d+)/);
      if (!billIdMatch) continue;
      const billId = billIdMatch[1];

      // Find sponsor link (next anchor after bill link)
      const sponsorLink = row.querySelector('a[href*="/Senators/Member/"]') as HTMLAnchorElement;
      const sponsor = sponsorLink?.textContent?.trim() || '';
      const sponsorUrl = sponsorLink?.href || '';

      // Extract senator ID from URL
      const senatorIdMatch = sponsorUrl.match(/\/Member\/(\d+)/);
      const senatorId = senatorIdMatch ? senatorIdMatch[1] : undefined;

      // Find description (in the col-md-9 div)
      const descDiv = row.querySelector('.col-md-9');
      const description = descDiv?.textContent?.trim() || '';

      bills.push({
        bill_number: billNumber,
        bill_url: billUrl,
        bill_id: billId,
        sponsor: sponsor,
        sponsor_url: sponsorUrl,
        senator_id: senatorId,
        description: description,
      });
    }

    return bills;
  });

  console.log(`Found ${bills.length} Senate bills`);
  return bills as SenateBillListItem[];
}

/**
 * Extended bill details including committee and summary.
 */
export interface SenateBillDetails extends BillDetails {
  committee_name?: string;
  committee_url?: string;
  bill_summary?: string;
}

/**
 * Scrape detailed information for a specific Senate bill.
 *
 * @param page - Playwright page instance
 * @param billId - Internal Senate bill ID (e.g., "416")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Bill details including committee and summary
 */
export async function scrapeSendBillDetails(
  page: Page,
  billId: string,
  year: number,
  sessionCode: string = 'R'
): Promise<SenateBillDetails> {
  const url = getBillDetailUrl(billId, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  const details = await page.evaluate((): SenateBillDetails => {
    const result: SenateBillDetails = {
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

    const bodyText = document.body.innerText;

    // Extract bill number (e.g., "SB 834")
    const billMatch = bodyText.match(/^(S[A-Z]+ \d+)/m);
    if (billMatch) {
      result.bill_number = billMatch[1];
    }

    // Extract title - it follows the bill number on a new line
    const titleMatch = bodyText.match(/^S[A-Z]+ \d+\n(.+?)(?:\nSponsor:)/s);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }

    // Extract LR Number
    const lrMatch = bodyText.match(/LR Number:\s*(\S+)/);
    if (lrMatch) {
      result.lr_number = lrMatch[1];
    }

    // Extract Last Action (can span multiple lines until next label)
    const lastActionMatch = bodyText.match(/Last Action:\s*\n?([\s\S]*?)(?=\nJournal Page:|\nTitle:|\nEffective Date:)/);
    if (lastActionMatch) {
      result.last_action = lastActionMatch[1].trim().replace(/\n/g, ' ');
    }

    // Extract Effective Date
    const effectiveDateMatch = bodyText.match(/Effective Date:\s*\n?([^\n]+)/);
    if (effectiveDateMatch) {
      const date = effectiveDateMatch[1].trim();
      if (date && date !== 'Current Bill Summary') {
        result.proposed_effective_date = date;
      }
    }

    // Extract sponsor URL and name
    const sponsorLink = document.querySelector('a[href*="/Senators/member/"]') as HTMLAnchorElement;
    if (sponsorLink) {
      result.sponsor_url = sponsorLink.href;
      result.sponsor = sponsorLink.textContent?.trim() || '';
    }

    // Extract committee name and URL
    const committeeLink = document.querySelector('a[href*="CommitteeDetails"]') as HTMLAnchorElement;
    if (committeeLink) {
      result.committee_name = committeeLink.textContent?.trim() || '';
      result.committee_url = committeeLink.href;
    }

    // Extract bill summary from the lblSummary span element
    const summarySpan = document.querySelector('#lblSummary') as HTMLElement;
    if (summarySpan) {
      let summary = summarySpan.innerText?.trim() || '';
      // Clean up the summary - remove author name at the end if present
      // Author names are typically all caps on their own line at the end
      summary = summary.replace(/\n[A-Z\s]+$/m, '').trim();
      if (summary) {
        result.bill_summary = summary;
      }
    }

    return result;
  });

  return details;
}
