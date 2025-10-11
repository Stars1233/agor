/**
 * Authentication Hook
 *
 * Manages user authentication state and provides login/logout functions
 */

import { createClient } from '@agor/core/api';
import type { User } from '@agor/core/types';
import { useCallback, useEffect, useState } from 'react';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  reAuthenticate: () => Promise<void>;
}

const DAEMON_URL = 'http://localhost:3030';
const TOKEN_KEY = 'agor-jwt';

/**
 * Authentication hook
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    authenticated: false,
    loading: true,
    error: null,
  });

  /**
   * Re-authenticate using stored token
   */
  const reAuthenticate = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setState({
          user: null,
          accessToken: null,
          authenticated: false,
          loading: false,
          error: null,
        });
        return;
      }

      // Create temporary client to verify token
      const client = createClient(DAEMON_URL);

      // Try to authenticate with stored token
      const result = await client.authenticate({
        strategy: 'jwt',
        accessToken: storedToken,
      });

      setState({
        user: result.user,
        accessToken: result.accessToken,
        authenticated: true,
        loading: false,
        error: null,
      });

      // Clean up temporary client
      client.io.close();
    } catch (_error) {
      // Token invalid or expired
      localStorage.removeItem(TOKEN_KEY);
      setState({
        user: null,
        accessToken: null,
        authenticated: false,
        loading: false,
        error: null,
      });
    }
  }, []);

  // Try to re-authenticate on mount (using stored token)
  useEffect(() => {
    reAuthenticate();
  }, [reAuthenticate]);

  /**
   * Login with email and password
   */
  const login = async (email: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Create temporary client for login
      const client = createClient(DAEMON_URL);

      // Authenticate
      const result = await client.authenticate({
        strategy: 'local',
        email,
        password,
      });

      // Store token
      localStorage.setItem(TOKEN_KEY, result.accessToken);

      setState({
        user: result.user,
        accessToken: result.accessToken,
        authenticated: true,
        loading: false,
        error: null,
      });

      // Clean up temporary client
      client.io.close();

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      return false;
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setState({
      user: null,
      accessToken: null,
      authenticated: false,
      loading: false,
      error: null,
    });
  };

  return {
    ...state,
    login,
    logout,
    reAuthenticate,
  };
}
