/**
 * Sponsor and co-sponsor scraping and parsing functions.
 */

import { Page } from 'playwright';

/**
 * Get the co-sponsors URL for a specific bill.
 */
function getCosponsorsUrl(billNumber: string, year?: number, sessionCode: string = 'R'): string {
  const base = year ? 'https://archive.house.mo.gov' : 'https://house.mo.gov';
  return `${base}/CoSponsors.aspx?bill=${billNumber}&year=${year}&code=${sessionCode}`;
}

/**
 * Extract district number from sponsor text like "LastName, FirstName (151)"
 *
 * @param sponsorText - Sponsor text from the website
 * @returns District number as string, or null if not found
 */
export function extractDistrictFromSponsor(sponsorText: string): string | null {
  const match = sponsorText.match(/\((\d+)\)$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Scrape co-sponsors for a specific bill.
 *
 * @param page - Playwright page instance
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Semicolon-delimited string of co-sponsor names
 */
export async function scrapeCosponsors(
  page: Page,
  billNumber: string,
  year?: number,
  sessionCode: string = 'R'
): Promise<string> {
  const url = getCosponsorsUrl(billNumber, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const cosponsors = await page.evaluate(() => {
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
