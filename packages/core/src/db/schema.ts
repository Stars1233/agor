import type { Message, PermissionMode, Session, Task, WorktreeConfig } from '@agor/core/types';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Sessions table - Core primitive for all agentic tool interactions
 *
 * Hybrid schema strategy:
 * - Materialize columns we filter/join by (status, genealogy, agentic_tool, board)
 * - JSON blob for nested/rarely-queried data (git_state, repo config, etc.)
 */
export const sessions = sqliteTable(
  'sessions',
  {
    // Primary identity
    session_id: text('session_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // User attribution
    created_by: text('created_by', { length: 36 }).notNull().default('anonymous'),

    // Materialized for filtering/joins (cross-DB compatible)
    status: text('status', {
      enum: ['idle', 'running', 'completed', 'failed'],
    }).notNull(),
    agentic_tool: text('agentic_tool', {
      enum: ['claude-code', 'cursor', 'codex', 'gemini'],
    }).notNull(),
    board_id: text('board_id', { length: 36 }), // NULL = no board

    // Genealogy (materialized for tree queries)
    parent_session_id: text('parent_session_id', { length: 36 }),
    forked_from_session_id: text('forked_from_session_id', { length: 36 }),

    // Worktree reference (REQUIRED: all sessions must have a worktree)
    worktree_id: text('worktree_id', { length: 36 })
      .notNull()
      .references(() => worktrees.worktree_id, {
        onDelete: 'restrict', // Prevent deleting worktrees with active sessions
      }),

    // JSON blob for everything else (cross-DB via json() type)
    data: text('data', { mode: 'json' })
      .$type<{
        agentic_tool_version?: string;
        sdk_session_id?: string; // SDK session ID for conversation continuity (Claude Agent SDK, Codex SDK, etc.)
        title?: string; // Session title (user-provided or auto-generated)
        description?: string; // Legacy field, may contain first prompt

        // Git state
        git_state: Session['git_state'];

        // Genealogy details (children array, fork/spawn points)
        genealogy: {
          fork_point_task_id?: string;
          spawn_point_task_id?: string;
          children: string[];
        };

        // Context
        contextFiles: string[];
        tasks: string[];

        // Aggregates
        message_count: number;
        tool_use_count: number;

        // Permission config (session-level tool approvals)
        permission_config?: {
          allowedTools?: string[];
          mode?: PermissionMode;
        };

        // Model config (session-level model selection)
        model_config?: {
          mode: 'alias' | 'exact';
          model: string;
          updated_at: string;
          notes?: string;
        };

        // External references
        issue_url?: string;
        pull_request_url?: string;

        // Custom context for Handlebars templates
        custom_context?: Record<string, unknown>;
      }>()
      .notNull(),
  },
  table => ({
    statusIdx: index('sessions_status_idx').on(table.status),
    agenticToolIdx: index('sessions_agentic_tool_idx').on(table.agentic_tool),
    boardIdx: index('sessions_board_idx').on(table.board_id),
    worktreeIdx: index('sessions_worktree_idx').on(table.worktree_id),
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
      enum: [
        'created',
        'running',
        'stopping',
        'awaiting_permission',
        'completed',
        'failed',
        'stopped',
      ],
    }).notNull(),

    // User attribution
    created_by: text('created_by', { length: 36 }).notNull().default('anonymous'),

    data: text('data', { mode: 'json' })
      .$type<{
        description: string;
        full_prompt: string;

        message_range: Task['message_range'];
        git_state: Task['git_state'];

        model: string;
        tool_use_count: number;

        report?: Task['report'];
        permission_request?: Task['permission_request'];
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

    // User attribution
    created_by: text('created_by', { length: 36 }).notNull().default('anonymous'),

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
        layout?: Record<string, { x: number; y: number; parentId?: string }>; // Session positions
        objects?: Record<string, import('@agor/core/types').BoardObject>; // Board objects (text, zone)
        custom_context?: Record<string, unknown>; // Custom context for Handlebars templates
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
 *
 * All repos are cloned as bare repos to ~/.agor/repos/{slug}
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
        remote_url: string; // Required: all repos are cloned from a remote
        local_path: string; // Always ~/.agor/repos/{slug}
        default_branch?: string;
        environment_config?: {
          up_command: string; // Handlebars template
          down_command: string; // Handlebars template
          health_check?: {
            type: 'http' | 'tcp' | 'process';
            url_template?: string; // Handlebars template
          };
        };
      }>()
      .notNull(),
  },
  table => ({
    slugIdx: index('repos_slug_idx').on(table.slug),
  })
);

/**
 * Worktrees table - Git worktrees for isolated development contexts
 *
 * First-class entities for managing work contexts across sessions.
 * Each worktree is an isolated git working directory with its own branch,
 * environment configuration, and persistent work state.
 */
export const worktrees = sqliteTable(
  'worktrees',
  {
    // Primary identity
    worktree_id: text('worktree_id', { length: 36 }).primaryKey(),
    repo_id: text('repo_id', { length: 36 })
      .notNull()
      .references(() => repos.repo_id, { onDelete: 'cascade' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // User attribution
    created_by: text('created_by', { length: 36 }).notNull().default('anonymous'),

    // Materialized for queries
    name: text('name').notNull(), // "feat-auth", "main"
    ref: text('ref').notNull(), // Current branch/tag/commit
    worktree_unique_id: integer('worktree_unique_id').notNull(), // Auto-assigned sequential ID for templates

    // JSON blob for everything else
    data: text('data', { mode: 'json' })
      .$type<{
        // File system
        path: string; // Absolute path to worktree directory

        // Git state (current)
        base_ref?: string; // Branch this diverged from (e.g., "main")
        base_sha?: string; // SHA at worktree creation
        last_commit_sha?: string; // Latest commit
        tracking_branch?: string; // Remote tracking branch
        new_branch: boolean; // Created by Agor?

        // Work context (persistent across sessions)
        issue_url?: string; // GitHub/GitLab issue
        pull_request_url?: string; // PR link
        notes?: string; // Freeform user notes

        // Environment instance (runtime state only, no variables)
        environment_instance?: {
          status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
          process?: {
            pid?: number;
            started_at?: string;
            uptime?: string;
          };
          last_health_check?: {
            timestamp: string;
            status: 'healthy' | 'unhealthy' | 'unknown';
            message?: string;
          };
          access_urls?: Array<{
            name: string;
            url: string;
          }>;
          logs?: string[];
        };

        // Sessions using this worktree
        sessions: string[]; // SessionID[]
        last_used: string; // ISO timestamp

        // Custom context for templates (accessible as {{custom.*}})
        custom_context?: Record<string, unknown>;
      }>()
      .notNull(),
  },
  table => ({
    repoIdx: index('worktrees_repo_idx').on(table.repo_id),
    nameIdx: index('worktrees_name_idx').on(table.name),
    refIdx: index('worktrees_ref_idx').on(table.ref),
    createdIdx: index('worktrees_created_idx').on(table.created_at),
    updatedIdx: index('worktrees_updated_idx').on(table.updated_at),
    // Composite unique constraint (repo + name)
    uniqueRepoName: index('worktrees_repo_name_unique').on(table.repo_id, table.name),
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
    emoji: text('emoji'),
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
 * MCP Servers table - MCP server configurations
 *
 * Stores MCP (Model Context Protocol) server configurations that can be attached to sessions.
 * Supports stdio, HTTP, and SSE transports with scoped access control.
 */
export const mcpServers = sqliteTable(
  'mcp_servers',
  {
    // Primary identity
    mcp_server_id: text('mcp_server_id', { length: 36 }).primaryKey(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }),

    // Materialized for filtering
    name: text('name').notNull(), // e.g., "filesystem", "sentry"
    transport: text('transport', {
      enum: ['stdio', 'http', 'sse'],
    }).notNull(),
    scope: text('scope', {
      enum: ['global', 'team', 'repo', 'session'],
    }).notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    // Scope foreign keys (materialized for indexes)
    owner_user_id: text('owner_user_id', { length: 36 }),
    team_id: text('team_id', { length: 36 }),
    repo_id: text('repo_id', { length: 36 }).references(() => repos.repo_id, {
      onDelete: 'cascade',
    }),
    session_id: text('session_id', { length: 36 }).references(() => sessions.session_id, {
      onDelete: 'cascade',
    }),

    // Source tracking (materialized for queries)
    source: text('source', {
      enum: ['user', 'imported', 'agor'],
    }).notNull(),

    // JSON blob for configuration and capabilities
    data: text('data', { mode: 'json' })
      .$type<{
        display_name?: string;
        description?: string;
        import_path?: string;

        // Transport config
        command?: string;
        args?: string[];
        url?: string;
        env?: Record<string, string>;

        // Discovered capabilities
        tools?: Array<{
          name: string;
          description: string;
          input_schema: Record<string, unknown>;
        }>;
        resources?: Array<{
          uri: string;
          name: string;
          mimeType?: string;
        }>;
        prompts?: Array<{
          name: string;
          description: string;
          arguments?: Array<{
            name: string;
            description: string;
            required?: boolean;
          }>;
        }>;
      }>()
      .notNull(),
  },
  table => ({
    nameIdx: index('mcp_servers_name_idx').on(table.name),
    scopeIdx: index('mcp_servers_scope_idx').on(table.scope),
    ownerIdx: index('mcp_servers_owner_idx').on(table.owner_user_id),
    teamIdx: index('mcp_servers_team_idx').on(table.team_id),
    repoIdx: index('mcp_servers_repo_idx').on(table.repo_id),
    sessionIdx: index('mcp_servers_session_idx').on(table.session_id),
    enabledIdx: index('mcp_servers_enabled_idx').on(table.enabled),
  })
);

/**
 * Session-MCP Servers relationship table
 *
 * Many-to-many relationship between sessions and MCP servers.
 * Tracks which MCP servers are enabled for each session.
 */
export const sessionMcpServers = sqliteTable(
  'session_mcp_servers',
  {
    session_id: text('session_id', { length: 36 })
      .notNull()
      .references(() => sessions.session_id, { onDelete: 'cascade' }),
    mcp_server_id: text('mcp_server_id', { length: 36 })
      .notNull()
      .references(() => mcpServers.mcp_server_id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    added_at: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => ({
    // Composite primary key
    pk: index('session_mcp_servers_pk').on(table.session_id, table.mcp_server_id),
    // Indexes for queries
    sessionIdx: index('session_mcp_servers_session_idx').on(table.session_id),
    serverIdx: index('session_mcp_servers_server_idx').on(table.mcp_server_id),
    enabledIdx: index('session_mcp_servers_enabled_idx').on(table.session_id, table.enabled),
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
export type WorktreeRow = typeof worktrees.$inferSelect;
export type WorktreeInsert = typeof worktrees.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type MCPServerRow = typeof mcpServers.$inferSelect;
export type MCPServerInsert = typeof mcpServers.$inferInsert;
export type SessionMCPServerRow = typeof sessionMcpServers.$inferSelect;
export type SessionMCPServerInsert = typeof sessionMcpServers.$inferInsert;
