import { getSupabaseClient } from '@/database/client';

// Type for bill with all related data
interface BillDetails {
  id: string;
  bill_number: string;
  title: string | null;
  description: string | null;
  lr_number: string | null;
  last_action: string | null;
  proposed_effective_date: string | null;
  bill_url: string | null;
  session: {
    year: number;
    session_code: string;
  } | null;
  sponsors: Array<{
    name: string;
    party: string | null;
    is_primary: boolean;
  }>;
  actions: Array<{
    date: string | null;
    description: string;
  }>;
  hearings: Array<{
    committee: string;
    date: string | null;
    time: string | null;
    location: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
  }>;
}

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
          legislators(name, party_affiliation)
        )
      `)
      .eq('bill_id', id)
      .order('is_primary', { ascending: false });

    const sponsors = (sponsorsData || [])
      .map((s: any) => ({
        name: s.session_legislators?.legislators?.name || 'Unknown',
        party: s.session_legislators?.legislators?.party_affiliation || null,
        is_primary: s.is_primary,
      }))
      .filter((s: any) => s.name !== 'Unknown');

    // Fetch actions
    const { data: actionsData } = await supabase
      .from('bill_actions')
      .select('action_date, description')
      .eq('bill_id', id)
      .order('sequence_order', { ascending: true });

    const actions = (actionsData || []).map((a: any) => ({
      date: a.action_date,
      description: a.description,
    }));

    // Fetch hearings
    const { data: hearingsData } = await supabase
      .from('bill_hearings')
      .select(`
        hearing_date,
        hearing_time_text,
        location,
        committees(name)
      `)
      .eq('bill_id', id)
      .order('hearing_date', { ascending: false });

    const hearings = (hearingsData || []).map((h: any) => ({
      committee: h.committees?.name || 'Unknown Committee',
      date: h.hearing_date,
      time: h.hearing_time_text,
      location: h.location,
    }));

    // Fetch documents
    const { data: documentsData } = await supabase
      .from('bill_documents')
      .select('document_id, document_title, document_type, document_url')
      .eq('bill_id', id);

    const documents = (documentsData || []).map((d: any) => ({
      id: d.document_id,
      title: d.document_title,
      type: d.document_type,
      url: d.document_url,
    }));

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
      session: session ? {
        year: session.year,
        session_code: session.session_code,
      } : null,
      sponsors,
      actions,
      hearings,
      documents,
    };

    return Response.json(response);
  } catch (error) {
    console.error('[bills] Error fetching bill details:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
