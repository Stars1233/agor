/**
 * MCP HTTP Routes
 *
 * Exposes MCP server via HTTP endpoint for Claude Agent SDK.
 * Uses session tokens for authentication.
 */

import type { Application } from '@agor/core/feathers';
import type { Request, Response } from 'express';
import { validateSessionToken } from './tokens.js';

/**
 * Setup MCP routes on FeathersJS app
 */
export function setupMCPRoutes(app: Application): void {
  // MCP endpoint: POST /mcp
  // Expects: sessionToken query param
  // Returns: MCP JSON-RPC response

  // Use Express middleware directly
  const handler = async (req: Request, res: Response) => {
    try {
      console.log(`🔌 Incoming MCP request: ${req.method} /mcp`);
      console.log(`   Headers:`, JSON.stringify(req.headers).substring(0, 300));
      console.log(`   Query params:`, req.query);
      console.log(`   Body:`, JSON.stringify(req.body).substring(0, 200));

      // Extract session token from query params
      const sessionToken = req.query.sessionToken as string | undefined;

      if (!sessionToken) {
        console.warn('⚠️  MCP request missing sessionToken');
        return res.status(401).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32001,
            message: 'Authentication required: session token must be provided in query params',
          },
        });
      }

      // Validate token and extract context
      const context = await validateSessionToken(app, sessionToken);
      if (!context) {
        console.warn('⚠️  Invalid MCP session token');
        return res.status(401).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32001,
            message: 'Invalid or expired session token',
          },
        });
      }

      console.log(
        `🔌 MCP request authenticated (user: ${context.userId.substring(0, 8)}, session: ${context.sessionId.substring(0, 8)})`
      );

      // Handle the MCP request
      // The SDK expects JSON-RPC format in request body
      const mcpRequest = req.body;

      // Process request based on method
      let mcpResponse: unknown;

      if (mcpRequest.method === 'initialize') {
        // MCP initialization handshake
        console.log(`🔌 MCP initialize request from session ${context.sessionId.substring(0, 8)}`);
        mcpResponse = {
          protocolVersion: mcpRequest.params.protocolVersion || '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'agor',
            version: '0.1.0',
          },
        };
        console.log(`✅ MCP initialized successfully (protocol: ${mcpResponse.protocolVersion})`);
      } else if (mcpRequest.method === 'tools/list') {
        // Return list of available tools
        console.log(`🔧 MCP tools/list request from session ${context.sessionId.substring(0, 8)}`);
        mcpResponse = {
          tools: [
            // Session tools
            {
              name: 'agor_sessions_list',
              description: 'List all sessions accessible to the current user',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Maximum number of sessions to return (default: 50)',
                  },
                  status: {
                    type: 'string',
                    enum: ['idle', 'running', 'completed', 'failed'],
                    description: 'Filter by session status',
                  },
                  boardId: {
                    type: 'string',
                    description: 'Filter sessions by board ID (UUIDv7 or short ID)',
                  },
                  worktreeId: {
                    type: 'string',
                    description: 'Filter sessions by worktree ID',
                  },
                },
              },
            },
            {
              name: 'agor_sessions_get',
              description:
                'Get detailed information about a specific session, including genealogy and current state',
              inputSchema: {
                type: 'object',
                properties: {
                  sessionId: {
                    type: 'string',
                    description: 'Session ID (UUIDv7 or short ID like 01a1b2c3)',
                  },
                },
                required: ['sessionId'],
              },
            },
            {
              name: 'agor_sessions_get_current',
              description:
                'Get information about the current session (the one making this MCP call). Useful for introspection.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'agor_sessions_spawn',
              description:
                'Spawn a child session (subsession) for delegating work to another agent. Creates a new session with parent genealogy tracking.',
              inputSchema: {
                type: 'object',
                properties: {
                  prompt: {
                    type: 'string',
                    description: 'The prompt/task for the subsession agent to execute',
                  },
                  agenticTool: {
                    type: 'string',
                    enum: ['claude-code', 'cursor', 'codex', 'gemini'],
                    description:
                      'Which agent to use for the subsession (defaults to same as parent)',
                  },
                  taskId: {
                    type: 'string',
                    description: 'Optional task ID to link the spawned session to',
                  },
                },
                required: ['prompt'],
              },
            },

            // Worktree tools
            {
              name: 'agor_worktrees_get',
              description:
                'Get detailed information about a worktree, including path, branch, and git state',
              inputSchema: {
                type: 'object',
                properties: {
                  worktreeId: {
                    type: 'string',
                    description: 'Worktree ID (UUIDv7 or short ID)',
                  },
                },
                required: ['worktreeId'],
              },
            },
            {
              name: 'agor_worktrees_list',
              description: 'List all worktrees in a repository',
              inputSchema: {
                type: 'object',
                properties: {
                  repoId: {
                    type: 'string',
                    description: 'Repository ID to filter by',
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 50)',
                  },
                },
              },
            },

            // Board tools
            {
              name: 'agor_boards_get',
              description: 'Get information about a board, including zones and layout',
              inputSchema: {
                type: 'object',
                properties: {
                  boardId: {
                    type: 'string',
                    description: 'Board ID (UUIDv7 or short ID)',
                  },
                },
                required: ['boardId'],
              },
            },
            {
              name: 'agor_boards_list',
              description: 'List all boards accessible to the current user',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 50)',
                  },
                },
              },
            },

            // Task tools
            {
              name: 'agor_tasks_list',
              description: 'List tasks (user prompts) in a session',
              inputSchema: {
                type: 'object',
                properties: {
                  sessionId: {
                    type: 'string',
                    description: 'Session ID to get tasks from',
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 50)',
                  },
                },
              },
            },
            {
              name: 'agor_tasks_get',
              description: 'Get detailed information about a specific task',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: {
                    type: 'string',
                    description: 'Task ID (UUIDv7 or short ID)',
                  },
                },
                required: ['taskId'],
              },
            },
          ],
        };
      } else if (mcpRequest.method === 'notifications/initialized') {
        // Client notifying us that initialization is complete
        console.log(
          `📬 MCP notifications/initialized from session ${context.sessionId.substring(0, 8)}`
        );
        // No response needed for notifications
        return res.status(204).send();
      } else if (mcpRequest.method === 'tools/call') {
        // Handle tool call
        const { name, arguments: args } = mcpRequest.params || {};
        console.log(`🔧 MCP tool call: ${name}`);
        console.log(`   Arguments:`, JSON.stringify(args || {}).substring(0, 200));

        // Session tools
        if (name === 'agor_sessions_list') {
          const query: Record<string, unknown> = {};
          if (args?.limit) query.$limit = args.limit;
          if (args?.status) query.status = args.status;
          if (args?.boardId) query.board_id = args.boardId;
          if (args?.worktreeId) query.worktree_id = args.worktreeId;

          const sessions = await app.service('sessions').find({ query });
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(sessions, null, 2),
              },
            ],
          };
        } else if (name === 'agor_sessions_get') {
          if (!args?.sessionId) {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: 'Invalid params: sessionId is required',
              },
            });
          }

          const session = await app.service('sessions').get(args.sessionId);
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(session, null, 2),
              },
            ],
          };
        } else if (name === 'agor_sessions_get_current') {
          // Get current session using token context
          const session = await app.service('sessions').get(context.sessionId);
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(session, null, 2),
              },
            ],
          };
        } else if (name === 'agor_sessions_spawn') {
          // Spawn a child session (subsession)
          if (!args?.prompt) {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: 'Invalid params: prompt is required',
              },
            });
          }

          const spawnData: {
            prompt: string;
            agentic_tool?: string;
            task_id?: string;
          } = {
            prompt: args.prompt,
          };

          if (args.agenticTool) {
            spawnData.agentic_tool = args.agenticTool;
          }

          if (args.taskId) {
            spawnData.task_id = args.taskId;
          }

          // Call spawn method on sessions service
          const childSession = await app.service('sessions').spawn(context.sessionId, spawnData);

          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(childSession, null, 2),
              },
            ],
          };

          // Worktree tools
        } else if (name === 'agor_worktrees_get') {
          if (!args?.worktreeId) {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: 'Invalid params: worktreeId is required',
              },
            });
          }

          const worktree = await app.service('worktrees').get(args.worktreeId);
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(worktree, null, 2),
              },
            ],
          };
        } else if (name === 'agor_worktrees_list') {
          const query: Record<string, unknown> = {};
          if (args?.repoId) query.repo_id = args.repoId;
          if (args?.limit) query.$limit = args.limit;

          const worktrees = await app.service('worktrees').find({ query });
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(worktrees, null, 2),
              },
            ],
          };

          // Board tools
        } else if (name === 'agor_boards_get') {
          if (!args?.boardId) {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: 'Invalid params: boardId is required',
              },
            });
          }

          const board = await app.service('boards').get(args.boardId);
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(board, null, 2),
              },
            ],
          };
        } else if (name === 'agor_boards_list') {
          const query: Record<string, unknown> = {};
          if (args?.limit) query.$limit = args.limit;

          const boards = await app.service('boards').find({ query });
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(boards, null, 2),
              },
            ],
          };

          // Task tools
        } else if (name === 'agor_tasks_list') {
          const query: Record<string, unknown> = {};
          if (args?.sessionId) query.session_id = args.sessionId;
          if (args?.limit) query.$limit = args.limit;

          const tasks = await app.service('tasks').find({ query });
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(tasks, null, 2),
              },
            ],
          };
        } else if (name === 'agor_tasks_get') {
          if (!args?.taskId) {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32602,
                message: 'Invalid params: taskId is required',
              },
            });
          }

          const task = await app.service('tasks').get(args.taskId);
          mcpResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(task, null, 2),
              },
            ],
          };
        } else {
          return res.status(400).json({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`,
            },
          });
        }
      } else {
        return res.status(400).json({
          error: 'Unknown method',
          message: `Method ${mcpRequest.method} not supported`,
        });
      }

      // Return MCP JSON-RPC response
      return res.json({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result: mcpResponse,
      });
    } catch (error) {
      console.error('❌ MCP request failed:', error);
      return res.status(500).json({
        error: 'Internal error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Register as Express POST route
  // @ts-expect-error - FeathersJS app extends Express
  app.post('/mcp', handler);

  console.log('✅ MCP routes registered at POST /mcp');
}
