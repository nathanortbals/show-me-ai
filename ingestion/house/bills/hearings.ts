/**
 * Bill hearing scraping and parsing functions.
 */

import { Page } from 'playwright';

/**
 * Get the bill hearings URL for a specific bill.
 */
function getHearingsUrl(billNumber: string, year?: number, sessionCode: string = 'R'): string {
  const base = year ? 'https://archive.house.mo.gov' : 'https://house.mo.gov';
  return `${base}/BillHearings.aspx?Bill=${billNumber}&year=${year}&code=${sessionCode}`;
}

/**
 * Parse hearing time from text string.
 *
 * Extracts time patterns like "4:30 PM" and converts to 24-hour format.
 * Returns null for strings like "Upon Adjournment" or "TBA".
 *
 * @param timeStr - Raw hearing time string
 * @returns Time in HH:MM:SS format, or null if no parseable time found
 */
export function parseHearingTime(timeStr: string): string | null {
  if (!timeStr) {
    return null;
  }

  // Try to find time patterns like "4:30 PM", "2:00 PM", etc.
  const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/;
  const match = timeStr.match(timePattern);

  if (match) {
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const period = match[3].toUpperCase();

    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
  }

  // No valid time found
  return null;
}

/**
 * Scrape bill hearings for a specific bill.
 *
 * @param page - Playwright page instance
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param year - Session year
 * @param sessionCode - Session code
 * @returns Pipe-delimited string of hearings (committee | date | time | location)
 */
export async function scrapeHearings(
  page: Page,
  billNumber: string,
  year?: number,
  sessionCode: string = 'R'
): Promise<string> {
  const url = getHearingsUrl(billNumber, year, sessionCode);
  await page.goto(url, { waitUntil: 'networkidle' });

  const hearings = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return '';

    const rows = Array.from(table.querySelectorAll('tr'));
    const hearingStrings: string[] = [];

    let currentCommittee = '';
    let currentDate = '';
    let currentTime = '';
    let currentLocation = '';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll('td, th'));

      if (cells.length === 1 && cells[0].tagName === 'TH') {
        // This is a committee header row
        if (currentCommittee && currentDate) {
          hearingStrings.push(
            currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation
          );
        }

        const committeeLink = cells[0].querySelector('a');
        currentCommittee = committeeLink
          ? committeeLink.textContent?.trim() || ''
          : cells[0].textContent?.trim() || '';
        currentDate = '';
        currentTime = '';
        currentLocation = '';
      } else if (cells.length === 2) {
        const label = cells[0].textContent?.trim() || '';
        const value = cells[1].textContent?.trim() || '';

        if (label === 'Date:') {
          currentDate = value;
        } else if (label === 'Time:') {
          currentTime = value;
        } else if (label === 'Location:') {
          currentLocation = value;
        }
      }
    }

    // Add the last hearing
    if (currentCommittee && currentDate) {
      hearingStrings.push(
        currentCommittee + ' | ' + currentDate + ' | ' + currentTime + ' | ' + currentLocation
      );
    }

    return hearingStrings.join(' || ');
  });

  return hearings;
}
