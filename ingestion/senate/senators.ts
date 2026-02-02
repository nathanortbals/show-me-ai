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
  year_elected?: number; // Derived from first_elected
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

  const profile = await page.evaluate(
    (args: { senatorId: string; url: string }): SenatorProfile => {
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

      // Extract year elected from "First elected to the Senate: August 2017"
      const electedMatch = bodyText.match(/First elected to the Senate:\s*\w+\s*(\d{4})/i);
      if (electedMatch) {
        result.year_elected = parseInt(electedMatch[1], 10);
      }

      // Extract photo URL
      const photoImg = document.querySelector('img[src*="SenatorPortraits"]') as HTMLImageElement;
      if (photoImg) {
        result.photo_url = photoImg.src;
      }

      return result;
    },
    { senatorId, url }
  );

  return profile;
}

export { getSenatorProfileUrl };
