/**
 * Senate bill sponsor and co-sponsor scraping functions.
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
 * Get the Senate co-sponsors page URL.
 */
function getCosponsorsUrl(billId: string, year: number, sessionCode: string = 'R'): string {
  const yearCode = getYearCode(year);
  return `https://www.senate.mo.gov/${yearCode}info/BTS_Web/CoSponsors.aspx?SessionType=${sessionCode}&BillID=${billId}`;
}

/**
 * Scrape co-sponsors for a specific Senate bill.
 *
 * @param page - Playwright page instance
 * @param billId - Internal Senate bill ID (e.g., "394")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Semicolon-delimited string of co-sponsor names
 */
export async function scrapeSenateCoSponsors(
  page: Page,
  billId: string,
  year: number,
  sessionCode: string = 'R'
): Promise<string> {
  const url = getCosponsorsUrl(billId, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const cosponsors = await page.evaluate(() => {
    const cosponsorNames: string[] = [];

    // Find all links to senator member pages
    const links = Array.from(document.querySelectorAll('a[href*="/Senators/Member/"]')) as HTMLAnchorElement[];

    for (const link of links) {
      const text = link.textContent?.trim() || '';
      if (text) {
        // Extract just the name (remove ", District XX" suffix if present)
        const nameMatch = text.match(/^(.+?),\s*District\s*\d+$/);
        const name = nameMatch ? nameMatch[1].trim() : text;
        if (name) {
          cosponsorNames.push(name);
        }
      }
    }

    return cosponsorNames.join('; ');
  });

  return cosponsors;
}
