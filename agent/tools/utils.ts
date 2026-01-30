/**
 * Shared utility functions for agent tools.
 */

/**
 * Normalize bill number to match database format (e.g., "HB1366" -> "HB 1366")
 */
export function normalizeBillNumber(billNumber: string): string {
  const cleaned = billNumber.toUpperCase().trim();
  return cleaned.replace(/^([A-Z]+)(\d+)$/, '$1 $2');
}
