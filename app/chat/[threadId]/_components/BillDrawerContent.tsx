'use client';

import { useEffect, useState } from 'react';

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

interface BillDrawerContentProps {
  billId: string;
  onTitleChange?: (title: string) => void;
}

export default function BillDrawerContent({ billId, onTitleChange }: BillDrawerContentProps) {
  const [bill, setBill] = useState<BillDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBill() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/bills/${billId}`);
        if (!response.ok) {
          throw new Error('Bill not found');
        }
        const data = await response.json();
        setBill(data);
        onTitleChange?.(data.bill_number);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bill');
      } finally {
        setIsLoading(false);
      }
    }

    fetchBill();
  }, [billId, onTitleChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-neutral-500">
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading bill details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-900/50 px-4 py-3 text-red-200">{error}</div>
    );
  }

  if (!bill) return null;

  return (
    <div className="space-y-6">
      {/* Session Badge */}
      {bill.session && (
        <div className="inline-block rounded-full bg-blue-900/50 px-3 py-1 text-sm text-blue-200">
          {bill.session.year}{' '}
          {bill.session.session_code === 'R'
            ? 'Regular Session'
            : `Special Session ${bill.session.session_code}`}
        </div>
      )}

      {/* Title & Description */}
      <div>
        <h3 className="text-xl font-semibold text-white">{bill.title || 'No title'}</h3>
        {bill.description && <p className="mt-2 text-neutral-300">{bill.description}</p>}
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {bill.lr_number && (
          <div>
            <span className="text-neutral-500">LR Number</span>
            <p className="text-neutral-200">{bill.lr_number}</p>
          </div>
        )}
        {bill.proposed_effective_date && (
          <div>
            <span className="text-neutral-500">Effective Date</span>
            <p className="text-neutral-200">{bill.proposed_effective_date}</p>
          </div>
        )}
        {bill.last_action && (
          <div className="col-span-2">
            <span className="text-neutral-500">Last Action</span>
            <p className="text-neutral-200">{bill.last_action}</p>
          </div>
        )}
      </div>

      {/* External Link */}
      {bill.bill_url && (
        <a
          href={bill.bill_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          View on Missouri House website
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      )}

      {/* Sponsors */}
      {bill.sponsors.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Sponsors
          </h4>
          <div className="space-y-1">
            {bill.sponsors.map((sponsor, i) => (
              <div key={i} className="flex items-center gap-2 text-neutral-200">
                <span>{sponsor.name}</span>
                {sponsor.party && <span className="text-neutral-500">({sponsor.party})</span>}
                {sponsor.is_primary && (
                  <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {bill.documents.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Documents
          </h4>
          <div className="space-y-2">
            {bill.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-5 w-5 text-neutral-500"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span>{doc.title}</span>
                <span className="ml-auto text-neutral-500">{doc.type}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Hearings */}
      {bill.hearings.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Hearings
          </h4>
          <div className="space-y-3">
            {bill.hearings.map((hearing, i) => (
              <div key={i} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">
                <div className="font-medium text-neutral-200">{hearing.committee}</div>
                <div className="text-neutral-400">
                  {hearing.date || 'Date TBD'}
                  {hearing.time && ` at ${hearing.time}`}
                </div>
                {hearing.location && <div className="text-neutral-500">{hearing.location}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions Timeline */}
      {bill.actions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Legislative Timeline
          </h4>
          <div className="space-y-2">
            {bill.actions.map((action, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 text-neutral-500">{action.date || 'N/A'}</span>
                <span className="text-neutral-300">{action.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
