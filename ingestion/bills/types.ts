/**
 * Type definitions for the Missouri House bill scraper.
 */

import { DatabaseClient } from '@/database/client';

/**
 * Bill list item from the bill list page
 */
export interface BillListItem {
  bill_number: string;
  bill_url: string;
  sponsor: string;
  sponsor_url: string;
  description: string;
}

/**
 * Detailed bill information from the bill detail page
 */
export interface BillDetails {
  bill_number: string;
  title: string;
  sponsor: string;
  sponsor_url: string;
  lr_number: string;
  last_action: string;
  last_action_date: string;
  proposed_effective_date: string;
  bill_string: string;
  calendar_status: string;
  hearing_status: string;
  bill_documents: string;
}

/**
 * Document information including extracted text
 */
export interface DocumentInfo {
  type: string;
  url: string;
  local_path: string;
  storage_path: string | null;
  extracted_text: string | null;
}

/**
 * Bill data for database insertion
 */
export interface BillData {
  bill_number: string;
  title?: string;
  description?: string;
  lr_number?: string;
  sponsor?: string;
  sponsor_url?: string;
  bill_string?: string;
  last_action?: string;
  proposed_effective_date?: string;
  calendar_status?: string;
  hearing_status?: string;
  bill_url?: string;
  bill_documents?: string;
  cosponsors?: string;
  actions?: string;
  hearings?: string;
}

/**
 * Scraper options
 */
export interface ScraperOptions {
  year?: number;
  sessionCode?: string;
  db?: DatabaseClient;
}

/**
 * Options for the scrapeBillsForSession convenience function
 */
export interface ScrapeBillsOptions {
  year?: number;
  sessionCode?: string;
  limit?: number;
  pdfDir?: string;
  force?: boolean;
}
