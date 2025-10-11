import type { Message, Session, Task, WorktreeConfig } from '@agor/core/types';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Sessions table - Core primitive for all agent interactions
 *
 * Hybrid schema strategy:
 * - Materialize columns we filter/join by (status, genealogy, agent, board)
 * - JSON blob for nested/rarely-queried data (git_state, repo config, etc.)
 */
export const sessions = sqliteTable(
  'sessions',
  {
    // Primary identity
    session_id: text('session_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // Materialized for filtering/joins (cross-DB compatible)
    status: text('status', {
      enum: ['idle', 'running', 'completed', 'failed'],
    }).notNull(),
    agent: text('agent', {
      enum: ['claude-code', 'cursor', 'codex', 'gemini'],
    }).notNull(),
    board_id: text('board_id', { length: 36 }), // NULL = no board

    // Genealogy (materialized for tree queries)
    parent_session_id: text('parent_session_id', { length: 36 }),
    forked_from_session_id: text('forked_from_session_id', { length: 36 }),

    // JSON blob for everything else (cross-DB via json() type)
    data: text('data', { mode: 'json' })
      .$type<{
        agent_version?: string;
        description?: string;

        // Repository context
        repo?: {
          repo_id?: string;
          repo_slug?: string;
          worktree_name?: string;
          cwd: string;
          managed_worktree: boolean;
        };

        // Git state
        git_state: Session['git_state'];

        // Genealogy details (children array, fork/spawn points)
        genealogy: {
          fork_point_task_id?: string;
          spawn_point_task_id?: string;
          children: string[];
        };

        // Context
        concepts: string[];
        tasks: string[];

        // Aggregates
        message_count: number;
        tool_use_count: number;
      }>()
      .notNull(),
  },
  table => ({
    statusIdx: index('sessions_status_idx').on(table.status),
    agentIdx: index('sessions_agent_idx').on(table.agent),
    boardIdx: index('sessions_board_idx').on(table.board_id),
    createdIdx: index('sessions_created_idx').on(table.created_at),
    parentIdx: index('sessions_parent_idx').on(table.parent_session_id),
    forkedIdx: index('sessions_forked_idx').on(table.forked_from_session_id),
  })
);

/**
 * Tasks table - Granular work units within sessions
 */
export const tasks = sqliteTable(
  'tasks',
  {
    task_id: text('task_id', { length: 36 }).primaryKey(),
    session_id: text('session_id', { length: 36 })
      .notNull()
      .references(() => sessions.session_id, { onDelete: 'cascade' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    completed_at: integer('completed_at', { mode: 'timestamp_ms' }),
    status: text('status', {
      enum: ['created', 'running', 'completed', 'failed'],
    }).notNull(),

    data: text('data', { mode: 'json' })
      .$type<{
        description: string;
        full_prompt: string;

        message_range: Task['message_range'];
        git_state: Task['git_state'];

        model: string;
        tool_use_count: number;

        report?: Task['report'];
      }>()
      .notNull(),
  },
  table => ({
    sessionIdx: index('tasks_session_idx').on(table.session_id),
    statusIdx: index('tasks_status_idx').on(table.status),
    createdIdx: index('tasks_created_idx').on(table.created_at),
  })
);

/**
 * Messages table - Conversation messages within sessions
 *
 * Stores individual messages (user, assistant, system) for full conversation replay.
 * Messages are indexed by session_id, task_id, and position (index) for efficient queries.
 */
export const messages = sqliteTable(
  'messages',
  {
    // Primary identity
    message_id: text('message_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    // Foreign keys (materialized for indexes)
    session_id: text('session_id', { length: 36 })
      .notNull()
      .references(() => sessions.session_id, { onDelete: 'cascade' }),
    task_id: text('task_id', { length: 36 }).references(() => tasks.task_id, {
      onDelete: 'set null',
    }),

    // Materialized for queries
    type: text('type', {
      enum: ['user', 'assistant', 'system', 'file-history-snapshot'],
    }).notNull(),
    role: text('role', {
      enum: ['user', 'assistant', 'system'],
    }).notNull(),
    index: integer('index').notNull(), // Position in conversation (0-based)
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
    content_preview: text('content_preview'), // First 200 chars for list views

    // Full data (JSON blob)
    data: text('data', { mode: 'json' })
      .$type<{
        content: Message['content'];
        tool_uses?: Message['tool_uses'];
        metadata?: Message['metadata'];
      }>()
      .notNull(),
  },
  table => ({
    // Indexes for efficient lookups
    sessionIdx: index('messages_session_id_idx').on(table.session_id),
    taskIdx: index('messages_task_id_idx').on(table.task_id),
    sessionIndexIdx: index('messages_session_index_idx').on(table.session_id, table.index),
  })
);

/**
 * Boards table - Organizational primitive for grouping sessions
 */
export const boards = sqliteTable(
  'boards',
  {
    board_id: text('board_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // Materialized for lookups
    name: text('name').notNull(),
    slug: text('slug').unique(),

    // JSON blob for the rest
    data: text('data', { mode: 'json' })
      .$type<{
        description?: string;
        sessions: string[]; // Session IDs
        color?: string;
        icon?: string;
      }>()
      .notNull(),
  },
  table => ({
    nameIdx: index('boards_name_idx').on(table.name),
    slugIdx: index('boards_slug_idx').on(table.slug),
  })
);

/**
 * Repos table - Git repositories managed by Agor
 */
export const repos = sqliteTable(
  'repos',
  {
    repo_id: text('repo_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // Materialized for querying
    slug: text('slug').notNull().unique(),

    data: text('data', { mode: 'json' })
      .$type<{
        name: string;
        remote_url?: string;
        local_path: string;
        managed_by_agor: boolean;
        default_branch?: string;
        worktrees: WorktreeConfig[];
      }>()
      .notNull(),
  },
  table => ({
    slugIdx: index('repos_slug_idx').on(table.slug),
  })
);

/**
 * Users table - Authentication and authorization
 *
 * Optional table - only created when authentication is enabled via `agor auth init`.
 * In anonymous mode (default), this table doesn't exist and all operations are permitted.
 */
export const users = sqliteTable(
  'users',
  {
    // Primary identity
    user_id: text('user_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // Materialized for auth lookups
    email: text('email').unique().notNull(),
    password: text('password').notNull(), // bcrypt hashed

    // Basic profile (materialized for display)
    name: text('name'),
    role: text('role', {
      enum: ['owner', 'admin', 'member', 'viewer'],
    })
      .notNull()
      .default('member'),

    // JSON blob for profile/preferences
    data: text('data', { mode: 'json' })
      .$type<{
        avatar?: string;
        preferences?: Record<string, unknown>;
      }>()
      .notNull(),
  },
  table => ({
    emailIdx: index('users_email_idx').on(table.email),
  })
);

/**
 * Type exports for use with Drizzle ORM
 */
export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type BoardRow = typeof boards.$inferSelect;
export type BoardInsert = typeof boards.$inferInsert;
export type RepoRow = typeof repos.$inferSelect;
export type RepoInsert = typeof repos.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
