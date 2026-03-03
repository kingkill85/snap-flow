/**
 * Format a number as currency string
 */
export const formatCurrency = (
  amount: number,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string => {
  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  });
};

/**
 * Format currency with $ prefix
 */
export const formatCurrencyWithSymbol = (
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string => {
  return `$${formatCurrency(amount, options)}`;
};
