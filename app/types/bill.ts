// Timeline event types
export type TimelineEventType = 'action' | 'hearing' | 'future';
export type TimelineEventStatus = 'completed' | 'scheduled' | 'future';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  status: TimelineEventStatus;
  date: string | null;
  title: string;
  description?: string;
  // For hearings
  time?: string | null;
  location?: string | null;
  committee?: string;
  // Associated document
  document?: {
    id: string;
    title: string;
    url: string;
  } | null;
}

// Bill details returned by the API
export interface BillDetails {
  id: string;
  bill_number: string;
  title: string | null;
  lr_number: string | null;
  last_action: string | null;
  proposed_effective_date: string | null;
  bill_url: string | null;
  chamber: 'house' | 'senate';
  session: {
    year: number;
    session_code: string;
  } | null;
  sponsors: Array<{
    id: string;
    name: string;
    party: string | null;
    district: string | null;
    picture_url: string | null;
    is_primary: boolean;
  }>;
  timeline: TimelineEvent[];
  documents: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
  }>;
}
