/**
 * Database class for interacting with Supabase.
 *
 * This class provides a comprehensive set of methods for all database operations
 * including sessions, legislators, bills, committees, and storage operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/database/types';

// Type aliases for convenience
type Bill = Database['public']['Tables']['bills']['Row'];
type BillInsert = Database['public']['Tables']['bills']['Insert'];
type BillDocument = Database['public']['Tables']['bill_documents']['Row'];

/**
 * Legislator data for upsert operations (without auto-generated fields)
 */
export type LegislatorData = Omit<
  Database['public']['Tables']['legislators']['Insert'],
  'id' | 'created_at' | 'updated_at'
>;

/**
 * Sponsor data for bill insertion (without bill_id, added during insertion)
 */
export type SponsorData = Omit<
  Database['public']['Tables']['bill_sponsors']['Insert'],
  'bill_id' | 'id' | 'created_at'
>;

/**
 * Action data for bill insertion (without bill_id, added during insertion)
 */
export type ActionData = Omit<
  Database['public']['Tables']['bill_actions']['Insert'],
  'bill_id' | 'id' | 'created_at'
>;

/**
 * Hearing data for bill insertion (uses committee_name for convenience, resolved to committee_id internally)
 * This is a convenience wrapper - the scraper provides committee_name which upsertBill resolves to committee_id
 */
export type HearingData = Omit<
  Database['public']['Tables']['bill_hearings']['Insert'],
  'bill_id' | 'committee_id' | 'id' | 'created_at'
> & {
  committee_name: string; // Resolved to committee_id during insertion
};

/**
 * Document data for bill insertion (without bill_id, added during insertion)
 * Note: storage_path is nullable (PDFs are now processed in-memory, not stored)
 * Note: extracted_text is optional (populated during scraping for embedding generation)
 */
export type DocumentData = Omit<
  Database['public']['Tables']['bill_documents']['Insert'],
  'bill_id' | 'id' | 'created_at'
> & {
  extracted_text?: string | null;
};

/**
 * Nested query result types
 */
interface SponsorQueryResult {
  is_primary: boolean;
  session_legislators: {
    id: string;
    legislators: {
      id: string;
      name: string;
    };
  } | null;
}

interface CommitteeQueryResult {
  committees: {
    id: string;
    name: string;
  } | null;
}

interface BillWithSessionQuery extends Bill {
  sessions: {
    year: number;
    session_code: string;
  } | null;
}

/**
 * Database wrapper for all Supabase operations.
 */
export class DatabaseClient {
  private _client: SupabaseClient<Database>;

  /**
   * Initialize the database connection.
   *
   * @param supabaseUrl - Supabase project URL (defaults to env var SUPABASE_URL)
   * @param supabaseKey - Supabase API key (defaults to env var SUPABASE_KEY)
   * @throws {Error} If credentials are not provided
   */
  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase credentials not found. ' +
        'Set SUPABASE_URL and SUPABASE_KEY environment variables or pass them as arguments.'
      );
    }

    this._client = createClient<Database>(url, key);
  }

  /**
   * Get the Supabase client for direct access.
   *
   * This property is provided for integrations that require direct client access,
   * such as LangChain's SupabaseVectorStore.
   *
   * @returns Supabase client instance
   */
  get client(): SupabaseClient<Database> {
    return this._client;
  }

  /**
   * Get or create a session record.
   *
   * @param year - Legislative year
   * @param sessionCode - Session code ('R', 'S1', 'S2')
   * @returns Session UUID
   */
  async getOrCreateSession(year: number, sessionCode: string): Promise<string> {
    try {
      // Try to find existing session
      const { data: existingData, error: selectError } = await this._client
        .from('sessions')
        .select('id')
        .eq('year', year)
        .eq('session_code', sessionCode);

      if (selectError) throw selectError;

      if (existingData && existingData.length > 0) {
        return existingData[0].id;
      }

      // Create new session
      const { data: insertData, error: insertError } = await this._client
        .from('sessions')
        .insert({
          year,
          session_code: sessionCode,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (!insertData) throw new Error('Failed to create session');

      return insertData.id;
    } catch (error) {
      throw new Error(`Failed to get or create session: ${error}`);
    }
  }

  /**
   * Get or create a committee record.
   *
   * @param committeeName - Name of the committee
   * @returns Committee UUID
   */
  async getOrCreateCommittee(committeeName: string): Promise<string> {
    try {
      // Try to find existing committee
      const { data: existingData, error: selectError } = await this._client
        .from('committees')
        .select('id')
        .eq('name', committeeName);

      if (selectError) throw selectError;

      if (existingData && existingData.length > 0) {
        return existingData[0].id;
      }

      // Create new committee
      const { data: insertData, error: insertError } = await this._client
        .from('committees')
        .insert({
          name: committeeName,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (!insertData) throw new Error('Failed to create committee');

      return insertData.id;
    } catch (error) {
      throw new Error(`Failed to get or create committee: ${error}`);
    }
  }

  /**
   * Insert or update a legislator record.
   *
   * @param legislatorData - Object with legislator details
   * @returns Tuple of [legislator_id, was_updated]
   */
  async upsertLegislator(legislatorData: LegislatorData): Promise<[string, boolean]> {
    try {
      // Try to find existing legislator by name
      const { data: existingData, error: selectError } = await this._client
        .from('legislators')
        .select('id')
        .eq('name', legislatorData.name);

      if (selectError) throw selectError;

      const legislatorRecord = {
        name: legislatorData.name,
        legislator_type: legislatorData.legislator_type || null,
        party_affiliation: legislatorData.party_affiliation || null,
        year_elected: legislatorData.year_elected || null,
        years_served: legislatorData.years_served || null,
        picture_url: legislatorData.picture_url || null,
        is_active: legislatorData.is_active !== undefined ? legislatorData.is_active : true,
        profile_url: legislatorData.profile_url || null,
      };

      let wasUpdated = false;
      let legislatorId: string;

      if (existingData && existingData.length > 0) {
        // Update existing legislator
        legislatorId = existingData[0].id;
        const { error: updateError } = await this._client
          .from('legislators')
          .update(legislatorRecord)
          .eq('id', legislatorId);

        if (updateError) throw updateError;
        wasUpdated = true;
      } else {
        // Insert new legislator
        const { data: insertData, error: insertError } = await this._client
          .from('legislators')
          .insert(legislatorRecord)
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (!insertData) throw new Error('Failed to insert legislator');

        legislatorId = insertData.id;
      }

      return [legislatorId, wasUpdated];
    } catch (error) {
      throw new Error(`Failed to upsert legislator: ${error}`);
    }
  }

  /**
   * Create or update a session_legislators record linking a legislator to a session.
   *
   * @param sessionId - Session UUID
   * @param legislatorId - Legislator UUID
   * @param district - District number for this session
   * @returns session_legislator UUID
   */
  async linkLegislatorToSession(
    sessionId: string,
    legislatorId: string,
    district: string
  ): Promise<string> {
    try {
      // Check if this session-district mapping already exists
      const { data: existingData, error: selectError } = await this._client
        .from('session_legislators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('district', district);

      if (selectError) throw selectError;

      let sessionLegislatorId: string;

      if (existingData && existingData.length > 0) {
        // Update existing record to point to this legislator
        sessionLegislatorId = existingData[0].id;
        const { error: updateError } = await this._client
          .from('session_legislators')
          .update({ legislator_id: legislatorId })
          .eq('id', sessionLegislatorId);

        if (updateError) throw updateError;
      } else {
        // Create new session_legislator record
        const { data: insertData, error: insertError } = await this._client
          .from('session_legislators')
          .insert({
            session_id: sessionId,
            legislator_id: legislatorId,
            district,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (!insertData) throw new Error('Failed to create session_legislator');

        sessionLegislatorId = insertData.id;
      }

      return sessionLegislatorId;
    } catch (error) {
      throw new Error(`Failed to link legislator to session: ${error}`);
    }
  }

  /**
   * Look up a session_legislator by district for a specific session.
   *
   * @param sessionId - Session UUID
   * @param district - District number
   * @returns session_legislator UUID if found, null otherwise
   */
  async getSessionLegislatorByDistrict(
    sessionId: string,
    district: string
  ): Promise<string | null> {
    try {
      const { data, error } = await this._client
        .from('session_legislators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('district', district);

      if (error) throw error;

      if (data && data.length > 0) {
        return data[0].id;
      }

      return null;
    } catch (error) {
      console.error(`Failed to get session legislator by district: ${error}`);
      return null;
    }
  }

  /**
   * Look up a session_legislator by legislator name for a specific session.
   *
   * @param sessionId - Session UUID
   * @param legislatorName - Name of the legislator
   * @returns session_legislator UUID if found, null otherwise
   */
  async getSessionLegislatorByName(
    sessionId: string,
    legislatorName: string
  ): Promise<string | null> {
    try {
      // First, find the legislator by name
      const { data: legislatorData, error: legislatorError } = await this._client
        .from('legislators')
        .select('id')
        .eq('name', legislatorName);

      if (legislatorError) throw legislatorError;

      if (!legislatorData || legislatorData.length === 0) {
        return null;
      }

      const legislatorId = legislatorData[0].id;

      // Then find the session_legislator record
      const { data: sessionLegislatorData, error: sessionLegislatorError } = await this._client
        .from('session_legislators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('legislator_id', legislatorId);

      if (sessionLegislatorError) throw sessionLegislatorError;

      if (sessionLegislatorData && sessionLegislatorData.length > 0) {
        return sessionLegislatorData[0].id;
      }

      return null;
    } catch (error) {
      console.error(`Failed to get session legislator by name: ${error}`);
      return null;
    }
  }

  /**
   * Upload a PDF to Supabase Storage.
   *
   * @param pdfContent - PDF file content as Buffer or Uint8Array
   * @param storagePath - Path within bucket (e.g., "2016/R/HB1366/HB1366_Introduced.pdf")
   * @param bucketName - Storage bucket name (default: 'bill-pdfs')
   * @returns Storage path if successful, null otherwise
   */
  async uploadPdfToStorage(
    pdfContent: Buffer | Uint8Array,
    storagePath: string,
    bucketName: string = 'bill-pdfs'
  ): Promise<string | null> {
    try {
      const { error } = await this._client.storage
        .from(bucketName)
        .upload(storagePath, pdfContent, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (error) throw error;

      return storagePath;
    } catch (error) {
      console.warn(`Warning: Could not upload to storage: ${error}`);
      return null;
    }
  }

  /**
   * Download a file from Supabase Storage.
   *
   * @param storagePath - Path within bucket
   * @param bucketName - Storage bucket name (default: 'bill-pdfs')
   * @returns File content as Blob
   * @throws {Error} If download fails
   */
  async downloadFromStorage(
    storagePath: string,
    bucketName: string = 'bill-pdfs'
  ): Promise<Blob> {
    try {
      const { data, error } = await this._client.storage
        .from(bucketName)
        .download(storagePath);

      if (error) throw error;
      if (!data) throw new Error('No data returned from storage');

      return data;
    } catch (error) {
      throw new Error(`Failed to download from storage: ${error}`);
    }
  }

  /**
   * Insert or update a bill with all related data.
   *
   * This is a complex operation that handles:
   * - Bill creation/update
   * - Sponsors (primary and co-sponsors)
   * - Actions (bill history)
   * - Hearings (with committees)
   * - Documents (PDFs)
   *
   * @param sessionId - Session UUID
   * @param billRecord - Object with bill fields (bill_number, title, description, etc.)
   * @param sponsorsData - Array of objects with 'session_legislator_id' and 'is_primary'
   * @param actionsData - Array of objects with 'action_date', 'description', 'sequence_order'
   * @param hearingsData - Array of objects with committee and hearing details
   * @param documentsData - Array of objects with 'document_type', 'document_url', 'storage_path'
   * @returns Tuple of [bill_id, was_updated]
   */
  async upsertBill(
    sessionId: string,
    billRecord: Omit<BillInsert, 'session_id'>,
    sponsorsData?: SponsorData[],
    actionsData?: ActionData[],
    hearingsData?: HearingData[],
    documentsData?: DocumentData[]
  ): Promise<[string, boolean]> {
    try {
      // Ensure session_id is in bill_record
      const billRecordWithSession = {
        ...billRecord,
        session_id: sessionId,
      };

      // Check if bill already exists
      const { data: existingBill, error: selectError } = await this._client
        .from('bills')
        .select('id')
        .eq('bill_number', billRecord.bill_number)
        .eq('session_id', sessionId);

      if (selectError) throw selectError;

      let billId: string;
      let wasUpdated = false;

      if (existingBill && existingBill.length > 0) {
        // Update existing bill
        billId = existingBill[0].id;
        wasUpdated = true;

        const { error: updateError } = await this._client
          .from('bills')
          .update(billRecordWithSession)
          .eq('id', billId);

        if (updateError) throw updateError;

        // Delete existing related data to re-insert fresh data
        await this._client.from('bill_sponsors').delete().eq('bill_id', billId);
        await this._client.from('bill_actions').delete().eq('bill_id', billId);
        await this._client.from('bill_hearings').delete().eq('bill_id', billId);
        await this._client.from('bill_documents').delete().eq('bill_id', billId);
      } else {
        // Insert new bill
        const { data: insertData, error: insertError } = await this._client
          .from('bills')
          .insert(billRecordWithSession)
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (!insertData) throw new Error('Failed to insert bill');

        billId = insertData.id;
      }

      // Insert sponsors
      if (sponsorsData && sponsorsData.length > 0) {
        for (const sponsor of sponsorsData) {
          if (sponsor.session_legislator_id) {
            try {
              await this._client.from('bill_sponsors').insert({
                bill_id: billId,
                session_legislator_id: sponsor.session_legislator_id,
                is_primary: sponsor.is_primary || false,
              });
            } catch (error) {
              console.warn(`Warning: Could not insert sponsor: ${error}`);
            }
          }
        }
      }

      // Insert actions
      if (actionsData && actionsData.length > 0) {
        for (const action of actionsData) {
          try {
            await this._client.from('bill_actions').insert({
              bill_id: billId,
              action_date: action.action_date,
              description: action.description,
              sequence_order: action.sequence_order || 0,
            });
          } catch (error) {
            console.warn(`Warning: Could not insert action: ${error}`);
          }
        }
      }

      // Insert hearings
      if (hearingsData && hearingsData.length > 0) {
        for (const hearing of hearingsData) {
          try {
            // Get or create committee
            const committeeId = await this.getOrCreateCommittee(hearing.committee_name);

            const hearingRecord: Database['public']['Tables']['bill_hearings']['Insert'] = {
              bill_id: billId,
              committee_id: committeeId,
              hearing_date: hearing.hearing_date || null,
              hearing_time: hearing.hearing_time || null,
              location: hearing.location || null,
              hearing_time_text: hearing.hearing_time_text || null,
            };

            await this._client.from('bill_hearings').insert(hearingRecord);
          } catch (error) {
            console.warn(`Warning: Could not insert hearing: ${error}`);
          }
        }
      }

      // Insert documents
      if (documentsData && documentsData.length > 0) {
        for (const doc of documentsData) {
          try {
            await this._client.from('bill_documents').insert({
              bill_id: billId,
              document_type: doc.document_type,
              document_url: doc.document_url,
              storage_path: doc.storage_path || null,
              extracted_text: doc.extracted_text || null,
            });
          } catch (error) {
            console.warn(`Warning: Could not insert document: ${error}`);
          }
        }
      }

      return [billId, wasUpdated];
    } catch (error) {
      throw new Error(`Failed to upsert bill: ${error}`);
    }
  }

  /**
   * Get all bills for a specific session.
   *
   * @param sessionId - Session UUID
   * @param limit - Optional limit on number of bills to return
   * @param skipEmbedded - If true, only return bills without embeddings
   * @returns Array of bill records with id and bill_number
   */
  async getBillsForSession(
    sessionId: string,
    limit?: number,
    skipEmbedded: boolean = false
  ): Promise<Array<{ id: string; bill_number: string; embeddings_generated: boolean | null }>> {
    try {
      let query = this._client
        .from('bills')
        .select('id, bill_number, embeddings_generated')
        .eq('session_id', sessionId);

      if (skipEmbedded) {
        query = query.or('embeddings_generated.is.null,embeddings_generated.eq.false');
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new Error(`Failed to get bills for session: ${error}`);
    }
  }

  /**
   * Check if a bill already has documents with extracted text.
   *
   * @param billId - Bill UUID
   * @returns True if bill has at least one document with extracted_text
   */
  async billHasExtractedText(billId: string): Promise<boolean> {
    try {
      const { data, error } = await this._client
        .from('bill_documents')
        .select('id')
        .eq('bill_id', billId)
        .not('extracted_text', 'is', null)
        .limit(1);

      if (error) throw error;

      return (data && data.length > 0) || false;
    } catch (error) {
      console.error(`Failed to check bill documents: ${error}`);
      return false;
    }
  }

  /**
   * Check if a bill exists by bill number and session.
   *
   * @param billNumber - Bill number (e.g., "HB 1366")
   * @param sessionId - Session UUID
   * @returns Bill ID if exists, null otherwise
   */
  async getBillIdByNumber(billNumber: string, sessionId: string): Promise<string | null> {
    try {
      const { data, error } = await this._client
        .from('bills')
        .select('id')
        .eq('bill_number', billNumber)
        .eq('session_id', sessionId)
        .limit(1);

      if (error) throw error;

      return data && data.length > 0 ? data[0].id : null;
    } catch (error) {
      console.error(`Failed to get bill ID: ${error}`);
      return null;
    }
  }

  /**
   * Get all documents for a specific bill.
   *
   * @param billId - Bill UUID
   * @returns Array of document records
   */
  async getBillDocuments(billId: string): Promise<BillDocument[]> {
    try {
      const { data, error } = await this._client
        .from('bill_documents')
        .select('*')
        .eq('bill_id', billId);

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new Error(`Failed to get bill documents: ${error}`);
    }
  }

  /**
   * Get documents that should be embedded for a bill.
   *
   * Returns "Introduced" version and the most recent version (if different).
   * Excludes fiscal notes (*.ORG.pdf files).
   *
   * Document hierarchy (most to least recent):
   * 1. Truly Agreed (final version)
   * 2. Senate Committee Substitute
   * 3. Perfected (passed House)
   * 4. Committee (with amendments)
   * 5. Introduced (original)
   *
   * @param billId - Bill UUID
   * @returns Array of 1-2 document records to embed
   */
  async getEmbeddableBillDocuments(billId: string): Promise<BillDocument[]> {
    try {
      const allDocs = await this.getBillDocuments(billId);

      // Filter out fiscal notes (contain .ORG in storage path or document type)
      // Include documents with either storage_path or extracted_text (new flow doesn't use storage)
      const legislativeDocs = allDocs.filter((doc) => {
        const hasContent = doc.storage_path || doc.extracted_text;
        const isFiscalNote = doc.storage_path?.includes('.ORG') || doc.document_url?.includes('.ORG');
        return hasContent && !isFiscalNote;
      });

      if (legislativeDocs.length === 0) {
        return [];
      }

      // Document type hierarchy for determining most recent
      const hierarchy = [
        'truly agreed',
        'truly_agreed',
        'senate_comm_sub',
        'senate comm sub',
        'senate committee substitute',
        'perfected',
        'committee',
        'introduced',
      ];

      // Find introduced version
      let introduced: BillDocument | null = null;
      for (const doc of legislativeDocs) {
        const docTypeLower = (doc.document_type || '').toLowerCase();
        if (docTypeLower.includes('introduced')) {
          introduced = doc;
          break;
        }
      }

      // Find most recent version based on hierarchy
      let mostRecent: BillDocument | null = null;
      for (const priorityType of hierarchy) {
        for (const doc of legislativeDocs) {
          const docTypeLower = (doc.document_type || '').toLowerCase().replace(/ /g, '_');
          if (docTypeLower.includes(priorityType)) {
            mostRecent = doc;
            break;
          }
        }
        if (mostRecent) {
          break;
        }
      }

      // Return introduced + most recent (deduplicated)
      const result: BillDocument[] = [];
      if (introduced) {
        result.push(introduced);
      }
      if (mostRecent && mostRecent !== introduced) {
        result.push(mostRecent);
      }

      // If we didn't find either, return the first legislative doc
      if (result.length === 0 && legislativeDocs.length > 0) {
        result.push(legislativeDocs[0]);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to get embeddable bill documents: ${error}`);
    }
  }

  /**
   * Get bill metadata for embedding generation.
   *
   * Fetches bill info, session, sponsors, and committees for use in embeddings metadata.
   *
   * @param billId - Bill UUID
   * @returns Object with bill metadata for embeddings or null if bill not found
   */
  async getBillMetadataForEmbeddings(billId: string): Promise<{
    bill_id: string;
    bill_number: string;
    session_year: number;
    session_code: string;
    primary_sponsor: {
      id: string;
      name: string;
    } | null;
    cosponsors: Array<{
      id: string;
      name: string;
    }>;
    committees: Array<{
      id: string;
      name: string;
    }>;
  } | null> {
    try {
      // Get bill with session info
      const { data: billData, error: billError } = await this._client
        .from('bills')
        .select('id, bill_number, session_id, sessions(year, session_code)')
        .eq('id', billId)
        .single();

      if (billError) throw billError;
      if (!billData) return null;

      // Get primary sponsor
      let primarySponsor: { id: string; name: string } | null = null;
      const { data: primarySponsorData, error: primarySponsorError } = await this._client
        .from('bill_sponsors')
        .select('is_primary, session_legislators(id, legislators(id, name))')
        .eq('bill_id', billId)
        .eq('is_primary', true);

      if (primarySponsorError) throw primarySponsorError;

      const typedPrimarySponsor = primarySponsorData as unknown as SponsorQueryResult[];
      if (typedPrimarySponsor && typedPrimarySponsor.length > 0) {
        const sl = typedPrimarySponsor[0].session_legislators;
        if (sl && sl.legislators) {
          primarySponsor = {
            id: sl.legislators.id,
            name: sl.legislators.name,
          };
        }
      }

      // Get co-sponsors
      const cosponsors: Array<{ id: string; name: string }> = [];
      const { data: cosponsorsData, error: cosponsorsError } = await this._client
        .from('bill_sponsors')
        .select('is_primary, session_legislators(id, legislators(id, name))')
        .eq('bill_id', billId)
        .eq('is_primary', false);

      if (cosponsorsError) throw cosponsorsError;

      const typedCosponsors = cosponsorsData as unknown as SponsorQueryResult[];
      if (typedCosponsors) {
        for (const sponsor of typedCosponsors) {
          const sl = sponsor.session_legislators;
          if (sl && sl.legislators) {
            cosponsors.push({
              id: sl.legislators.id,
              name: sl.legislators.name,
            });
          }
        }
      }

      // Get committees from hearings
      const committees: Array<{ id: string; name: string }> = [];
      const { data: committeesData, error: committeesError } = await this._client
        .from('bill_hearings')
        .select('committees(id, name)')
        .eq('bill_id', billId);

      if (committeesError) throw committeesError;

      const typedCommittees = committeesData as unknown as CommitteeQueryResult[];
      if (typedCommittees) {
        const seenCommitteeIds = new Set<string>();
        for (const hearing of typedCommittees) {
          const comm = hearing.committees;
          if (comm && !seenCommitteeIds.has(comm.id)) {
            committees.push({
              id: comm.id,
              name: comm.name,
            });
            seenCommitteeIds.add(comm.id);
          }
        }
      }

      const typedBillData = billData as unknown as BillWithSessionQuery;
      const sessions = typedBillData.sessions;

      return {
        bill_id: billData.id,
        bill_number: billData.bill_number,
        session_year: sessions?.year || 0,
        session_code: sessions?.session_code || '',
        primary_sponsor: primarySponsor,
        cosponsors,
        committees,
      };
    } catch (error) {
      throw new Error(`Failed to get bill metadata for embeddings: ${error}`);
    }
  }

  /**
   * Mark a bill as having embeddings generated.
   *
   * @param billId - Bill UUID
   */
  async markBillEmbeddingsGenerated(billId: string): Promise<void> {
    try {
      const { error } = await this._client
        .from('bills')
        .update({
          embeddings_generated: true,
          embeddings_generated_at: new Date().toISOString(),
        })
        .eq('id', billId);

      if (error) throw error;
    } catch (error) {
      throw new Error(`Failed to mark bill embeddings as generated: ${error}`);
    }
  }
}

// Singleton instance
let dbInstance: DatabaseClient | null = null;

/**
 * Get or create the singleton Database instance.
 *
 * @returns Database instance
 */
export function getDatabase(): DatabaseClient {
  if (!dbInstance) {
    dbInstance = new DatabaseClient();
  }
  return dbInstance;
}

/**
 * Get the Supabase client directly (for compatibility with existing code).
 *
 * @returns Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  return getDatabase().client;
}
