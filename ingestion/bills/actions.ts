/**
 * Bill action scraping functions.
 */

import { Page } from 'playwright';

/**
 * Get the bill actions URL for a specific bill.
 */
function getActionsUrl(billNumber: string, year?: number, sessionCode: string = 'R'): string {
  const base = year ? 'https://archive.house.mo.gov' : 'https://house.mo.gov';
  return `${base}/BillActions.aspx?bill=${billNumber}&year=${year}&code=${sessionCode}`;
}

/**
 * Scrape bill actions for a specific bill.
 *
 * @param page - Playwright page instance
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Pipe-delimited string of actions (date | description)
 */
export async function scrapeActions(
  page: Page,
  billNumber: string,
  year?: number,
  sessionCode: string = 'R'
): Promise<string> {
  const url = getActionsUrl(billNumber, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const actions = await page.evaluate(() => {
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
