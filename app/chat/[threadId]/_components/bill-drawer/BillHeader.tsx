import type { BillDetails } from '@/app/types/bill';

interface BillHeaderProps {
  bill: BillDetails;
}

export default function BillHeader({ bill }: BillHeaderProps) {
  return (
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
    </div>
  );
}
