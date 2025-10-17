// src/types/session.ts

import type { ContextFilePath } from './context';
import type { SessionID, TaskID } from './id';
import type { SessionRepoContext } from './repo';

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

/**
 * Permission mode controls how agents handle tool execution approvals
 * - ask: Require approval for every tool use (most restrictive)
 * - auto: Auto-approve safe operations, ask for dangerous ones (recommended)
 * - on-failure: Auto-approve all, ask only when commands fail (Codex-specific)
 * - allow-all: Auto-approve all operations (least restrictive)
 */
export type PermissionMode = 'ask' | 'auto' | 'on-failure' | 'allow-all';

export interface Session {
  /** Unique session identifier (UUIDv7) */
  session_id: SessionID;

  agent: 'claude-code' | 'cursor' | 'codex' | 'gemini';
  agent_version?: string;
  /** Agent SDK session ID for maintaining conversation history (Claude Agent SDK only) */
  agent_session_id?: string;
  status: SessionStatus;
  created_at: string;
  last_updated: string;

  /** User ID of the user who created this session */
  created_by: string;

  // Repository context (required)
  repo: SessionRepoContext;

  // Git state
  git_state: {
    ref: string;
    base_sha: string;
    current_sha: string;
  };

  // Context (context file paths relative to context/)
  contextFiles: ContextFilePath[];

  // Genealogy
  genealogy: {
    /** Session this was forked from (sibling relationship) */
    forked_from_session_id?: SessionID;
    /** Task where fork occurred */
    fork_point_task_id?: TaskID;
    /** Parent session that spawned this one (child relationship) */
    parent_session_id?: SessionID;
    /** Task where spawn occurred */
    spawn_point_task_id?: TaskID;
    /** Child sessions spawned from this session */
    children: SessionID[];
  };

  // Tasks
  /** Task IDs in this session */
  tasks: TaskID[];
  message_count: number;
  tool_use_count: number;

  // UI metadata
  description?: string;

  // Permission config (session-level tool approvals)
  permission_config?: {
    allowedTools?: string[];
    /** Permission mode for agent tool execution */
    mode?: PermissionMode;
  };

  // Model configuration (session-level model selection)
  model_config?: {
    /** Model selection mode: alias (e.g., 'claude-sonnet-4-5-latest') or exact (e.g., 'claude-sonnet-4-5-20250929') */
    mode: 'alias' | 'exact';
    /** Model identifier (alias or exact ID) */
    model: string;
    /** When this config was last updated */
    updated_at: string;
    /** Optional user notes about why this model was selected */
    notes?: string;
  };

  // External references
  /** GitHub issue URL or issue tracker URL */
  issue_url?: string;
  /** Pull request URL */
  pull_request_url?: string;
}
