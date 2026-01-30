'use client';

import { useEffect, useState } from 'react';
import type { BillDetails } from '@/app/types/bill';
import LoadingSpinner from '../LoadingSpinner';
import BillHeader from './BillHeader';
import BillDetailsSection from './BillDetailsSection';
import BillSponsorsSection from './BillSponsorsSection';
import BillTimelineSection from './BillTimelineSection';
import BillDocumentsSection from './BillDocumentsSection';

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
    return <LoadingSpinner message="Loading bill details..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-900/50 px-4 py-3 text-red-200">{error}</div>
    );
  }

  if (!bill) return null;

  // Get submitted date (first action date)
  const submittedDate = bill.timeline.find((e) => e.type === 'action')?.date || null;

  return (
    <div className="space-y-6">
      <BillHeader bill={bill} />
      <BillDetailsSection bill={bill} submittedDate={submittedDate} />
      <BillSponsorsSection sponsors={bill.sponsors} />
      <BillTimelineSection timeline={bill.timeline} chamber={bill.chamber} />
      <BillDocumentsSection documents={bill.documents} />
    </div>
  );
}
