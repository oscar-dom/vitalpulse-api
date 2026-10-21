import { useCallback, useContext } from "react";
import { ApiError, request, type RequestOptions } from "../api/client";
import { AuthContext, type AuthState } from "./AuthContext";

export const useAuth = (): AuthState => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
};

/**
 * `request` with the session's token. A 401 means the token expired or the account is
 * gone: the session ends and the app goes back to the sign-in page.
 */
export const useApi = () => {
  const { token, expire } = useAuth();
  return useCallback(
    async <T>(target: string, options: Omit<RequestOptions, "token"> = {}) => {
      try {
        return await request<T>(target, { ...options, token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expire();
        throw error;
      }
    },
    [token, expire],
  );
};
