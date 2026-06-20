/**
 * Helper utility to extract a user-friendly error message from axios/API response errors.
 * Parses detailed Zod validation messages when present.
 */
export const getErrorMessage = (err: any, fallbackMessage: string): string => {
  if (err?.response?.data?.error) {
    const errorObj = err.response.data.error;
    if (errorObj.code === 'VALIDATION_ERROR' && Array.isArray(errorObj.details)) {
      const fieldErrors = errorObj.details.map((d: any) => d.message).join(' ');
      if (fieldErrors) return fieldErrors;
    }
    return errorObj.message || fallbackMessage;
  }
  return err?.message || fallbackMessage;
};
