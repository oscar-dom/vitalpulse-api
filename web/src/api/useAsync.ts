import { useEffect, useState } from "react";
import { ApiError } from "./client";

interface AsyncState<T> {
  key: string | null;
  data?: T;
  error?: ApiError;
}

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, [{ code: "exception", message: String(error) }]);

/**
 * Runs `load` whenever `key` changes (a URL, usually) and keeps the last result while
 * the next one loads, so a table does not flash empty between pages. `load` must be
 * stable for a given key (useCallback). `reload` runs it again for the same key.
 */
export const useAsync = <T>(key: string | null, load: () => Promise<T>) => {
  const [state, setState] = useState<AsyncState<T>>({ key: null });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setState((previous) => ({ ...previous, key, error: toApiError(error) }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, load, round]);

  return {
    data: state.data,
    error: state.key === key ? state.error : undefined,
    loading: key !== null && state.key !== key,
    reload: () => {
      setState((previous) => ({ ...previous, key: null }));
      setRound((n) => n + 1);
    },
  };
};
