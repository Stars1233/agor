/**
 * MCP Tools Integration Tests
 *
 * These tests verify all 9 MCP tools work end-to-end.
 * Requires daemon to be running on localhost:3030.
 */

import { beforeAll, describe, expect, it } from 'vitest';

const DAEMON_URL = 'http://localhost:3030';
let sessionToken: string;

beforeAll(async () => {
  // Use MCP token from environment variable (get from DB or logs)
  // Example: sqlite3 ~/.agor/agor.db "SELECT substr(json_extract(data, '$.mcp_token'), 1, 64) FROM sessions WHERE json_extract(data, '$.mcp_token') IS NOT NULL LIMIT 1"
  sessionToken =
    process.env.MCP_TEST_TOKEN ||
    'cd5fc175008aca05cf28d7ac9ea35c1cb02d898985c7f7e015c0afce8980f8c8';

  if (!sessionToken) {
    throw new Error('MCP_TEST_TOKEN environment variable not set');
  }

  console.log(`Using token ${sessionToken.substring(0, 16)}... for tests`);
});

// biome-ignore lint/suspicious/noExplicitAny: Test utility accepts arbitrary tool arguments
async function callMCPTool(name: string, args: any = {}) {
  const resp = await fetch(`${DAEMON_URL}/mcp?sessionToken=${sessionToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const data = await resp.json();

  if (data.error) {
    throw new Error(`MCP tool ${name} failed: ${data.error.message}`);
  }

  return JSON.parse(data.result.content[0].text);
}

describe('MCP Tools - Session Tools', () => {
  it('tools/list returns all 10 tools', async () => {
    const resp = await fetch(`${DAEMON_URL}/mcp?sessionToken=${sessionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });

    const data = await resp.json();
    expect(data.result.tools).toHaveLength(10);

    // biome-ignore lint/suspicious/noExplicitAny: JSON response type from MCP server
    const toolNames = data.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('agor_sessions_list');
    expect(toolNames).toContain('agor_sessions_get');
    expect(toolNames).toContain('agor_sessions_get_current');
    expect(toolNames).toContain('agor_sessions_spawn');
    expect(toolNames).toContain('agor_worktrees_get');
    expect(toolNames).toContain('agor_worktrees_list');
    expect(toolNames).toContain('agor_boards_get');
    expect(toolNames).toContain('agor_boards_list');
    expect(toolNames).toContain('agor_tasks_list');
    expect(toolNames).toContain('agor_tasks_get');
  });

  it('agor_sessions_list returns sessions', async () => {
    const result = await callMCPTool('agor_sessions_list', { limit: 5 });

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toHaveProperty('session_id');
  });

  it('agor_sessions_get_current returns current session', async () => {
    const result = await callMCPTool('agor_sessions_get_current');

    expect(result).toHaveProperty('session_id');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('agentic_tool');
  });

  it('agor_sessions_get returns specific session', async () => {
    // First get a session ID
    const sessions = await callMCPTool('agor_sessions_list', { limit: 1 });
    const sessionId = sessions.data[0].session_id;

    // Then fetch it specifically
    const result = await callMCPTool('agor_sessions_get', { sessionId });

    expect(result.session_id).toBe(sessionId);
    expect(result).toHaveProperty('status');
  });

  it('agor_sessions_spawn creates child session', async () => {
    const result = await callMCPTool('agor_sessions_spawn', {
      prompt: 'Test subsession task',
    });

    expect(result).toHaveProperty('session_id');
    expect(result).toHaveProperty('parent_session_id');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('worktree_id');
  });
});

describe('MCP Tools - Worktree Tools', () => {
  it('agor_worktrees_list returns worktrees', async () => {
    const result = await callMCPTool('agor_worktrees_list', { limit: 5 });

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('agor_worktrees_get returns specific worktree', async () => {
    // First get a worktree ID
    const worktrees = await callMCPTool('agor_worktrees_list', { limit: 1 });

    if (worktrees.data.length === 0) {
      console.log('No worktrees found, skipping test');
      return;
    }

    const worktreeId = worktrees.data[0].worktree_id;

    // Then fetch it specifically
    const result = await callMCPTool('agor_worktrees_get', { worktreeId });

    expect(result.worktree_id).toBe(worktreeId);
    expect(result).toHaveProperty('path');
  });
});

describe('MCP Tools - Board Tools', () => {
  it('agor_boards_list returns boards', async () => {
    const result = await callMCPTool('agor_boards_list', { limit: 5 });

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('agor_boards_get returns specific board', async () => {
    // First get a board ID
    const boards = await callMCPTool('agor_boards_list', { limit: 1 });

    if (boards.data.length === 0) {
      console.log('No boards found, skipping test');
      return;
    }

    const boardId = boards.data[0].board_id;

    // Then fetch it specifically
    const result = await callMCPTool('agor_boards_get', { boardId });

    expect(result.board_id).toBe(boardId);
    expect(result).toHaveProperty('name');
  });
});

describe('MCP Tools - Task Tools', () => {
  it('agor_tasks_list returns tasks', async () => {
    const result = await callMCPTool('agor_tasks_list', { limit: 5 });

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('agor_tasks_get returns specific task', async () => {
    // First get a task ID
    const tasks = await callMCPTool('agor_tasks_list', { limit: 1 });

    if (tasks.data.length === 0) {
      console.log('No tasks found, skipping test');
      return;
    }

    const taskId = tasks.data[0].task_id;

    // Then fetch it specifically
    const result = await callMCPTool('agor_tasks_get', { taskId });

    expect(result.task_id).toBe(taskId);
    expect(result).toHaveProperty('status');
  });
});
