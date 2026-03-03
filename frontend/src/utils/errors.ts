/**
 * Extract user-friendly error message from API error response
 */
export const extractErrorMessage = (
  error: unknown,
  defaultMessage = 'An unexpected error occurred'
): string => {
  if (error && typeof error === 'object') {
    const err = error as { response?: { data?: { error?: string } } };
    if (err.response?.data?.error) {
      return err.response.data.error;
    }
  }
  return defaultMessage;
};

/**
 * Extract validation error messages from Zod error response
 */
export const extractValidationErrors = (error: unknown): string[] => {
  if (error && typeof error === 'object') {
    const err = error as { response?: { data?: { error?: { issues?: Array<{ message: string }> } } } };
    if (err.response?.data?.error?.issues) {
      return err.response.data.error.issues.map((issue) => issue.message);
    }
  }
  return [];
};
