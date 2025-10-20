// src/mocks/sessions.ts
import type { Session, SessionID, TaskID, WorktreeID } from '../types';

export const mockSessionA: Session = {
  session_id: 'abc123' as SessionID,
  agentic_tool: 'claude-code',
  agentic_tool_version: '1.2.3',
  status: 'running',
  description: 'Initial attempt at implementing JWT-based auth with refresh tokens',
  created_at: '2025-10-01T10:00:00Z',
  last_updated: '2025-10-01T10:30:00Z',
  created_by: 'user-123',
  worktree_id: 'worktree-auth-123' as WorktreeID,
  git_state: {
    ref: 'feature/auth',
    base_sha: 'a4f2e91',
    current_sha: 'b3e4d12-dirty',
  },
  contextFiles: ['auth.md', 'security.md', 'api-design.md'],
  genealogy: {
    children: ['def456' as SessionID, 'ghi789' as SessionID],
  },
  tasks: ['task-001' as TaskID, 'task-002' as TaskID, 'task-005' as TaskID],
  message_count: 37,
  tool_use_count: 145,
};

// Fork example
export const mockSessionB: Session = {
  session_id: 'def456' as SessionID,
  agentic_tool: 'claude-code',
  agentic_tool_version: '1.2.3',
  status: 'idle',
  description: 'Forked from abc123 to explore OAuth 2.0 flow as alternative approach',
  created_at: '2025-10-01T10:20:00Z',
  last_updated: '2025-10-01T10:35:00Z',
  created_by: 'user-123',
  worktree_id: 'worktree-oauth-456' as WorktreeID,
  git_state: {
    ref: 'feature/oauth',
    base_sha: 'a4f2e91',
    current_sha: 'c5f6e23',
  },
  contextFiles: ['auth.md', 'security.md', 'api-design.md'],
  genealogy: {
    forked_from_session_id: 'abc123' as SessionID,
    fork_point_task_id: 'task-001' as TaskID,
    children: [],
  },
  tasks: ['task-003' as TaskID],
  message_count: 15,
  tool_use_count: 56,
};

// Spawn example
export const mockSessionC: Session = {
  session_id: 'ghi789' as SessionID,
  agentic_tool: 'gemini',
  agentic_tool_version: '2.0',
  status: 'completed',
  description: 'Spawned from abc123 to design database schema with Gemini',
  created_at: '2025-10-01T10:18:00Z',
  last_updated: '2025-10-01T10:28:00Z',
  created_by: 'user-123',
  worktree_id: 'worktree-database-789' as WorktreeID,
  git_state: {
    ref: 'feature/auth',
    base_sha: 'b3e4d12',
    current_sha: 'd7g8h34',
  },
  contextFiles: ['database.md', 'security.md'],
  genealogy: {
    parent_session_id: 'abc123' as SessionID,
    spawn_point_task_id: 'task-002' as TaskID,
    children: [],
  },
  tasks: ['task-004' as TaskID],
  message_count: 10,
  tool_use_count: 42,
};

// Full session tree
export const mockSessionTree: Session[] = [mockSessionA, mockSessionB, mockSessionC];
