/**
 * Extract user-friendly error message from API error response
 */
export const extractErrorMessage = (
  error: unknown,
  defaultMessage = 'An unexpected error occurred'
): string => {
  if (error && typeof error === 'object') {
    const err = error as { 
      response?: { 
        data?: { 
          error?: string | { issues?: Array<{ message: string }>; name?: string } 
        } 
      } 
    };
    const errorData = err.response?.data?.error;
    if (errorData) {
      // Handle Zod validation errors with issues
      if (typeof errorData === 'object' && errorData.issues && Array.isArray(errorData.issues)) {
        return errorData.issues.map((issue) => issue.message).join(', ');
      }
      // Handle simple string errors
      if (typeof errorData === 'string') {
        return errorData;
      }
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
