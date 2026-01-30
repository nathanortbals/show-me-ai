import { getSupabaseClient } from '@/database/client';
import type { BillDetails, TimelineEvent } from '@/app/types/bill';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ error: 'Bill ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Fetch bill with session
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .select(`
        id,
        bill_number,
        title,
        description,
        lr_number,
        last_action,
        proposed_effective_date,
        bill_url,
        sessions(year, session_code)
      `)
      .eq('id', id)
      .single();

    if (billError || !bill) {
      return Response.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Fetch sponsors
    const { data: sponsorsData } = await supabase
      .from('bill_sponsors')
      .select(`
        is_primary,
        session_legislators(
          district,
          legislators(name, party_affiliation, picture_url)
        )
      `)
      .eq('bill_id', id)
      .order('is_primary', { ascending: false });

    const sponsors = (sponsorsData || [])
      .map((s: any) => ({
        name: s.session_legislators?.legislators?.name || 'Unknown',
        party: s.session_legislators?.legislators?.party_affiliation || null,
        district: s.session_legislators?.district || null,
        picture_url: s.session_legislators?.legislators?.picture_url || null,
        is_primary: s.is_primary,
      }))
      .filter((s: any) => s.name !== 'Unknown');

    // Fetch actions
    const { data: actionsData } = await supabase
      .from('bill_actions')
      .select('id, action_date, description, sequence_order')
      .eq('bill_id', id)
      .order('sequence_order', { ascending: true });

    // Fetch hearings
    const { data: hearingsData } = await supabase
      .from('bill_hearings')
      .select(`
        id,
        hearing_date,
        hearing_time_text,
        location,
        committees(name)
      `)
      .eq('bill_id', id)
      .order('hearing_date', { ascending: true });

    // Fetch documents
    const { data: documentsData } = await supabase
      .from('bill_documents')
      .select('id, document_id, document_title, document_type, document_url')
      .eq('bill_id', id);

    const documents = (documentsData || []).map((d: any) => ({
      id: d.document_id,
      title: d.document_title,
      type: d.document_type,
      url: d.document_url,
    }));

    // Create a map of document types for linking to timeline
    const documentsByType = new Map<string, typeof documents[0]>();
    for (const doc of documents) {
      // Use the document type as key (e.g., "Introduced", "Perfected", "Third Read")
      documentsByType.set(doc.type.toLowerCase(), doc);
    }

    // Helper to find associated document for an action
    const findDocumentForAction = (description: string): typeof documents[0] | null => {
      const descLower = description.toLowerCase();
      if (descLower.includes('introduced') || descLower.includes('prefiled')) {
        return documentsByType.get('introduced') || documentsByType.get('bill text') || null;
      }
      if (descLower.includes('perfected')) {
        return documentsByType.get('perfected') || null;
      }
      if (descLower.includes('third read')) {
        return documentsByType.get('third read') || null;
      }
      return null;
    };

    // Build timeline from actions
    const timeline: TimelineEvent[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Add actions to timeline
    for (const action of actionsData || []) {
      const associatedDoc = findDocumentForAction(action.description);
      timeline.push({
        id: `action-${action.id}`,
        type: 'action',
        status: 'completed',
        date: action.action_date,
        title: action.description,
        document: associatedDoc ? {
          id: associatedDoc.id,
          title: associatedDoc.title,
          url: associatedDoc.url,
        } : null,
      });
    }

    // Add hearings to timeline
    for (const hearing of hearingsData || []) {
      const hearingDate = hearing.hearing_date;
      const isUpcoming = hearingDate && hearingDate >= today;

      timeline.push({
        id: `hearing-${hearing.id}`,
        type: 'hearing',
        status: isUpcoming ? 'scheduled' : 'completed',
        date: hearing.hearing_date,
        title: 'Committee Hearing',
        committee: (hearing.committees as any)?.name || 'Unknown Committee',
        time: hearing.hearing_time_text,
        location: hearing.location,
      });
    }

    // Sort timeline by date (nulls last), then by type (actions before hearings on same day)
    timeline.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // Same date: actions before hearings
      if (a.type === 'action' && b.type === 'hearing') return -1;
      if (a.type === 'hearing' && b.type === 'action') return 1;
      return 0;
    });

    // Determine chamber from bill number
    const chamber: 'house' | 'senate' = bill.bill_number.startsWith('S') ? 'senate' : 'house';

    // Build response
    const session = bill.sessions as any;
    const response: BillDetails = {
      id: bill.id,
      bill_number: bill.bill_number,
      title: bill.title,
      description: bill.description,
      lr_number: bill.lr_number,
      last_action: bill.last_action,
      proposed_effective_date: bill.proposed_effective_date,
      bill_url: bill.bill_url,
      chamber,
      session: session ? {
        year: session.year,
        session_code: session.session_code,
      } : null,
      sponsors,
      timeline,
      documents,
    };

    return Response.json(response);
  } catch (error) {
    console.error('[bills] Error fetching bill details:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
