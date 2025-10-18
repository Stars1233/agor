/**
 * React hook for session CRUD operations
 *
 * Provides functions to create, update, fork, spawn sessions
 */

import type { AgorClient } from '@agor/core/api';
import type { AgentName, Session, SessionID } from '@agor/core/types';
import { getDefaultPermissionMode } from '@agor/core/types';
import { useState } from 'react';
import type { NewSessionConfig } from '../components/NewSessionModal';

interface UseSessionActionsResult {
  createSession: (config: NewSessionConfig) => Promise<Session | null>;
  updateSession: (sessionId: SessionID, updates: Partial<Session>) => Promise<Session | null>;
  deleteSession: (sessionId: SessionID) => Promise<boolean>;
  forkSession: (sessionId: SessionID, prompt: string) => Promise<Session | null>;
  spawnSession: (sessionId: SessionID, prompt: string) => Promise<Session | null>;
  creating: boolean;
  error: string | null;
}

/**
 * Session action operations
 *
 * @param client - Agor client instance
 * @returns Session action functions and state
 */
export function useSessionActions(client: AgorClient | null): UseSessionActionsResult {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = async (config: NewSessionConfig): Promise<Session | null> => {
    if (!client) {
      setError('Client not connected');
      return null;
    }

    try {
      setCreating(true);
      setError(null);

      // Parse worktree reference if using existing worktree
      let repoSlug: string | undefined;
      let worktreeName: string | undefined;

      if (config.repoSetupMode === 'existing-worktree' && config.worktreeRef) {
        // Format: "repo-slug:worktree-name" e.g., "agor:test-yo"
        const parts = config.worktreeRef.split(':');
        repoSlug = parts[0];
        worktreeName = parts[1];
      } else if (config.repoSetupMode === 'new-worktree') {
        repoSlug = config.existingRepoSlug;
        worktreeName = config.newWorktreeName;
        // TODO: Create the worktree via daemon before creating session
      } else if (config.repoSetupMode === 'new-repo') {
        repoSlug = config.repoSlug;
        worktreeName = config.initialWorktreeName;
        // TODO: Clone repo and create worktree via daemon before creating session
      }

      // Create session with repo/worktree data
      const agenticTool = config.agent as AgentName;
      const newSession = await client.service('sessions').create({
        agentic_tool: agenticTool,
        status: 'idle' as const,
        description: config.initialPrompt || config.title || undefined,
        repo: {
          repo_slug: repoSlug,
          worktree_name: worktreeName,
          managed_worktree: !!worktreeName, // If we have a worktree name, it's managed
        },
        git_state: {
          ref: config.newWorktreeBranch || config.initialWorktreeBranch || 'main',
          base_sha: 'HEAD',
          current_sha: 'HEAD',
        },
        model_config: config.modelConfig
          ? {
              ...config.modelConfig,
              updated_at: new Date().toISOString(),
            }
          : undefined,
        permission_config: {
          mode: config.permissionMode || getDefaultPermissionMode(agenticTool),
        },
        contextFiles: [],
        genealogy: {
          children: [],
        },
        tasks: [],
        message_count: 0,
        tool_use_count: 0,
      } as Partial<Session>);

      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      console.error('Failed to create session:', err);
      return null;
    } finally {
      setCreating(false);
    }
  };

  const forkSession = async (sessionId: SessionID, prompt: string): Promise<Session | null> => {
    if (!client) {
      setError('Client not connected');
      return null;
    }

    try {
      setCreating(true);
      setError(null);

      // Call custom fork endpoint
      const response = await fetch(`http://localhost:3030/sessions/${sessionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Fork failed: ${response.statusText}`);
      }

      const forkedSession = await response.json();
      return forkedSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fork session';
      setError(message);
      console.error('Failed to fork session:', err);
      return null;
    } finally {
      setCreating(false);
    }
  };

  const spawnSession = async (sessionId: SessionID, prompt: string): Promise<Session | null> => {
    if (!client) {
      setError('Client not connected');
      return null;
    }

    try {
      setCreating(true);
      setError(null);

      // Call custom spawn endpoint
      const response = await fetch(`http://localhost:3030/sessions/${sessionId}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Spawn failed: ${response.statusText}`);
      }

      const spawnedSession = await response.json();
      return spawnedSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn session';
      setError(message);
      console.error('Failed to spawn session:', err);
      return null;
    } finally {
      setCreating(false);
    }
  };

  const updateSession = async (
    sessionId: SessionID,
    updates: Partial<Session>
  ): Promise<Session | null> => {
    if (!client) {
      setError('Client not connected');
      return null;
    }

    try {
      setError(null);
      const updatedSession = await client.service('sessions').patch(sessionId, updates);
      return updatedSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update session';
      setError(message);
      console.error('Failed to update session:', err);
      return null;
    }
  };

  const deleteSession = async (sessionId: SessionID): Promise<boolean> => {
    if (!client) {
      setError('Client not connected');
      return false;
    }

    try {
      setError(null);
      await client.service('sessions').remove(sessionId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      setError(message);
      console.error('Failed to delete session:', err);
      return false;
    }
  };

  return {
    createSession,
    updateSession,
    deleteSession,
    forkSession,
    spawnSession,
    creating,
    error,
  };
}
