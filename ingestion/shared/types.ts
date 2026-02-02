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
  bill_documents: ScrapedDocument[];
}

/**
 * Scraped document reference from the bill page
 */
export interface ScrapedDocument {
  doc_id: string;
  type: 'Bill Text' | 'Bill Summary';
  title: string;
  url: string;
}

/**
 * Document information including extracted text (after PDF processing)
 */
export interface DocumentInfo extends ScrapedDocument {
  local_path: string;
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
  bill_documents?: ScrapedDocument[];
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
