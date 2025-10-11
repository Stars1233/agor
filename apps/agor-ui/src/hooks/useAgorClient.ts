/**
 * React hook for Agor daemon client connection
 *
 * Manages FeathersJS client lifecycle with React effects
 */

import type { AgorClient } from '@agor/core/api';
import { createClient, isDaemonRunning } from '@agor/core/api';
import { useEffect, useRef, useState } from 'react';

interface UseAgorClientResult {
  client: AgorClient | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface UseAgorClientOptions {
  url?: string;
  accessToken?: string | null;
}

/**
 * Create and manage Agor daemon client connection
 *
 * @param options - Connection options (url, accessToken)
 * @returns Client instance, connection state, and error
 */
export function useAgorClient(options: UseAgorClientOptions = {}): UseAgorClientResult {
  const { url = 'http://localhost:3030', accessToken } = options;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(!!accessToken); // Only connecting if we have a token
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<AgorClient | null>(null);

  useEffect(() => {
    let mounted = true;
    let client: AgorClient | null = null;

    async function connect() {
      // Don't create client if no access token
      if (!accessToken) {
        setConnecting(false);
        setConnected(false);
        setError(null);
        clientRef.current = null;
        return;
      }

      setConnecting(true);
      setError(null);

      // Create client and let socket.io handle connection
      client = createClient(url);
      clientRef.current = client;

      // Authenticate with JWT
      try {
        await client.authenticate({
          strategy: 'jwt',
          accessToken,
        });
      } catch (err) {
        if (mounted) {
          setError('Authentication failed. Please log in again.');
          setConnecting(false);
          setConnected(false);
        }
        return;
      }

      // Check if socket is already connected after authentication
      if (client.io.connected) {
        if (mounted) {
          setConnected(true);
          setConnecting(false);
          setError(null);
        }
      }

      // Setup socket event listeners
      client.io.on('connect', () => {
        if (mounted) {
          setConnected(true);
          setConnecting(false);
          setError(null);
        }
      });

      client.io.on('disconnect', () => {
        if (mounted) {
          setConnected(false);
        }
      });

      client.io.on('connect_error', (err: Error) => {
        if (mounted) {
          setError('Daemon is not running. Start it with: cd apps/agor-daemon && pnpm dev');
          setConnecting(false);
          setConnected(false);
        }
      });

      // Set a reasonable timeout for initial connection
      setTimeout(() => {
        if (mounted && !clientRef.current?.io.connected) {
          setError('Connection timeout. Make sure daemon is running on :3030');
          setConnecting(false);
        }
      }, 5000);
    }

    connect();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (client?.io) {
        client.io.close();
      }
    };
  }, [url, accessToken]);

  return {
    client: clientRef.current,
    connected,
    connecting,
    error,
  };
}
