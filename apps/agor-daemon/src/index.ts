/**
 * Agor Daemon
 *
 * FeathersJS backend providing REST + WebSocket API for session management.
 * Auto-started by CLI, provides unified interface for GUI and CLI clients.
 */

import 'dotenv/config';
import { loadConfig } from '@agor/core/config';
import { createDatabase, MessagesRepository, SessionRepository } from '@agor/core/db';
import { ClaudeTool } from '@agor/core/tools';
import type { SessionID } from '@agor/core/types';
import feathersExpress, { errorHandler, rest } from '@feathersjs/express';
import type { Params } from '@feathersjs/feathers';
import { feathers } from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio';
import express from 'express';
import { createBoardsService } from './services/boards';
import { createMessagesService } from './services/messages';
import { createReposService } from './services/repos';
import { createSessionsService } from './services/sessions';
import { createTasksService } from './services/tasks';

/**
 * Extended Params with route ID parameter
 */
interface RouteParams extends Params {
  route?: {
    id?: string;
  };
}

const PORT = process.env.PORT || 3030;
const DB_PATH = process.env.AGOR_DB_PATH || 'file:~/.agor/agor.db';

// Main async function
async function main() {
  // Load config to get API key
  const config = await loadConfig();
  const apiKey = config.credentials?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('⚠️  No ANTHROPIC_API_KEY found in config or environment');
    console.warn('   Run: agor config set credentials.ANTHROPIC_API_KEY <your-key>');
    console.warn('   Or set ANTHROPIC_API_KEY environment variable');
  }

  // Create Feathers app
  const app = feathersExpress(feathers());

  // Parse JSON
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Configure REST and Socket.io with CORS
  app.configure(rest());
  app.configure(
    socketio({
      cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true,
      },
    })
  );

  // Configure channels to broadcast events to all connected clients
  app.on('connection', connection => {
    // Join all connections to the 'everybody' channel
    app.channel('everybody').join(connection);
  });

  // Publish all service events to all connected clients
  app.publish(() => {
    return app.channel('everybody');
  });

  // Initialize database
  console.log(`📦 Connecting to database: ${DB_PATH}`);
  const db = createDatabase({ url: DB_PATH });

  // Initialize repositories for ClaudeTool
  const messagesRepo = new MessagesRepository(db);
  const sessionsRepo = new SessionRepository(db);

  // Initialize ClaudeTool with repositories and API key
  const claudeTool = new ClaudeTool(messagesRepo, sessionsRepo, apiKey);

  // Register services
  app.use('/sessions', createSessionsService(db));
  app.use('/tasks', createTasksService(db));
  const messagesService = createMessagesService(db);
  app.use('/messages', messagesService);
  app.use('/boards', createBoardsService(db));
  app.use('/repos', createReposService(db));

  // Configure custom route for bulk message creation
  app.use('/messages/bulk', {
    async create(data: unknown[]) {
      // biome-ignore lint/suspicious/noExplicitAny: Messages data validated by repository
      return messagesService.createMany(data as any);
    },
  });

  // Configure custom methods for sessions service
  // biome-ignore lint/suspicious/noExplicitAny: Service type is correct but TS doesn't infer custom methods
  const sessionsService = app.service('sessions') as any;
  app.use('/sessions/:id/fork', {
    async create(data: { prompt: string; task_id?: string }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Session ID required');
      return sessionsService.fork(id, data, params);
    },
  });

  app.use('/sessions/:id/spawn', {
    async create(data: { prompt: string; agent?: string; task_id?: string }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Session ID required');
      return sessionsService.spawn(id, data, params);
    },
  });

  // Feathers custom route handler with find method
  app.use('/sessions/:id/genealogy', {
    // biome-ignore lint/suspicious/noExplicitAny: Route handler parameter type
    async find(_data: any, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Session ID required');
      return sessionsService.getGenealogy(id, params);
    },
    // biome-ignore lint/suspicious/noExplicitAny: Service type not compatible with Express
  } as any);

  app.use('/sessions/:id/prompt', {
    async create(data: { prompt: string }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Session ID required');
      if (!data.prompt) throw new Error('Prompt required');

      // Get session to find current message count
      const session = await sessionsService.get(id, params);
      const messageStartIndex = session.message_count;

      // Execute prompt via ClaudeTool (creates user + assistant messages)
      const result = await claudeTool.executePrompt(id as SessionID, data.prompt);

      // Create task for this prompt
      const task = await tasksService.create({
        session_id: id,
        status: 'completed',
        description: data.prompt.substring(0, 120),
        full_prompt: data.prompt,
        message_range: {
          start_index: messageStartIndex,
          end_index: messageStartIndex + 1, // user message + assistant message
          start_timestamp: new Date().toISOString(),
          end_timestamp: new Date().toISOString(),
        },
        tool_use_count: 0, // TODO: extract from assistant message
        git_state: {
          sha_at_start: session.git_state?.current_sha || 'unknown',
        },
      });

      // Update session with new task
      await sessionsService.patch(id, {
        tasks: [...session.tasks, task.task_id],
        message_count: session.message_count + 2,
      });

      return {
        success: true,
        taskId: task.task_id,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
      };
    },
  });

  // Configure custom methods for tasks service
  // biome-ignore lint/suspicious/noExplicitAny: Service type is correct but TS doesn't infer custom methods
  const tasksService = app.service('tasks') as any;

  // Configure custom route for bulk task creation
  app.use('/tasks/bulk', {
    async create(data: unknown[]) {
      return tasksService.createMany(data);
    },
  });

  app.use('/tasks/:id/complete', {
    async create(
      data: { git_state?: { sha_at_end?: string; commit_message?: string } },
      params: RouteParams
    ) {
      const id = params.route?.id;
      if (!id) throw new Error('Task ID required');
      return tasksService.complete(id, data, params);
    },
  });

  app.use('/tasks/:id/fail', {
    async create(data: { error?: string }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Task ID required');
      return tasksService.fail(id, data, params);
    },
  });

  // Configure custom methods for repos service
  // biome-ignore lint/suspicious/noExplicitAny: Service type is correct but TS doesn't infer custom methods
  const reposService = app.service('repos') as any;
  app.use('/repos/clone', {
    async create(data: { url: string; name?: string; destination?: string }, params: RouteParams) {
      return reposService.cloneRepository(data, params);
    },
  });

  app.use('/repos/:id/worktrees', {
    async create(data: { name: string; ref: string; createBranch?: boolean }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Repo ID required');
      return reposService.createWorktree(id, data, params);
    },
  });

  app.use('/repos/:id/worktrees/:name', {
    async remove(_id: unknown, params: RouteParams & { route?: { name?: string } }) {
      const id = params.route?.id;
      const name = params.route?.name;
      if (!id) throw new Error('Repo ID required');
      if (!name) throw new Error('Worktree name required');
      return reposService.removeWorktree(id, name, params);
    },
  });

  // Configure custom methods for boards service
  // biome-ignore lint/suspicious/noExplicitAny: Service type is correct but TS doesn't infer custom methods
  const boardsService = app.service('boards') as any;
  app.use('/boards/:id/sessions', {
    async create(data: { sessionId: string }, params: RouteParams) {
      const id = params.route?.id;
      if (!id) throw new Error('Board ID required');
      if (!data.sessionId) throw new Error('Session ID required');
      return boardsService.addSession(id, data.sessionId, params);
    },
  });

  // Health check endpoint
  app.use('/health', {
    async find() {
      return {
        status: 'ok',
        timestamp: Date.now(),
        version: '0.1.0',
        database: DB_PATH,
      };
    },
  });

  // Error handling
  app.use(errorHandler());

  // Start server
  app.listen(PORT).then(() => {
    console.log(`🚀 Agor daemon running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Services:`);
    console.log(`     - /sessions`);
    console.log(`     - /tasks`);
    console.log(`     - /messages`);
    console.log(`     - /boards`);
    console.log(`     - /repos`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\n⏳ Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n⏳ Shutting down gracefully...');
    process.exit(0);
  });
}

// Start the daemon
main().catch(error => {
  console.error('Failed to start daemon:', error);
  process.exit(1);
});
