/**
 * React hook for session CRUD operations
 *
 * Provides functions to create, update, fork, spawn sessions
 */

import type { AgorClient } from '@agor/core/api';
import type { AgenticToolName, Repo, Session, SessionID, Worktree } from '@agor/core/types';
import { getDefaultPermissionMode, SessionStatus } from '@agor/core/types';
import { useState } from 'react';
import type { NewSessionConfig } from '../components/NewSessionModal';
import { getDaemonUrl } from '../config/daemon';

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

      // Parse worktree reference (now always required)
      // Format: "repo-slug:worktree-name" e.g., "agor:test-yo"
      if (!config.worktreeRef) {
        throw new Error('Worktree reference is required');
      }

      const parts = config.worktreeRef.split(':');
      const repoSlug = parts[0];
      const worktreeName = parts[1];

      if (!repoSlug || !worktreeName) {
        throw new Error('Invalid worktree reference format. Expected "repo-slug:worktree-name"');
      }

      console.log(`Creating session with worktree: ${repoSlug}:${worktreeName}`);

      // Find the repo by slug
      const reposResponse = await client.service('repos').find({});
      console.log('Repos response:', reposResponse);

      // Handle both array and paginated response formats
      const repos = Array.isArray(reposResponse) ? reposResponse : reposResponse.data || [];
      const repo = repos.find((r: Repo) => r.slug === repoSlug);
      if (!repo) {
        console.error(
          'Available repos:',
          repos.map((r: Repo) => r.slug)
        );
        throw new Error(`Repository not found: ${repoSlug}`);
      }

      console.log('Found repo:', repo.repo_id, repo.slug);

      // Find the worktree by repo_id and name
      const worktreesResponse = await client.service('worktrees').find({
        query: { repo_id: repo.repo_id },
      });
      console.log('Worktrees response:', worktreesResponse);

      // Handle both array and paginated response formats
      const worktrees = (
        Array.isArray(worktreesResponse) ? worktreesResponse : worktreesResponse.data || []
      ) as Worktree[];
      const worktree = worktrees.find(w => w.name === worktreeName);
      if (!worktree) {
        console.error(
          'Available worktrees:',
          worktrees.map(w => w.name)
        );
        throw new Error(`Worktree not found: ${worktreeName} in repo ${repoSlug}`);
      }

      console.log(`Found worktree: ${worktree.worktree_id}`);

      // Create session with worktree_id
      const agenticTool = config.agent as AgenticToolName;
      const newSession = await client.service('sessions').create({
        agentic_tool: agenticTool,
        status: SessionStatus.IDLE,
        title: config.title || undefined,
        description: config.initialPrompt || undefined,
        worktree_id: worktree.worktree_id,
        model_config: config.modelConfig
          ? {
              ...config.modelConfig,
              updated_at: new Date().toISOString(),
            }
          : undefined,
        permission_config: {
          mode: config.permissionMode || getDefaultPermissionMode(agenticTool),
        },
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
      const response = await fetch(`${getDaemonUrl()}/sessions/${sessionId}/fork`, {
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
      const response = await fetch(`${getDaemonUrl()}/sessions/${sessionId}/spawn`, {
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
