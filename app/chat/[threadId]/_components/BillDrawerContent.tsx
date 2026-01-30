'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { BillDetails, TimelineEvent } from '@/app/types/bill';

interface BillDrawerContentProps {
  billId: string;
  onTitleChange?: (title: string) => void;
}

// Collapsible section component
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="-mx-6 border-t border-neutral-800 px-6 pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h4 className="text-sm font-bold uppercase tracking-wide text-neutral-500">{title}</h4>
        <svg
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'mt-3 max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// Future steps based on chamber
const HOUSE_FUTURE_STEPS = [
  'Passed House',
  'Senate First Read',
  'Senate Committee',
  'Passed Senate',
  'Governor Action',
];

const SENATE_FUTURE_STEPS = [
  'Passed Senate',
  'House First Read',
  'House Committee',
  'Passed House',
  'Governor Action',
];

// Keywords to detect completed stages
const STAGE_KEYWORDS: Record<string, string[]> = {
  'Passed House': ['passed house', 'third read and passed'],
  'Passed Senate': ['passed senate'],
  'Senate First Read': ['read first time in senate', 'senate first read'],
  'House First Read': ['read first time in house', 'house first read'],
  'Governor Action': ['signed by governor', 'vetoed', 'became law'],
  'Senate Committee': ['referred to senate committee'],
  'House Committee': ['referred to house committee', 'referred to committee'],
};

function hasCompletedStage(timeline: TimelineEvent[], stage: string): boolean {
  const keywords = STAGE_KEYWORDS[stage] || [];
  return timeline.some((event) =>
    keywords.some((keyword) => event.title.toLowerCase().includes(keyword))
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Timeline node component
function TimelineNode({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const isCompleted = event.status === 'completed';
  const isScheduled = event.status === 'scheduled';
  const isFuture = event.status === 'future';

  return (
    <div className="relative flex gap-3">
      {/* Vertical line connector */}
      {!isLast && (
        <div
          className={`absolute left-[9px] top-5 h-full w-0.5 ${
            isFuture ? 'bg-neutral-700' : 'bg-blue-500/30'
          }`}
        />
      )}

      {/* Node circle */}
      <div className="relative z-10 mt-1 shrink-0">
        {isCompleted && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {isScheduled && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-500/20">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
        )}
        {isFuture && (
          <div className="h-5 w-5 rounded-full border-2 border-neutral-600 bg-neutral-800" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isLast ? '' : 'pb-4'} ${isFuture ? 'opacity-50' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                isFuture ? 'text-neutral-500' : 'text-neutral-200'
              }`}
            >
              {event.title}
            </p>
            {event.type === 'hearing' && event.committee && (
              <p className="mt-0.5 text-xs text-neutral-400">{event.committee}</p>
            )}
            {event.type === 'hearing' && (event.time || event.location) && (
              <p className="mt-0.5 text-xs text-neutral-500">
                {event.time}
                {event.time && event.location && ' · '}
                {event.location}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {event.date && (
              <span
                className={`text-xs ${
                  isScheduled
                    ? 'font-medium text-amber-400'
                    : isFuture
                      ? 'text-neutral-600'
                      : 'text-neutral-500'
                }`}
              >
                {formatDate(event.date)}
              </span>
            )}
            {isFuture && !event.date && (
              <span className="text-xs text-neutral-600">—</span>
            )}
          </div>
        </div>

        {/* Associated document */}
        {event.document && (
          <a
            href={event.document.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-neutral-800 px-2 py-1 text-xs text-blue-400 hover:bg-neutral-700 hover:text-blue-300 transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            View {event.document.title}
          </a>
        )}
      </div>
    </div>
  );
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

  // Build full timeline with future steps
  const futureSteps = bill.chamber === 'house' ? HOUSE_FUTURE_STEPS : SENATE_FUTURE_STEPS;
  const fullTimeline: TimelineEvent[] = [...bill.timeline];

  // Add future steps that haven't been completed yet
  for (const step of futureSteps) {
    if (!hasCompletedStage(bill.timeline, step)) {
      fullTimeline.push({
        id: `future-${step}`,
        type: 'future',
        status: 'future',
        date: null,
        title: step,
      });
    }
  }

  // Get primary sponsor
  const primarySponsor = bill.sponsors.find((s) => s.is_primary);
  const cosponsors = bill.sponsors.filter((s) => !s.is_primary);

  // Get submitted date (first action date)
  const submittedDate = bill.timeline.find((e) => e.type === 'action')?.date || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {/* Session & Chamber badges with external link */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {bill.session && (
              <span className="inline-block rounded-full bg-blue-900/50 px-2.5 py-0.5 text-xs font-medium text-blue-200">
                {bill.session.year}{' '}
                {bill.session.session_code === 'R'
                  ? 'Regular'
                  : `Special ${bill.session.session_code}`}
              </span>
            )}
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                bill.chamber === 'house'
                  ? 'bg-emerald-900/50 text-emerald-200'
                  : 'bg-purple-900/50 text-purple-200'
              }`}
            >
              {bill.chamber === 'house' ? 'House' : 'Senate'}
            </span>
          </div>
          {bill.bill_url && (
            <a
              href={bill.bill_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View on house.mo.gov
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold leading-snug text-white">
          {bill.title || 'No title available'}
        </h3>

        {/* Description - only show if it adds info beyond the title */}
        {bill.description &&
          bill.title &&
          !bill.description.includes(bill.title) && (
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {bill.description}
            </p>
          )}
      </div>

      {/* Details */}
      <CollapsibleSection title="Details">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {bill.lr_number && (
            <div>
              <p className="text-neutral-500">LR Number</p>
              <p className="text-neutral-200">{bill.lr_number}</p>
            </div>
          )}
          {submittedDate && (
            <div>
              <p className="text-neutral-500">Submitted On</p>
              <p className="text-neutral-200">{formatDate(submittedDate)}</p>
            </div>
          )}
          {bill.last_action && (
            <div className="col-span-2">
              <p className="text-neutral-500">Last Action</p>
              <p className="text-neutral-200">{bill.last_action}</p>
            </div>
          )}
          {bill.proposed_effective_date && (
            <div>
              <p className="text-neutral-500">Proposed Effective Date</p>
              <p className="text-neutral-200">{bill.proposed_effective_date}</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Sponsors */}
      {bill.sponsors.length > 0 && (
        <CollapsibleSection title="Sponsors">
          <div className="space-y-3">
            {/* Primary Sponsor */}
            {primarySponsor && (
              <div className="flex items-center gap-3">
                {primarySponsor.picture_url ? (
                  <Image
                    src={primarySponsor.picture_url}
                    alt={primarySponsor.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover bg-neutral-800"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-500">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="font-medium text-neutral-200">{primarySponsor.name}</p>
                  <p className="text-sm text-neutral-500">
                    {primarySponsor.district && `District ${primarySponsor.district}`}
                    {primarySponsor.district && primarySponsor.party && ' · '}
                    {primarySponsor.party}
                  </p>
                </div>
              </div>
            )}

            {/* Cosponsors */}
            {cosponsors.length > 0 && (
              <div className="text-sm">
                <span className="text-neutral-500">Co-sponsors: </span>
                <span className="text-neutral-400">
                  {cosponsors
                    .map((s) => `${s.name}${s.party ? ` (${s.party})` : ''}`)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Timeline */}
      <CollapsibleSection title="Legislative Progress">
        <div className="rounded-lg bg-neutral-900/50 px-4 pt-4">
          {fullTimeline.length > 0 ? (
            fullTimeline.map((event, index) => (
              <TimelineNode
                key={event.id}
                event={event}
                isLast={index === fullTimeline.length - 1}
              />
            ))
          ) : (
            <p className="text-sm text-neutral-500">No timeline events available</p>
          )}
        </div>
      </CollapsibleSection>

      {/* All Documents */}
      {bill.documents.length > 0 && (
        <CollapsibleSection title="Documents">
          <div className="space-y-1.5">
            {bill.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-neutral-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span className="flex-1 truncate">{doc.title}</span>
                <span className="shrink-0 text-xs text-neutral-500">{doc.type}</span>
              </a>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
