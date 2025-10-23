# Architecture

Related: [[core]], [[models]], [[design]], [[id-management]], [[auth]]

**Status:** Implemented (V1 Local Architecture)
**Last Updated:** January 2025

---

## Overview

Agor is a **multi-client agent orchestration platform** with a clean separation between presentation (CLI, GUI) and data layers (daemon + database). The architecture supports:

1. **Local-first development** - Fast offline operations (V1)
2. **Cloud sync path** - Migration to collaborative cloud (V2)
3. **Multi-client** - CLI, GUI, and Desktop share the same API
4. **Real-time updates** - WebSocket-based live sync across clients

**Key Architectural Insight:** Build API layer from day 1, even for local-only V1, to avoid costly retrofit when adding cloud sync.

---

## System Architecture

### Full Stack Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Clients                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   CLI    │  │   GUI    │  │  Desktop │            │
│  │ (oclif)  │  │ (React)  │  │(Electron)│            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       └─────────────┼─────────────┘                    │
└─────────────────────┼──────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│         Feathers Client (@agor/core/api)               │
│  REST + WebSocket + TypeScript SDK                     │
└─────────────────────┬──────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│         Feathers Server (agor-daemon)                  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Services (Business Logic)                       │ │
│  │  - SessionsService: CRUD + fork/spawn/genealogy │ │
│  │  - BoardsService: CRUD + session management     │ │
│  │  - ReposService: Git repository operations      │ │
│  │  - WorktreesService: Git worktree management    │ │
│  │  - TasksService: CRUD + git state tracking      │ │
│  │  - MessagesService: Conversation storage        │ │
│  │  - UsersService: User management + auth         │ │
│  │  - MCPServersService: MCP server configs        │ │
│  │  - SessionMCPServersService: Session MCP links  │ │
│  │  - TerminalsService: WebSocket terminal proxy   │ │
│  │  - ContextService: Context file browser         │ │
│  │  - HealthMonitorService: Real-time diagnostics  │ │
│  └──────────────────┬───────────────────────────────┘ │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐ │
│  │  Hooks (Middleware)                              │ │
│  │  - Authentication (JWT/Local/Anonymous)         │ │
│  │  - Validation (Zod schemas)                      │ │
│  │  - Business rules (genealogy, git state)        │ │
│  │  - Short ID resolution                           │ │
│  └──────────────────┬───────────────────────────────┘ │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐ │
│  │  Drizzle ORM (Data Layer)                        │ │
│  │  - Type-safe queries                             │ │
│  │  - Hybrid materialization (columns + JSON)      │ │
│  │  - Transaction support                           │ │
│  └──────────────────┬───────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼────────┐
│  LibSQL        │         │  PostgreSQL     │
│  (V1 Local)    │         │  (V2 Cloud)     │
│  ~/.agor/      │         │  Turso/Supabase │
│  sessions.db   │         │                 │
└────────────────┘         └─────────────────┘
```

### Technology Stack

| Layer               | Technology                  | Why                                                         |
| ------------------- | --------------------------- | ----------------------------------------------------------- |
| **API Framework**   | FeathersJS                  | REST + WebSocket unified, service-based architecture        |
| **Agent Execution** | Claude Agent SDK            | Claude Code capabilities, CLAUDE.md loading, built-in tools |
| **ORM**             | Drizzle                     | Lightweight, type-safe, SQL-first, LibSQL support           |
| **Local DB**        | LibSQL/SQLite               | File-based, offline-first, embedded replicas                |
| **Cloud DB**        | PostgreSQL (Turso/Supabase) | Scalable, LibSQL compatible via Turso                       |
| **UI Framework**    | React + Vite                | Fast dev, HMR, component-based                              |
| **CLI Framework**   | oclif                       | TypeScript, plugin system, enterprise-grade                 |
| **Desktop**         | Electron or Tauri           | Native app, bundles daemon + UI                             |
| **Monorepo**        | Turborepo + pnpm            | Fast builds, shared packages                                |

---

## Persistence Layer

### Philosophy: Hybrid Materialization

**Strategy:** Materialize what we query by, JSON-ify what we don't.

This approach enables:

- **Migration-free schema evolution** - Most changes are TypeScript-only
- **Cross-database compatibility** - Same code works in LibSQL and PostgreSQL
- **Query performance** - Materialized columns get indexes
- **Flexibility** - JSON blobs adapt without migrations

### Materialized Columns (Indexed)

Create columns for:

- **Identity:** Primary keys, foreign keys
- **Filters:** status, agent, board_id
- **Joins:** Genealogy (parent_session_id, forked_from_session_id)
- **Lookups:** slug, name
- **Sorts:** created_at, updated_at

All materialized columns get B-tree indexes.

### JSON Blobs (Flexible Schema)

Store in `data` column:

- **Nested objects:** git_state, repo config, message_range
- **Arrays:** concepts[], tasks[], children[], worktrees[]
- **Rarely queried:** description, agent_version, color, icon
- **Metadata:** tool_use_count, message_count

### Example Schema (Sessions Table)

**Materialized columns:**

```typescript
{
  session_id: text('session_id').primaryKey(),
  status: text('status', { enum: ['idle', 'running', 'completed', 'failed'] }),
  agentic_tool: text('agentic_tool', { enum: ['claude-code', 'cursor', 'codex', 'gemini'] }),
  board_id: text('board_id'),
  parent_session_id: text('parent_session_id'),
  forked_from_session_id: text('forked_from_session_id'),
  worktree_id: text('worktree_id').notNull().references(() => worktrees.worktree_id),
  created_by: text('created_by').notNull().default('anonymous'),
  created_at: integer('created_at', { mode: 'timestamp_ms' }),
  updated_at: integer('updated_at', { mode: 'timestamp_ms' }),
}
```

**JSON blob:**

```typescript
data: json('data').$type<{
  agentic_tool_version?: string;
  sdk_session_id?: string; // SDK session ID for conversation continuity
  title?: string; // Session title
  description?: string; // Legacy field
  git_state: { ref, base_sha, current_sha };
  genealogy: { fork_point_task_id?, spawn_point_task_id?, children[] };
  contextFiles: string[]; // Context file paths
  tasks: string[]; // Task IDs
  message_count: number;
  tool_use_count: number;
  permission_config?: { allowedTools?, mode? };
  model_config?: { mode, model, updated_at, notes? };
  custom_context?: Record<string, unknown>; // Handlebars template context
}>()
```

### Query Patterns

**✅ Fast (uses materialized columns):**

```typescript
// Filter by status (indexed)
.where(eq(sessions.status, 'running'))

// Genealogy tree queries (indexed)
.where(eq(sessions.parent_session_id, sessionId))

// Multi-filter (all indexed)
.where(and(
  eq(sessions.agent, 'claude-code'),
  eq(sessions.status, 'running'),
  eq(sessions.board_id, boardId)
))
```

**✅ Still works (JSON access):**

```typescript
// Access nested JSON (Drizzle handles cross-DB)
.select({
  concepts: sessions.data.concepts,
  gitRef: sessions.data.git_state.ref,
})
```

**❌ Avoid (requires JSON filtering):**

```typescript
// Can't efficiently filter by JSON nested fields
.where(eq(sessions.data.git_state.ref, 'main')) // NO INDEX!

// If this becomes common, materialize git_ref as column
```

### V1 → V2 Migration Path

**No schema changes needed!** 🎉

1. **Change driver:**

   ```typescript
   // V1
   import { drizzle } from 'drizzle-orm/libsql';

   // V2
   import { drizzle } from 'drizzle-orm/postgres-js';
   ```

2. **Data type mapping:**
   - `text()` → `text()`
   - `integer()` → `bigint()` or `integer()`
   - `json()` → `jsonb()` (PostgreSQL native)

3. **Indexes preserved:**
   - All indexes work identically
   - PostgreSQL has better JSON indexing (GIN indexes if needed)

**See:** `packages/@agor/core/src/db/schema.ts` for complete schema implementation.

---

## API Layer (FeathersJS)

### Why FeathersJS?

**Chosen over alternatives (NestJS, tRPC, Express) because:**

1. **Unified REST + WebSocket** - Single service definition generates both
2. **Service-based architecture** - Maps cleanly to Agor domains
3. **Real-time built-in** - No manual Socket.IO setup
4. **Lightweight** - ~20kb core (vs NestJS ~enterprise scale)
5. **Offline-first client** - `@feathersjs-offline/client` support

### Service Example

**Define once, get REST + WebSocket + typed client:**

```typescript
// agor-daemon/src/services/sessions/sessions.service.ts
export class SessionService implements ServiceMethods<Session> {
  constructor(private db: DrizzleClient) {}

  async find(params: Params): Promise<Paginated<Session>> {
    return await this.db.select().from(sessions).all();
  }

  async get(id: string): Promise<Session> {
    return await resolveShortId(this.db, sessions, id);
  }

  async create(data: Partial<Session>): Promise<Session> {
    const session = { ...data, session_id: generateId() };
    return await this.db.insert(sessions).values(session).returning().get();
  }

  // Custom methods for fork/spawn
  async fork(id: string, prompt: string): Promise<Session> {
    const parent = await this.get(id);
    return await this.create({
      ...parent,
      session_id: generateId(),
      genealogy: { forked_from_session_id: id, ... },
      description: prompt,
    });
  }
}
```

**Automatically get REST endpoints:**

```
GET    /sessions
GET    /sessions/:id
POST   /sessions
PATCH  /sessions/:id
DELETE /sessions/:id
POST   /sessions/:id/fork    # Custom method
POST   /sessions/:id/spawn   # Custom method
```

**Real-time events:**

```typescript
// Client automatically receives WebSocket events
client.service('sessions').on('created', session => {
  console.log('New session:', session);
});
```

### CLI Integration

**CLI as Feathers client:**

```typescript
// agor-cli/src/commands/session/list.ts
import { createClient, isDaemonRunning } from '@agor/core/api';

export default class SessionList extends Command {
  async run() {
    const daemonUrl = process.env.AGOR_DAEMON_URL || 'http://localhost:3030';

    // Check if daemon is running
    if (!(await isDaemonRunning(daemonUrl))) {
      this.error('Daemon not running. Start it with: cd apps/agor-daemon && pnpm dev');
    }

    const client = createClient(daemonUrl);
    const sessions = await client.service('sessions').find({
      query: { $limit: 50, $sort: { created_at: -1 } },
    });

    // Display in table...
  }
}
```

### React Integration

**UI as Feathers client with real-time hooks:**

```typescript
// agor-ui/src/hooks/useSessions.ts
import { useState, useEffect } from 'react';
import { createClient } from '@agor/core/api';

export function useSessions(boardId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const client = createClient();

  useEffect(() => {
    const sessionsService = client.service('sessions');

    // Initial fetch
    sessionsService.find({ query: { board_id: boardId } }).then(result => setSessions(result.data));

    // Real-time listeners
    sessionsService.on('created', session => {
      setSessions(prev => [...prev, session]);
    });

    sessionsService.on('patched', session => {
      setSessions(prev => prev.map(s => (s.session_id === session.session_id ? session : s)));
    });

    return () => {
      sessionsService.removeListener('created');
      sessionsService.removeListener('patched');
    };
  }, [boardId]);

  return { sessions };
}
```

---

## Agent Execution Layer

### Overview

Agor executes prompts against AI agents (Claude Code, Cursor, etc.) through a unified execution layer. For Claude, we use the **Claude Agent SDK** which provides Claude Code's full capabilities including automatic CLAUDE.md loading, built-in tools, and proper system prompts.

### Architecture: ClaudePromptService

**Location:** `packages/core/src/tools/claude/prompt-service.ts`

The `ClaudePromptService` handles:

1. Loading conversation history from database
2. Building system prompts with session context
3. Executing prompts via Claude Agent SDK
4. Creating user + assistant messages in database
5. Emitting WebSocket events for real-time UI updates

### SDK Evolution

**V1 (Basic SDK)** → `@anthropic-ai/sdk`

- ❌ No CLAUDE.md support
- ❌ No built-in tools
- ❌ Manual system prompt construction
- ✅ Lightweight (~20kb)

**V2 (Agent SDK)** → `@anthropic-ai/claude-agent-sdk`

- ✅ Automatic CLAUDE.md loading via `settingSources: ['project']`
- ✅ Preset system prompts via `preset: 'claude_code'`
- ✅ Built-in tools (Read, Write, Bash, etc.) - optional
- ✅ CWD management
- ✅ Streaming via async generators
- ✅ Same behavior as Claude Code CLI

### Prompt Execution Flow

```
User sends prompt → Daemon
          ↓
  [PHASE 1: Create Task]
  - Create task with status='running'
  - Update session.tasks[] immediately
  - UI shows task with spinner
          ↓
  [PHASE 2: Execute via Agent SDK]
  - Load conversation history (last 10 messages)
  - Build system prompt with cwd, repo, git state
  - Load CLAUDE.md from working directory
  - Call Claude API with Agent SDK query()
  - Stream response tokens (future: SSE to UI)
          ↓
  [PHASE 3: Store Messages]
  - Create user message in database
  - Create assistant message in database
  - Link messages to task via task_id
  - WebSocket events emitted automatically
          ↓
  [PHASE 4: Complete Task]
  - Update task status to 'completed'
  - Update message_range with end timestamp
  - UI removes spinner, shows completion
```

### Agent SDK Configuration

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = query({
  prompt: userPrompt,
  options: {
    cwd: session.repo.cwd, // Working directory for file access
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code', // Loads Claude Code system prompt
    },
    settingSources: ['project'], // Auto-loads CLAUDE.md!
    model: 'claude-sonnet-4-5-20250929',
    allowedTools: [], // Disable tools for now (messages-only mode)
  },
});

// Stream responses (async generator)
for await (const chunk of result) {
  if (chunk.type === 'text') {
    // Handle text chunk
  }
}
```

### CLAUDE.md Loading

The Agent SDK automatically loads `CLAUDE.md` from the session's working directory when:

- `settingSources: ['project']` is set
- `systemPrompt.preset: 'claude_code'` is used

This matches the Claude Code CLI behavior exactly. No manual file reading needed!

### WebSocket Event Flow

**Critical:** Must use `app.service('messages')` instead of raw service instance to emit events.

```typescript
// ❌ WRONG - No WebSocket events emitted
const messagesService = createMessagesService(db);
await messagesService.create(message);

// ✅ CORRECT - Events emitted to all clients
const messagesService = app.service('messages');
await messagesService.create(message);
```

**Event types:**

- `created` - New message/task/session created
- `patched` - Message/task/session updated
- `removed` - Message/task/session deleted

**UI receives events via hooks:**

```typescript
// agor-ui/src/hooks/useMessages.ts
client.service('messages').on('created', message => {
  setMessages(prev => [...prev, message]);
});
```

### Message-Task Linking

Messages are created first, then linked to tasks:

```typescript
// 1. Create messages via ClaudePromptService
const { userMessageId, assistantMessageId } = await claudeTool.executePrompt(sessionId, prompt);

// 2. Link messages to task
await messagesService.patch(userMessageId, { task_id: taskId });
await messagesService.patch(assistantMessageId, { task_id: taskId });
```

This approach allows:

- Immediate task creation (UI shows spinner)
- Slow Claude API call (streaming response)
- Retroactive linking once complete

### Conversation History Management

**Strategy:** Load last N messages (default: 10) for context

```typescript
async loadConversationHistory(sessionId: SessionID, limit: number = 10) {
  const messages = await this.messagesRepo.findBySessionId(sessionId);
  const recentMessages = messages.slice(-limit);

  // Filter out tool-only messages (empty content)
  return recentMessages.filter(m => m.content && m.content.length > 0);
}
```

**Why 10 messages?**

- Balances context vs token usage
- Prevents context window overflow on long sessions
- User can increase via config if needed

### Future: Tool Support

The Agent SDK supports tools (Read, Write, Bash, etc.). When enabled:

```typescript
options: {
  allowedTools: ['Read', 'Write', 'Bash'],  // Enable specific tools
  toolChoice: 'auto',  // Let Claude decide when to use tools
}
```

This enables:

- Claude can read files directly
- Claude can edit files in worktree
- Claude can run bash commands
- Full Claude Code CLI parity

**Implementation status:** Disabled for now (messages-only mode)

---

## Git Worktree Integration

### Why Worktrees?

Git worktrees are **critical for parallel AI-assisted development**:

- No stashing/committing WIP to switch branches
- Test experimental approaches in parallel
- Run multiple agent sessions simultaneously
- Fork/spawn sessions naturally map to worktrees

### Directory Structure

```
~/.agor/
├── sessions.db              # LibSQL database
│
├── repos/                   # Agor-managed bare repositories
│   ├── myapp/              # Bare clone (slug: myapp)
│   │   ├── config
│   │   ├── HEAD
│   │   ├── objects/
│   │   └── refs/
│   └── backend/            # Another repo
│
├── worktrees/              # Agor-managed worktrees
│   ├── myapp/
│   │   ├── main/          # Worktree on main branch
│   │   ├── feat-auth/     # Worktree on feat-auth branch
│   │   └── fix-cors/      # Worktree on fix-cors branch
│   └── backend/
│       └── api-v2/        # Worktree on api-v2 branch
│
└── config.json            # Global configuration
```

### Repository Management

**Add repository:**

```bash
$ agor repo add https://github.com/user/myapp.git

Cloning repository...
✓ Cloned to ~/.agor/repos/myapp
✓ Created worktree at ~/.agor/worktrees/myapp/main

Repository added:
  Slug:    myapp
  Remote:  https://github.com/user/myapp.git
  Path:    ~/.agor/repos/myapp
```

**Create worktree:**

```bash
$ agor repo worktree add myapp feat-auth

Creating worktree 'feat-auth'...
✓ Created worktree at ~/.agor/worktrees/myapp/feat-auth
✓ Created branch feat-auth from main

Worktree ready. Start a session:
  agor session start --repo myapp --worktree feat-auth
```

### Session → Worktree Mapping

Each session can optionally link to an Agor-managed worktree:

```typescript
Session {
  session_id: "01933e4a-...",
  repo: {
    repo_id: "01933abc-...",      // Links to repos table
    repo_slug: "myapp",
    worktree_name: "feat-auth",   // Links to worktree
    cwd: "~/.agor/worktrees/myapp/feat-auth",
    managed_worktree: true,       // Agor manages this worktree
  },
  git_state: {
    ref: "feat-auth",
    base_sha: "a4f2e91",
    current_sha: "b3e4d12",
  },
}
```

**Benefits:**

- Session isolation via separate working directories
- Parallel development without context switching
- Clean genealogy tracking (fork → new worktree)

---

## Real-Time Sync

### V1: Local Multi-Client Sync

**Scenario:** User opens Agor CLI + GUI simultaneously

```
CLI (Terminal 1)          FeathersJS Daemon          GUI (Browser)
      │                         │                         │
      ├─ Create session ────────┤                         │
      │                         ├─ Persist to DB          │
      │                         ├─ Emit 'created' ────────┤
      │                         │                         │
      │                         │      ┌─ Update UI ──────┘
      │                         │      │
      ├─ List sessions ─────────┤      │
      │◄─ Returns all ──────────┘      │
      │  (including GUI's)             │
```

**WebSocket events propagate across all connected clients** - CLI and GUI stay in sync.

### V2: Cloud Sync (Future)

**Multi-user collaboration:**

```
User A's CLI ──┐
               ├──→ Cloud Feathers ──→ PostgreSQL
User B's GUI ──┘         │
                        ├──→ WebSocket broadcast
                        │
          ┌─────────────┴─────────────┐
          │                           │
     User A hears                User B hears
     "User B created session"    "User A forked session"
```

---

## Monorepo Structure

```
agor/
├── apps/
│   ├── agor-daemon/              # Feathers API server
│   │   ├── src/
│   │   │   ├── index.ts         # Main daemon entry
│   │   │   ├── services/
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── boards.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── repos.ts
│   │   │   │   ├── worktrees.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── mcp-servers.ts
│   │   │   │   ├── session-mcp-servers.ts
│   │   │   │   ├── terminals.ts
│   │   │   │   ├── context.ts
│   │   │   │   └── health-monitor.ts
│   │   │   └── strategies/      # Auth strategies
│   │   └── package.json
│   │
│   ├── agor-cli/                 # CLI (oclif)
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── repo/
│   │   │   │   ├── session/
│   │   │   │   ├── board/
│   │   │   │   ├── user/
│   │   │   │   ├── worktree/
│   │   │   │   └── config/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   ├── agor-ui/                  # React + Vite + Ant Design
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── agor-docs/                # Nextra documentation site
│       ├── pages/
│       │   ├── guide/           # Getting started, Docker, development
│       │   ├── cli/             # CLI reference (auto-generated)
│       │   └── api-reference/   # REST + WebSocket docs
│       ├── scripts/
│       │   └── generate-cli-docs.ts
│       └── package.json
│
├── packages/
│   └── @agor/core/              # Consolidated core package
│       ├── src/
│       │   ├── api/             # Feathers client (formerly @agor/feathers-client)
│       │   ├── db/              # Drizzle schema (formerly @agor/drizzle-schema)
│       │   ├── git/             # Git utilities
│       │   └── types/           # TypeScript types (formerly @agor/types)
│       └── package.json
│
├── context/                     # Architecture documentation
│   ├── concepts/                # Core design docs
│   │   ├── core.md
│   │   ├── models.md
│   │   ├── architecture.md      # ← This file
│   │   ├── design.md
│   │   └── id-management.md
│   └── explorations/            # WIP designs
│
├── package.json                 # Turborepo root
├── turbo.json                   # Turborepo config
└── pnpm-workspace.yaml         # pnpm workspaces
```

---

## Key Architectural Decisions

### 1. Why Local Daemon Pattern?

**Benefits:**

- CLI/GUI don't need database drivers (lighter clients)
- Consistent API interface (local = cloud)
- Business logic in one place (daemon)
- Easier to add auth/validation later
- Auto-start daemon on first CLI command

**Precedents:**

- Docker Desktop (Docker daemon)
- Git LFS (LFS server)
- VSCode (extension host)

### 2. Why Feathers over NestJS?

**Feathers:**

- ✅ REST + WebSocket from one codebase
- ✅ Service-based architecture (maps to Agor domains)
- ✅ Lightweight (~20kb core)

**NestJS:**

- ⚠️ Enterprise-scale (overkill for local daemon)
- ⚠️ No built-in WebSocket (need Socket.IO separately)
- ✅ Better for large teams, microservices

### 3. Why Drizzle + Feathers?

Feathers supports multiple ORMs. Drizzle gives:

- ✅ Better TypeScript inference
- ✅ LibSQL support (via Turso)
- ✅ Lightweight (7kb vs 100kb+ for Sequelize)
- ✅ SQL-first approach (easier complex queries)

### 4. Why Hybrid Schema (Columns + JSON)?

**Materialized columns:**

- Fast queries with indexes
- Type-safe filters and joins

**JSON blobs:**

- Migration-free schema evolution
- Flexible nested structures
- No ALTER TABLE for new fields

**Best of both worlds:** Query performance + schema flexibility.

---

## Performance Benchmarks

**Current V1 targets:**

- Insert session: < 10ms ✅
- Query by status: < 5ms (indexed) ✅
- Genealogy tree (10 levels): < 50ms ✅
- Short ID lookup: < 5ms (B-tree prefix) ✅
- JSON field access: < 10ms ✅

**PostgreSQL improvements (V2):**

- GIN indexes on JSON arrays (concepts, tasks)
- Parallel query execution
- Better JSON operators (`@>`, `?`, `?&`)

---

## Implementation Status

**✅ Completed:**

- Monorepo structure (Turborepo + pnpm)
- Drizzle schema with hybrid materialization
- UUIDv7 ID generation + short ID resolution
- FeathersJS daemon with all core services:
  - SessionsService, BoardsService, TasksService, MessagesService
  - WorktreesService, ReposService
  - UsersService, MCPServersService, SessionMCPServersService
  - TerminalsService (WebSocket terminal proxy)
  - ContextService (context file browser)
  - HealthMonitorService (real-time diagnostics)
- CLI commands (repo, session, board, user, worktree, config)
- Feathers client integration (@agor/core/api)
- Worktree-based session isolation (required foreign key)
- Git operations via simple-git
- Real-time WebSocket events for multiplayer UI
- React UI with multiplayer canvas, session drawer, task visualization
- Claude Code session import from JSONL transcripts
- **Claude Agent SDK integration:**
  - CLAUDE.md auto-loading via `settingSources: ['project']`
  - Preset system prompts (`preset: 'claude_code'`)
  - Live prompt execution with streaming
  - Tool support (Read, Write, Bash, etc.) with permission system
  - Conversation continuity via sdk_session_id
- **Multi-agent support:**
  - Claude Code (Claude Agent SDK)
  - OpenAI Codex (OpenAI SDK with custom permission system)
  - Google Gemini (Google Generative AI SDK - beta)
- **MCP (Model Context Protocol) integration:**
  - MCP server configuration UI
  - Session-level MCP server selection
  - Dynamic tool integration
- **Documentation website:**
  - Nextra-based docs at apps/agor-docs
  - Auto-generated CLI reference
  - Manual REST API documentation
  - Guide and API reference sections

**🚧 In Progress:**

- Session fork/spawn UI and genealogy visualization
- Task completion tracking improvements
- Concept management system
- Report generation system

**📋 Planned:**

- Desktop app (Electron/Tauri)
- Cloud sync (V2 with PostgreSQL)
- Advanced permission modes for all agents
- Automated test generation
- CI/CD pipeline integration

---

## References

**Internal Docs:**

- [[core]] - Vision and primitives
- [[models]] - Data model definitions
- [[design]] - UI/UX standards
- [[id-management]] - UUIDv7 strategy
- [[auth]] - Authentication & authorization

**External Resources:**

- FeathersJS: https://feathersjs.com/
- Drizzle ORM: https://orm.drizzle.team/
- LibSQL: https://github.com/tursodatabase/libsql
- Turso (LibSQL cloud): https://turso.tech/
