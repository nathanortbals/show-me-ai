/**
 * Missouri Senate senator profile scraping functions.
 */

import { Page } from 'playwright';

/**
 * Senator profile data - aligned with database schema.
 * Only captures fields needed for legislators and session_legislators tables.
 */
export interface SenatorProfile {
  senator_id: string; // From URL, e.g., "28"
  name: string; // Full name, e.g., "Sandy Crawford"
  party?: string; // e.g., "Republican" -> party_affiliation
  district: string; // e.g., "28"
  photo_url?: string; // -> picture_url
  profile_url: string; // The senator's page URL -> profile_url
  year_elected?: number; // Derived from first_elected or Years of Service
  years_served?: number; // Calculated from year_elected or service periods
}

/**
 * Get the Senator profile URL.
 */
function getSenatorProfileUrl(senatorId: string): string {
  return `https://www.senate.mo.gov/Senators/Member/${senatorId}`;
}

/**
 * Scrape a senator's profile from their member page.
 *
 * @param page - Playwright page instance
 * @param senatorId - Senator member ID from URL (e.g., "28")
 * @returns Senator profile data
 */
export async function scrapeSenatorProfile(
  page: Page,
  senatorId: string
): Promise<SenatorProfile> {
  const url = getSenatorProfileUrl(senatorId);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  const currentYear = new Date().getFullYear();

  const profile = await page.evaluate(
    (args: { senatorId: string; url: string; currentYear: number }): SenatorProfile => {
      const result: SenatorProfile = {
        senator_id: args.senatorId,
        name: '',
        district: '',
        profile_url: args.url,
      };

      const bodyText = document.body.innerText;

      // Extract name from heading (e.g., "Senator Sandy Crawford")
      const nameHeading = document.querySelector('h2');
      if (nameHeading) {
        const nameMatch = nameHeading.textContent?.match(/Senator\s+(.+)/i);
        if (nameMatch) {
          result.name = nameMatch[1].trim();
        }
      }

      // Extract party (Republican or Democrat)
      const partyMatch = bodyText.match(/\b(Republican|Democrat)\b/);
      if (partyMatch) {
        result.party = partyMatch[1];
      }

      // Extract district number
      const districtMatch = bodyText.match(/District\s+(\d+)/i);
      if (districtMatch) {
        result.district = districtMatch[1];
      }

      // Extract year elected and calculate years served
      // Try active senator format first: "First elected to the Senate: August 2017" or "First elected to the Senate: 2020"
      const electedMatch = bodyText.match(/First elected to the Senate:\s*(?:\w+\s+)?(\d{4})/i);
      if (electedMatch) {
        result.year_elected = parseInt(electedMatch[1], 10);
        result.years_served = args.currentYear - result.year_elected;
      } else {
        // Try past senator format: "Years of Service: 2017-2021, 2021-2024"
        const serviceMatch = bodyText.match(/Years of Service:\s*([\d\s,\-–]+)/i);
        if (serviceMatch) {
          const serviceText = serviceMatch[1];
          // Extract all year ranges (handles both hyphen and en-dash)
          const rangeMatches = serviceText.matchAll(/(\d{4})\s*[-–]\s*(\d{4})/g);
          let totalYears = 0;
          let firstYear: number | null = null;

          for (const match of rangeMatches) {
            const startYear = parseInt(match[1], 10);
            const endYear = parseInt(match[2], 10);
            if (firstYear === null) {
              firstYear = startYear;
            }
            totalYears += endYear - startYear;
          }

          if (firstYear !== null) {
            result.year_elected = firstYear;
            result.years_served = totalYears;
          }
        }
      }

      // Extract photo URL
      const photoImg = document.querySelector('img[src*="SenatorPortraits"]') as HTMLImageElement;
      if (photoImg) {
        result.photo_url = photoImg.src;
      }

      return result;
    },
    { senatorId, url, currentYear }
  );

  return profile;
}

export { getSenatorProfileUrl };
