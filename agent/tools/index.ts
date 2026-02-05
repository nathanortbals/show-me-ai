/**
 * Agent tools index - exports all tools and the getTools function.
 */

// Export individual tools
export { searchBillsSemantic } from './searchBillsSemantic';
export { getBillByNumber } from './getBillByNumber';
export { getLegislatorInfo } from './getLegislatorInfo';
export { getLegislatorBills } from './getLegislatorBills';
export { getBillTimeline } from './getBillTimeline';
export { getCommitteeInfo } from './getCommitteeInfo';
export { getCommitteeHearings } from './getCommitteeHearings';
export { searchBillsByYear } from './searchBillsByYear';
export { searchBillsByMilestone } from './searchBillsByMilestone';

// Export utils for potential use by other modules
export * from './utils';

// Import tools for getTools function
import { searchBillsSemantic } from './searchBillsSemantic';
import { getBillByNumber } from './getBillByNumber';
import { getLegislatorInfo } from './getLegislatorInfo';
import { getLegislatorBills } from './getLegislatorBills';
import { getBillTimeline } from './getBillTimeline';
import { getCommitteeInfo } from './getCommitteeInfo';
import { getCommitteeHearings } from './getCommitteeHearings';
import { searchBillsByYear } from './searchBillsByYear';
import { searchBillsByMilestone } from './searchBillsByMilestone';

/**
 * Get all agent tools
 */
export function getTools() {
  return [
    searchBillsSemantic,
    getBillByNumber,
    getLegislatorInfo,
    getLegislatorBills,
    getBillTimeline,
    getCommitteeInfo,
    getCommitteeHearings,
    searchBillsByYear,
    searchBillsByMilestone,
  ];
}
