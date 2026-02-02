/**
 * Senate bill actions scraping functions.
 */

import { Page } from 'playwright';

/**
 * Get the two-digit year code for Senate URLs.
 * e.g., 2026 -> "26", 2025 -> "25"
 */
function getYearCode(year: number): string {
  return String(year).slice(-2);
}

/**
 * Get the Senate bill actions page URL.
 */
function getActionsUrl(billId: string, year: number, sessionCode: string = 'R'): string {
  const yearCode = getYearCode(year);
  return `https://www.senate.mo.gov/${yearCode}info/BTS_Web/Actions.aspx?SessionType=${sessionCode}&BillID=${billId}`;
}

/**
 * Scrape bill actions from the Senate actions page.
 *
 * @param page - Playwright page instance
 * @param billId - Internal Senate bill ID
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Actions string in format "date | description || date | description"
 */
export async function scrapeSendBillActions(
  page: Page,
  billId: string,
  year: number,
  sessionCode: string = 'R'
): Promise<string> {
  const url = getActionsUrl(billId, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const actions = await page.evaluate((): string => {
    const actionParts: string[] = [];

    // The actions page typically has a table or list of actions
    // Try to find action rows
    const rows = Array.from(document.querySelectorAll('tr'));

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length >= 2) {
        const date = cells[0].textContent?.trim() || '';
        const description = cells[1].textContent?.trim() || '';

        if (date && description) {
          actionParts.push(`${date} | ${description}`);
        }
      }
    }

    return actionParts.join(' || ');
  });

  return actions;
}
