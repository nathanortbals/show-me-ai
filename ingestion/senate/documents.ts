/**
 * Senate bill document scraping functions.
 */

import { Page } from 'playwright';
import { ScrapedDocument } from '../shared/types';

/**
 * Get the two-digit year code for Senate URLs.
 * e.g., 2026 -> "26", 2025 -> "25"
 */
function getYearCode(year: number): string {
  return String(year).slice(-2);
}

/**
 * Get the Senate bill text page URL (lists available PDFs).
 */
function getBillTextUrl(billId: string, year: number, sessionCode: string = 'R'): string {
  const yearCode = getYearCode(year);
  return `https://www.senate.mo.gov/${yearCode}info/BTS_Web/BillText.aspx?SessionType=${sessionCode}&BillID=${billId}`;
}

/**
 * Get the Senate bill summaries page URL.
 */
function getSummariesUrl(billId: string, year: number, sessionCode: string = 'R'): string {
  const yearCode = getYearCode(year);
  return `https://www.senate.mo.gov/${yearCode}info/BTS_Web/Summaries.aspx?SessionType=${sessionCode}&BillID=${billId}`;
}

/**
 * Scrape bill text documents (PDFs) from the Senate bill text page.
 *
 * @param page - Playwright page instance
 * @param billId - Internal Senate bill ID
 * @param billNumber - Bill number for doc_id generation
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Array of scraped documents
 */
export async function scrapeSendBillDocuments(
  page: Page,
  billId: string,
  billNumber: string,
  year: number,
  sessionCode: string = 'R'
): Promise<ScrapedDocument[]> {
  const url = getBillTextUrl(billId, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const documents = await page.evaluate((billNum: string): ScrapedDocument[] => {
    const docs: ScrapedDocument[] = [];

    // Find all PDF links on the page
    const links = Array.from(document.querySelectorAll('a[href*=".pdf"]')) as HTMLAnchorElement[];

    for (const link of links) {
      const title = link.textContent?.trim() || '';
      const url = link.href;

      // Generate doc_id from bill number and title
      // e.g., "SB834I" for Introduced version
      const cleanBillNum = billNum.replace(/\s+/g, '');
      const titleCode = title.charAt(0).toUpperCase(); // First letter of title
      const docId = `${cleanBillNum}${titleCode}`;

      docs.push({
        doc_id: docId,
        type: 'Bill Text',
        title: title,
        url: url,
      });
    }

    return docs;
  }, billNumber);

  return documents;
}

/**
 * Scrape bill summary documents from the Senate summaries page.
 *
 * @param page - Playwright page instance
 * @param billId - Internal Senate bill ID
 * @param billNumber - Bill number for doc_id generation
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Array of scraped summary documents
 */
export async function scrapeSendBillSummaries(
  page: Page,
  billId: string,
  billNumber: string,
  year: number,
  sessionCode: string = 'R'
): Promise<ScrapedDocument[]> {
  const url = getSummariesUrl(billId, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const documents = await page.evaluate((billNum: string): ScrapedDocument[] => {
    const docs: ScrapedDocument[] = [];

    // The summaries page shows the summary text directly
    // Check if there's any summary content
    const summarySection = document.querySelector('body');
    const bodyText = summarySection?.innerText || '';

    // Check for "No Summaries Found" message
    if (bodyText.includes('No Summaries Found')) {
      return [];
    }

    // Look for PDF links if any
    const pdfLinks = Array.from(document.querySelectorAll('a[href*=".pdf"]')) as HTMLAnchorElement[];

    for (const link of pdfLinks) {
      const title = link.textContent?.trim() || 'Summary';
      const url = link.href;

      const cleanBillNum = billNum.replace(/\s+/g, '');
      const docId = `${cleanBillNum}SUM`;

      docs.push({
        doc_id: docId,
        type: 'Bill Summary',
        title: title,
        url: url,
      });
    }

    return docs;
  }, billNumber);

  return documents;
}
