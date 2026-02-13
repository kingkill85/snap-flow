import { useEffect, useRef } from 'react';

/**
 * Hook to create an AbortController that aborts when component unmounts
 * or when dependencies change
 */
export function useAbortController(deps: React.DependencyList = []) {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Create new AbortController
    abortControllerRef.current = new AbortController();

    // Cleanup: abort on unmount or dependency change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, deps);

  return () => abortControllerRef.current?.signal;
}

/**
 * Hook for async data fetching with automatic cancellation
 */
export function useFetchWithCancel<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  onSuccess: (data: T) => void,
  onError: (error: Error) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        const data = await fetcher(controller.signal);
        if (!controller.signal.aborted) {
          onSuccess(data);
        }
      } catch (error: any) {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          onError(error);
        }
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, deps);
}
