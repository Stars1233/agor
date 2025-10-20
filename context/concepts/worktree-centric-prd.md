# Worktree-Centric Architecture: PRD

**Status:** PRD (Product Requirements Document)
**Created:** 2025-01-19
**Author:** Claude Code (with Max)
**Epic:** Worktree-First Design + Data Model Normalization

---

## Executive Summary

**Vision:** Elevate worktrees to first-class status alongside sessions.

**Core Insight:** Sessions and worktrees are complementary. Sessions = conversations with AI, Worktrees = persistent work contexts (git + environment + metadata). Both are essential.

**Deliverables:**

1. Normalize worktrees into dedicated database table (from nested JSON arrays)
2. Build Worktree Modal (central hub for all worktree context)
3. Add Settings → Worktrees top-level tab
4. Integrate environments, concepts, and sessions into worktree context
5. Web-based terminal (xterm.js + node-pty)

**Timeline:** 4 weeks (4 phases)

**Impact:**

- ✅ Worktrees become first-class entities (their own table, queryable, indexable)
- ✅ Sessions remain primary workflow (boards organize sessions)
- ✅ One-click environment management per worktree
- ✅ Issue/PR tracking at worktree level (persistent across sessions)
- ✅ Worktree-specific concepts (CLAUDE.md from repo, not Agor meta-docs)
- ✅ Session history per worktree (see who worked on what, when)
- ✅ Terminal access to worktree directory

**What stays the same:**

- ✅ Boards organize sessions (many-to-many)
- ✅ Users create sessions to work with AI agents
- ✅ Sessions are the primary UX (boards → sessions → conversation)
- ✅ Worktrees are optional (sessions can exist without worktrees)

---

## Table of Contents

1. [Paradigm Shift: From Sessions to Worktrees](#paradigm-shift)
2. [Data Model: Normalization](#data-model-normalization)
3. [UI: Worktree Modal](#ui-worktree-modal)
4. [Features](#features)
   - [Environment Management](#environment-management)
   - [Concept Files](#concept-files)
   - [Terminal Integration](#terminal-integration)
5. [Implementation Phases](#implementation-phases)
6. [Migration Strategy](#migration-strategy)
7. [User Flows](#user-flows)

---

<a name="paradigm-shift"></a>

## 1. Paradigm Shift: Elevating Worktrees

### Sessions AND Worktrees are Both First-Class

**Current State:**

- ✅ Sessions are first-class (queryable, displayed on boards)
- ❌ Worktrees are buried (nested in repos, hard to manage)

**Proposed State:**

- ✅ Sessions are first-class (boards organize sessions)
- ✅ Worktrees are first-class (their own table, UI, modal)

**Complementary Relationship:**

```
Boards
  ├─ Organize sessions (many-to-many)
  └─ Can include sessions from multiple repos/worktrees

Sessions
  ├─ Conversations with AI agents
  ├─ Live on boards
  └─ Reference a worktree (via FK)

Worktrees
  ├─ Isolated git + environment contexts
  ├─ Track persistent work state (issues, PRs, environments)
  └─ Container for multiple sessions (over time)
```

**Key Insight:** Sessions are conversations, worktrees are work contexts. Both are essential.

### Old Model (Worktrees Buried)

```
User → Board → Session → (buried) Worktree info in header
                       → Settings → Repos → (nested) Worktrees
```

Worktrees are hard to discover and manage.

### New Model (Worktrees Elevated)

```
User → Board → Session (primary workflow)
    ↓
    → Settings → Worktrees (top-level management)
         ↓
         → Worktree Modal (view context, sessions, environment)

Session Header "Worktree: feat-auth" → Clickable → Opens Worktree Modal
```

Worktrees get their own management UI, but **sessions remain the primary workflow**.

### Why Elevate Worktrees?

1. **Worktrees provide persistent context for sessions**
   - User works on `feat-auth` across multiple sessions (morning session, afternoon session)
   - Sessions are ephemeral conversations, worktrees are the persistent work container
   - Sessions reference worktrees, not vice-versa

2. **Worktrees have state that outlives sessions**
   - Git branch/commits (persist after session ends)
   - Environment configuration (dev server keeps running)
   - Issue/PR associations (work continues across sessions)
   - Concept files (CLAUDE.md, context/\*.md in repo)

3. **Worktrees enable collaboration**
   - Alice creates session in `feat-auth` worktree, works on issue
   - Bob creates new session in same `feat-auth` worktree, continues work
   - Both sessions share: environment URL, git branch, concepts
   - Board can show both sessions (from different worktrees)

4. **Worktrees map to work units**
   - 1 worktree = 1 feature / 1 bug fix / 1 experiment
   - 1 worktree = 1 PR (often)
   - 1 worktree = isolated dev environment + git branch
   - Multiple sessions can work on same worktree over time

**What doesn't change:**

- ✅ Boards still organize **sessions** (not worktrees)
- ✅ Sessions are still the primary workflow (boards → sessions → work)
- ✅ Users still create sessions to talk to AI agents
- ✅ Sessions can reference any worktree (or no worktree)
- ✅ Boards are many-to-many with sessions (flexible organization)

### Boards, Sessions, Worktrees: The Full Picture

```
Boards (Organize work)
  ├─ "Feature: Payments" board
  │  ├─ Session A (worktree: feat-payment, user: Alice)
  │  ├─ Session B (worktree: feat-payment, user: Bob)
  │  └─ Session C (worktree: fix-stripe-bug, user: Alice)
  │
  └─ "Sprint 23" board
     ├─ Session D (worktree: feat-auth, user: Charlie)
     ├─ Session E (worktree: feat-payment, user: Alice)  ← Same session as above
     └─ Session F (no worktree, user: Bob)  ← Ad-hoc session

Sessions (Conversations)
  ├─ Reference a worktree (optional FK)
  ├─ Live on one or more boards
  └─ Contain messages, tasks, git snapshots

Worktrees (Work contexts)
  ├─ Isolated git branches + environments
  ├─ Track persistent state (issue, PR, environment)
  ├─ Referenced by multiple sessions (over time)
  └─ NOT displayed on boards (sessions are)
```

**Key Design Principle:**

- **Boards** organize **sessions** (many-to-many)
- **Sessions** reference **worktrees** (many-to-one, optional)
- Boards can contain sessions from different repos, worktrees, users - whatever makes sense!

---

<a name="data-model-normalization"></a>

## 2. Data Model: Normalization

### Current State: Nested Arrays ❌

**Current Schema:**

```typescript
// repos table
repos = {
  repo_id: UUID (PK),
  slug: string (unique),
  data: {
    name: string,
    worktrees: WorktreeConfig[], // ← Array in JSON blob
  }
}
```

**Problems:**

1. ❌ Can't query worktrees directly (must load entire repo)
2. ❌ Can't index worktrees (no search by name, branch, etc.)
3. ❌ Can't reference worktrees (no worktree_id for foreign keys)
4. ❌ Awkward updates (must load repo, mutate array, save repo)
5. ❌ Poor scalability (repo with 100 worktrees = huge JSON blob)
6. ❌ No worktree-level permissions
7. ❌ Hard to add worktree-specific features (issue_url, environment, etc.)

### Proposed: Normalized Worktrees Table ✅

**New Schema:**

```sql
CREATE TABLE worktrees (
  -- Primary identity
  worktree_id TEXT PRIMARY KEY, -- UUIDv7
  repo_id TEXT NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,

  -- User attribution
  created_by TEXT NOT NULL DEFAULT 'anonymous',

  -- Materialized for queries
  name TEXT NOT NULL, -- "feat-auth", "main"
  ref TEXT NOT NULL,  -- Current branch/tag/commit

  -- JSON blob for everything else
  data TEXT NOT NULL,

  -- Composite unique constraint
  UNIQUE(repo_id, name)
);

-- Indexes for fast queries
CREATE INDEX worktrees_repo_idx ON worktrees(repo_id);
CREATE INDEX worktrees_name_idx ON worktrees(name);
CREATE INDEX worktrees_ref_idx ON worktrees(ref);
CREATE INDEX worktrees_created_idx ON worktrees(created_at);
CREATE INDEX worktrees_updated_idx ON worktrees(updated_at);
```

**New Worktree Type:**

```typescript
export interface Worktree {
  // ===== Primary identity =====
  worktree_id: UUID;
  repo_id: UUID;
  created_at: string;
  updated_at: string;
  created_by: UUID;

  // ===== Materialized (for indexes) =====
  name: WorktreeName; // "feat-auth"
  ref: string; // Current branch

  // ===== JSON blob (data column) =====

  /** Absolute path to worktree directory */
  path: string;

  /** Whether this is a new branch created by Agor */
  new_branch: boolean;

  /** Remote tracking branch */
  tracking_branch?: string;

  /** Sessions using this worktree */
  sessions: SessionID[];

  /** Last git commit SHA */
  last_commit_sha?: string;

  /** Last time worktree was used */
  last_used: string;

  // ===== NEW FIELDS (worktree-centric design) =====

  /**
   * Associated GitHub/GitLab issue
   *
   * Links worktree to issue it addresses.
   * Worktree-level (not session) because work persists across sessions.
   */
  issue_url?: string;

  /**
   * Associated pull request
   *
   * Links worktree to PR containing changes.
   * Auto-populated when user creates PR.
   */
  pull_request_url?: string;

  /**
   * Freeform notes about this worktree
   *
   * User can document what they're working on, blockers, etc.
   */
  notes?: string;

  /**
   * Environment instance (if repo has environment config)
   *
   * Tracks runtime state, process info, variable values.
   */
  environment_instance?: WorktreeEnvironmentInstance;

  /**
   * Git base information
   *
   * Tracks what commit/branch this worktree diverged from.
   */
  base_ref?: string; // e.g., "main"
  base_sha?: string; // SHA at worktree creation
}

export interface WorktreeEnvironmentInstance {
  /** Instance-specific variable values */
  variables: Record<string, string | number>;
  // Example: { UI_PORT: 5173, DAEMON_PORT: 3030 }

  /** Current environment status */
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

  /** Process metadata (if managed by Agor) */
  process?: {
    pid?: number;
    started_at?: string;
    uptime?: string;
  };

  /** Last health check result */
  last_health_check?: {
    timestamp: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    message?: string;
  };

  /** Resolved access URLs (after template substitution) */
  access_urls?: Array<{
    name: string;
    url: string;
  }>;

  /** Process logs (last N lines) */
  logs?: string[];
}
```

### Repo Type Changes

**Remove worktrees array, add environment config:**

```typescript
export interface Repo {
  // ===== Existing fields =====
  repo_id: UUID;
  slug: RepoSlug;
  name: string;
  remote_url?: string;
  local_path: string;
  managed_by_agor: boolean;
  default_branch?: string;
  created_at: string;
  last_updated: string;

  // ❌ REMOVED: worktrees: WorktreeConfig[];

  // ===== NEW FIELD =====

  /**
   * Environment configuration template
   *
   * Defines how to run environments for all worktrees in this repo.
   */
  environment_config?: RepoEnvironmentConfig;
}

export interface RepoEnvironmentConfig {
  /** Command to start environment (templated) */
  up_command: string;

  /** Command to stop environment (templated) */
  down_command: string;

  /** Template variables that worktrees must provide */
  template_vars: string[];

  /** Optional health check */
  health_check?: {
    type: 'http' | 'tcp' | 'process';
    url_template?: string; // "http://localhost:{{UI_PORT}}/health"
    port_var?: string; // "UI_PORT"
  };
}

/**
 * Example repo environment configs:
 *
 * Docker Compose (Agor):
 * {
 *   up_command: "PORT={{UI_PORT}} docker compose -p {{worktree.name}} up --build -d",
 *   down_command: "docker compose -p {{worktree.name}} down",
 *   template_vars: ["UI_PORT", "DAEMON_PORT"],
 *   health_check: { type: "http", url_template: "http://localhost:{{UI_PORT}}/health" }
 * }
 *
 * Vite Dev Server:
 * {
 *   up_command: "PORT={{UI_PORT}} pnpm dev",
 *   down_command: "pkill -f 'vite.*{{UI_PORT}}'",
 *   template_vars: ["UI_PORT"]
 * }
 */
```

### Session Type Changes

**Add foreign key to worktrees:**

```typescript
// sessions schema
export const sessions = sqliteTable('sessions', {
  // ... existing fields ...

  // NEW: Direct foreign key to worktrees
  worktree_id: text('worktree_id', { length: 36 }).references(() => worktrees.worktree_id, {
    onDelete: 'set null',
  }),

  // ... rest of fields ...
});
```

### Benefits of Normalization

1. **Direct Querying**

   ```typescript
   // Before: Load entire repo
   const repo = await reposService.get(repoId);
   const wt = repo.worktrees.find(w => w.name === 'feat-auth');

   // After: Direct query
   const wt = await worktreesService.find({
     query: { repo_id: repoId, name: 'feat-auth' },
   });
   ```

2. **Foreign Key Integrity**

   ```typescript
   // Before: Fragile string reference
   session.data.repo.worktree_name = 'feat-auth';

   // After: Safe foreign key with CASCADE
   session.worktree_id = 'abc123';
   ```

3. **Indexing & Performance**

   ```sql
   -- Fast queries via indexes
   SELECT * FROM worktrees WHERE ref LIKE 'feat-%';
   SELECT * FROM worktrees WHERE updated_at > '2025-01-01';
   ```

4. **Efficient Updates**

   ```typescript
   // Before: Mutate nested array
   const repo = await reposService.get(repoId);
   repo.worktrees.find(w => w.name === 'feat-auth').issue_url = url;
   await reposService.patch(repoId, { worktrees: repo.worktrees });

   // After: Direct update
   await worktreesService.patch(worktreeId, { issue_url: url });
   ```

5. **Worktree-Level Permissions (Future)**
   ```typescript
   interface Worktree {
     owner_user_id: UUID;
     collaborators: UUID[];
     visibility: 'private' | 'team' | 'public';
   }
   ```

---

<a name="ui-worktree-modal"></a>

## 3. UI: Worktree Modal

### Updated Settings Structure

**Before:**

```
Settings
├─ Boards
├─ Repositories
│  └─ Worktrees (nested, hard to use)
├─ MCP Servers
├─ Context (shows Agor's docs - confusing!)
└─ Users
```

**After:**

```
Settings
├─ Boards
├─ Repositories
├─ Worktrees                    ← NEW top-level tab!
│  └─ Click row → Worktree Modal
├─ MCP Servers
└─ Users
```

**Context tab removed** - concept files now in Worktree Modal → Concepts tab

### Worktrees Table (New Top-Level Tab)

```
┌─────────────────────────────────────────────────────────────────┐
│ Worktrees                                            [+ Create] │
├─────────────────────────────────────────────────────────────────┤
│ Name       Branch      Env Status  Active Sessions  Last Used  │
├─────────────────────────────────────────────────────────────────┤
│ main       main        ● Running   1                2h ago      │
│ feat-auth  feat-auth   ● Running   2                5m ago      │
│ fix-cors   fix-cors    ○ Stopped   0                3d ago      │
│ exp-ai     experiment  ○ Stopped   1                1w ago      │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**

- Click row → Open Worktree Modal
- "+ Create" → CreateWorktreeModal
- Columns: Name, Branch, Env Status, Active Sessions, Last Used
- Sort by any column
- Filter by repo, status, user

### Worktree Modal Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Worktree: feat-auth                            [×]          │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [General] [Environment] [Concepts] [Sessions] [Repo] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Content varies by tab...]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Opened from:**

- Settings → Worktrees → Click row
- Session header "Worktree: feat-auth" badge → Click
- Board → Right-click session → "View Worktree"

---

<a name="features"></a>

## 4. Features

### Tab 1: General

**Purpose:** Core worktree metadata and git information

```
┌─────────────────────────────────────────────────────────────┐
│ General                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Name: feat-auth                                            │
│ Path: ~/.agor/worktrees/agor/feat-auth                     │
│ Repository: agor                                            │
│                                                             │
│ Git Information:                                            │
│ ├─ Branch: feat-auth                                       │
│ ├─ Base: main (origin/main)                               │
│ ├─ Current SHA: a1b2c3d (clean)                           │
│ └─ Tracking: origin/feat-auth                             │
│                                                             │
│ Work Context:                                               │
│ ├─ Issue: #42 - Add authentication middleware             │
│ │  [Edit] https://github.com/user/repo/issues/42 ↗       │
│ │                                                          │
│ └─ Pull Request: #43 - feat: JWT authentication           │
│    [Edit] https://github.com/user/repo/pull/43 ↗          │
│                                                             │
│ Notes:                                                      │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Implementing JWT auth with refresh tokens.          │   │
│ │ Still need to add rate limiting.                    │   │
│ └─────────────────────────────────────────────────────┘   │
│ [Edit Notes]                                               │
│                                                             │
│ Active Sessions: 2                                          │
│ ├─ Session 0199b856 (Alice) - 2h ago                      │
│ └─ Session 0199c721 (Bob) - 5m ago                        │
│                                                             │
│ Created: 2025-01-18 10:30 AM                               │
│ Last Used: 2025-01-19 3:45 PM                              │
│                                                             │
│ [Delete Worktree] [Open in Terminal]                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Fields:**

- `issue_url` - GitHub/GitLab issue link
- `pull_request_url` - PR link
- `notes` - Freeform user notes (markdown supported)
- Active sessions list (with users)
- "Open in Terminal" button

---

<a name="environment-management"></a>

### Tab 2: Environment

**Purpose:** Manage runtime environment (dev servers, Docker, etc.)

```
┌─────────────────────────────────────────────────────────────┐
│ Environment                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Configuration (from repo "agor"):                           │
│ ├─ Up:   docker compose -p {{worktree.name}} up -d        │
│ ├─ Down: docker compose -p {{worktree.name}} down         │
│ └─ Variables: UI_PORT, DAEMON_PORT                         │
│                                                             │
│ Instance Variables:                                         │
│ ├─ UI_PORT: 5174                         [Edit]           │
│ └─ DAEMON_PORT: 3031                     [Edit]           │
│                                                             │
│ Status: ● Running (healthy)                                │
│ ├─ PID: 12345                                             │
│ ├─ Uptime: 2h 34m                                         │
│ └─ Last health check: 30s ago                             │
│                                                             │
│ Access URLs:                                                │
│ ├─ UI: http://localhost:5174 ↗                            │
│ └─ API: http://localhost:3031 ↗                           │
│                                                             │
│ [Stop] [Restart] [View Logs] [Open Terminal]              │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│ Logs (last 50 lines):                                       │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ [daemon] Starting on port 3031...                   │   │
│ │ [daemon] Database connected                         │   │
│ │ [ui] Vite dev server running on port 5174          │   │
│ │ [ui] ➜ Local: http://localhost:5174/               │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Architecture:**

- **Repo level:** Template (up/down commands, template vars)
- **Worktree level:** Instance (variable values, runtime state)

**Features:**

1. Start/Stop/Restart buttons
2. View Logs (last N lines)
3. Open Terminal (in worktree directory)
4. Auto-port assignment
5. Health check polling
6. Access URLs (clickable links)

**Backend:**

- `EnvironmentsService` - Start/stop processes
- Template engine - Variable substitution
- Process manager - Track PIDs, capture logs
- Health checker - Poll URLs/ports

---

<a name="concept-files"></a>

### Tab 3: Concepts

**Purpose:** Browse and edit concept files (context/\*.md, CLAUDE.md, etc.)

**Current Problem:** Settings → Context shows Agor's meta-documentation!

**Solution:** Worktree Modal → Concepts tab shows files from worktree's git repo

```
┌─────────────────────────────────────────────────────────────┐
│ Concepts                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Context files in this worktree:                             │
│                                                             │
│ 📄 CLAUDE.md                               Updated 2h ago   │
│    Project overview and coding guidelines                   │
│    [View] [Edit]                                           │
│                                                             │
│ 📁 context/                                                 │
│    📄 architecture.md                     Updated 1d ago   │
│       System design and data models                        │
│       [View] [Edit]                                        │
│                                                             │
│    📄 api-design.md                       Updated 3d ago   │
│       REST API endpoints and patterns                      │
│       [View] [Edit]                                        │
│                                                             │
│ 📁 docs/                                                    │
│    📄 setup.md                            Updated 1w ago   │
│       Development environment setup                        │
│       [View] [Edit]                                        │
│                                                             │
│ [+ Create New Concept File]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**

- List all markdown files in worktree
- View button → MarkdownModal (existing component)
- Edit button → In-browser markdown editor (future)
- Create new concept files
- Search/filter files

**Backend:**

```typescript
// services/worktree-concepts.ts
export class WorktreeConceptsService {
  async find(worktreeId: UUID): Promise<ConceptFile[]> {
    const worktree = await worktreesRepository.findById(worktreeId);

    // Search markdown files in worktree directory
    const files = await glob('**/*.md', {
      cwd: worktree.path,
      ignore: ['node_modules/**', '.git/**', 'dist/**'],
    });

    return files.map(file => ({
      path: file,
      title: extractTitle(file),
      size: statSync(join(worktree.path, file)).size,
      updated_at: statSync(join(worktree.path, file)).mtime,
    }));
  }

  async get(worktreeId: UUID, filePath: string): Promise<ConceptFileDetail> {
    const worktree = await worktreesRepository.findById(worktreeId);
    const fullPath = join(worktree.path, filePath);
    const content = await readFile(fullPath, 'utf-8');

    return { path: filePath, title: extractTitle(filePath), content, ... };
  }
}
```

---

### Tab 4: Sessions

**Purpose:** View all sessions that used this worktree

```
┌─────────────────────────────────────────────────────────────┐
│ Sessions                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Active Sessions (2):                                        │
│                                                             │
│ ● Session 0199b856                                         │
│   User: Alice                                              │
│   Agent: Claude (Sonnet 4.5)                               │
│   Started: 2025-01-19 1:15 PM (2h ago)                    │
│   Tasks: 3 (2 completed, 1 in progress)                    │
│   [View Session] [Open in Board]                          │
│                                                             │
│ ● Session 0199c721                                         │
│   User: Bob                                                │
│   Agent: Codex (GPT-4)                                     │
│   Started: 2025-01-19 3:40 PM (5m ago)                    │
│   Tasks: 1 (0 completed, 1 in progress)                    │
│   [View Session] [Open in Board]                          │
│                                                             │
│ Past Sessions (8):                                          │
│                                                             │
│ ○ Session 0199a123                                         │
│   User: Alice                                              │
│   Completed: 2025-01-18 5:30 PM (22h ago)                 │
│   Tasks: 5 (5 completed)                                   │
│   [View Session]                                           │
│                                                             │
│ [Show All Sessions]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**

- List active sessions (real-time)
- List past sessions (completed/failed)
- View Session button → Open SessionDrawer
- Open in Board button → Navigate to session on board
- Filter by user, agent, date

**Query:**

```typescript
const sessions = await sessionsService.find({
  query: {
    worktree_id: worktreeId,
    $sort: { started_at: -1 },
  },
});
```

---

### Tab 5: Repo Config (Optional)

**Purpose:** Show repo-level config (read-only with link to edit)

**Simple Version (Recommended):**

```
┌─────────────────────────────────────────────────────────────┐
│ Repo Config                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ This worktree inherits environment config from repo "agor" │
│                                                             │
│ [View Repo Settings] → Opens Settings → Repositories       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Advanced Version (Future):**

Show read-only preview of repo config + "Edit Repo Config" button that opens RepoModal.

---

<a name="terminal-integration"></a>

### Terminal Integration

**Tech Stack:** xterm.js + node-pty (already in dependencies via Anthropic SDK!)

**UI:** Modal with embedded terminal

**Backend:**

```typescript
// services/terminals.ts
export class TerminalsService {
  private terminals = new Map<UUID, IPty>();

  async create(data: { worktreeId: UUID }): Promise<TerminalSession> {
    const worktree = await worktreesRepository.findById(data.worktreeId);
    const terminalId = generateUUID();

    const pty = spawn('bash', [], {
      cwd: worktree.path,
      env: process.env,
    });

    this.terminals.set(terminalId, pty);

    // Broadcast terminal output via WebSocket
    pty.onData(data => {
      this.emit('data', { terminalId, data });
    });

    return { terminal_id: terminalId, pid: pty.pid };
  }

  async input(terminalId: UUID, data: string): Promise<void> {
    const pty = this.terminals.get(terminalId);
    pty?.write(data);
  }

  async kill(terminalId: UUID): Promise<void> {
    const pty = this.terminals.get(terminalId);
    pty?.kill();
    this.terminals.delete(terminalId);
  }
}
```

**Frontend:**

```typescript
// components/TerminalModal.tsx
export function TerminalModal({ worktreeId, onClose }) {
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({ cursorBlink: true });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current!);
    fitAddon.fit();

    // WebSocket connection to daemon
    const socket = io('http://localhost:3030');
    socket.emit('terminal:create', { worktreeId });

    socket.on('terminal:data', (data) => term.write(data));
    term.onData((data) => socket.emit('terminal:input', data));

    return () => {
      term.dispose();
      socket.close();
    };
  }, [worktreeId]);

  return (
    <Modal open onClose={onClose} title="Terminal" width={800}>
      <div ref={termRef} style={{ height: 500 }} />
    </Modal>
  );
}
```

**Integration Points:**

- "Open Terminal" button in General tab
- "Open Terminal" button in Environment tab
- Terminal sessions persist (can close modal, reopen later)

---

<a name="implementation-phases"></a>

## 5. Implementation Phases

### Phase 0: Data Model Migration (~1 week)

**Goal:** Normalize worktrees into dedicated table

**Tasks:**

1. **Create worktrees table** (schema.ts)
   - `worktree_id`, `repo_id`, `name`, `ref`, `data`, etc.
   - Indexes on repo_id, name, ref, created_at
   - UNIQUE(repo_id, name)

2. **Migration script** (migrate.ts)
   - Read all repos
   - Extract `repos.data.worktrees` arrays
   - Insert into worktrees table
   - Remove worktrees from repos.data (optional cleanup)

3. **Update sessions schema**
   - Add `sessions.worktree_id` foreign key
   - Populate from `sessions.data.repo.worktree_name`

4. **Create WorktreesService**
   - CRUD operations on worktrees table
   - Query by repo_id, name, ref, etc.

5. **Update ReposService**
   - Remove worktrees from Repo type
   - Optional: Add `$populate=worktrees` to load worktrees on demand

6. **Update types** (types/repo.ts)
   - Export `Worktree` interface
   - Remove `worktrees: WorktreeConfig[]` from `Repo`
   - Add new fields to Worktree (issue_url, pr_url, notes, environment_instance)

**Acceptance Criteria:**

- ✅ All existing worktrees migrated to table
- ✅ Sessions reference worktrees via worktree_id
- ✅ Can query worktrees independently of repos
- ✅ No data loss

---

### Phase 1: Worktree Modal UI (~1 week)

**Goal:** Build worktree-centric UI (no environment execution yet)

**Tasks:**

1. **Create WorktreeModal component**
   - General tab (metadata, issue/PR, sessions)
   - Environment tab (show config read-only, edit variables)
   - Concepts tab (list markdown files)
   - Sessions tab (list active/past sessions)
   - Repo tab (link to repo settings)

2. **Add Worktrees tab to Settings**
   - Table view with columns: Name, Branch, Env Status, Sessions, Last Used
   - Click row → Open WorktreeModal
   - "+ Create" button → CreateWorktreeModal

3. **Update SessionHeader**
   - Make "Worktree: feat-auth" clickable → Opens WorktreeModal

4. **Backend services**
   - WorktreeConceptsService (list markdown files from worktree path)
   - Update WorktreesService with new fields (issue_url, pr_url, notes)

5. **Database columns**
   - Ensure worktrees.data includes: issue_url, pr_url, notes, environment_instance

**Acceptance Criteria:**

- ✅ Settings → Worktrees tab exists
- ✅ Can open Worktree Modal from multiple places
- ✅ All 5 tabs render correctly
- ✅ Can edit issue_url, pr_url, notes
- ✅ Can browse concept files

---

### Phase 2: Environment Execution (~1 week)

**Goal:** Enable start/stop/restart environments from Worktree Modal

**Tasks:**

1. **Backend: EnvironmentsService**
   - `start(worktreeId)` - Resolve template, spawn process
   - `stop(worktreeId)` - Kill process
   - `restart(worktreeId)` - Stop then start
   - `getLogs(worktreeId, tail?)` - Return stdout/stderr
   - Health check polling (background job)

2. **Template engine**
   - Variable substitution: `{{worktree.name}}`, `{{UI_PORT}}`, etc.
   - Spawn with `child_process.spawn()`
   - Capture PID, stream logs to worktree.environment_instance.logs

3. **Frontend updates**
   - Environment tab: Enable Start/Stop/Restart buttons
   - Show real-time status (WebSocket or polling)
   - "View Logs" expands log viewer

4. **Repo environment config UI**
   - Settings → Repositories → Click repo → Edit environment config
   - Form: up_command, down_command, template_vars, health_check

**Acceptance Criteria:**

- ✅ Can configure repo-level environment template
- ✅ Can start/stop/restart environments per worktree
- ✅ See real-time status (Running/Stopped)
- ✅ View logs from environment process
- ✅ Health checks update status automatically

---

### Phase 3: Terminal Integration (~1 week)

**Goal:** Web-based terminal in Worktree Modal

**Tasks:**

1. **Backend: TerminalsService**
   - Use node-pty to spawn bash in worktree directory
   - WebSocket streaming for I/O
   - Support multiple terminal sessions per worktree

2. **Frontend: TerminalModal component**
   - xterm.js for terminal rendering
   - WebSocket connection to daemon
   - Auto-resize, copy/paste, scrollback

3. **Integration points**
   - "Open Terminal" button in General tab
   - "Open Terminal" button in Environment tab
   - Terminal sessions persist (can close modal, reopen)

4. **Security**
   - Run terminals in worktree directory (chroot-like)
   - Log all terminal sessions
   - Permission checks (only owner/collaborators)

**Acceptance Criteria:**

- ✅ Can open terminal from Worktree Modal
- ✅ Terminal starts in worktree directory
- ✅ Full terminal emulation (colors, cursor, etc.)
- ✅ Copy/paste works
- ✅ Multiple terminals per worktree

---

### Phase 4: Concept File Editor (~1 week)

**Goal:** Edit markdown files directly in Worktree Modal

**Tasks:**

1. **Backend: ConceptEditService**
   - Read/write markdown files
   - Validate paths (prevent escaping worktree)
   - Track edit history (git commits)

2. **Frontend: MarkdownEditor component**
   - Rich text editor (react-markdown-editor, MDX Editor, etc.)
   - Preview pane (live rendering)
   - Save button → writes to file

3. **Git integration**
   - Auto-commit on save (optional)
   - Show git diff in editor
   - "Revert Changes" button

**Acceptance Criteria:**

- ✅ Can edit CLAUDE.md from Worktree Modal
- ✅ Changes save to file system
- ✅ Preview renders markdown correctly
- ✅ Optional git commits on save

---

<a name="migration-strategy"></a>

## 6. Migration Strategy

### Step 1: Create Table

```sql
CREATE TABLE worktrees (
  worktree_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  name TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'anonymous',
  data TEXT NOT NULL,
  UNIQUE(repo_id, name)
);
```

### Step 2: Migrate Data

```typescript
// Migration script
export async function migrateWorktreesToTable(db: Database) {
  const repos = await db.select().from(reposTable);

  for (const repo of repos) {
    const worktrees = repo.data.worktrees || [];

    for (const wt of worktrees) {
      const worktreeId = generateUUID();

      await db.insert(worktreesTable).values({
        worktree_id: worktreeId,
        repo_id: repo.repo_id,
        created_at: new Date(wt.created_at),
        updated_at: new Date(wt.last_used || wt.created_at),
        name: wt.name,
        ref: wt.ref,
        created_by: 'anonymous',
        data: JSON.stringify({
          path: wt.path,
          new_branch: wt.new_branch,
          tracking_branch: wt.tracking_branch,
          sessions: wt.sessions,
          last_commit_sha: wt.last_commit_sha,
          last_used: wt.last_used,
        }),
      });

      // Update sessions to reference worktree_id
      for (const sessionId of wt.sessions) {
        await db
          .update(sessionsTable)
          .set({ worktree_id: worktreeId })
          .where(eq(sessionsTable.session_id, sessionId));
      }
    }

    // Clean up: remove worktrees from repos.data
    delete repo.data.worktrees;
    await db
      .update(reposTable)
      .set({ data: repo.data })
      .where(eq(reposTable.repo_id, repo.repo_id));
  }
}
```

### Step 3: Update Code

1. Remove `worktrees: WorktreeConfig[]` from Repo type
2. Create WorktreesService
3. Update ReposService (optional $populate)
4. Update all code that accessed `repo.worktrees`

### Step 4: Test Migration

1. Run migration on test database
2. Verify all worktrees migrated
3. Verify sessions have worktree_id
4. Run full test suite

---

<a name="user-flows"></a>

## 7. User Flows

### Flow 1: Start work on new feature

1. User opens Settings → Worktrees
2. Clicks "+ Create"
3. Fills form:
   - Name: `feat-payment`
   - Repo: `ecommerce`
   - Base branch: `main`
   - Issue URL: `https://github.com/org/repo/issues/123`
4. Agor creates worktree, auto-assigns ports (UI_PORT: 5175)
5. User clicks "Start" in Environment tab
6. Dev environment spins up, shows "● Running"
7. User clicks "Start Session" → creates session in worktree
8. User works with Claude, making commits
9. User creates PR, pastes URL into Worktree Modal → General tab

### Flow 2: Continue work from another developer

1. Alice created `feat-payment`, worked on it, left for day
2. Bob opens Settings → Worktrees
3. Sees `feat-payment` (Env: ○ Stopped, Sessions: 0)
4. Clicks row → Worktree Modal opens
5. General tab shows Issue #123, PR #124, Alice's past session
6. Bob clicks "Start" in Environment tab (same ports Alice used)
7. Bob clicks "Concepts" tab → reads CLAUDE.md to understand Alice's approach
8. Bob clicks "Start Session" → continues where Alice left off

### Flow 3: Debug failing environment

1. User's environment failed (Status: ✗ Error)
2. User opens Worktree Modal → Environment tab
3. Sees error: "Port 5174 already in use"
4. User edits UI_PORT from 5174 → 5176
5. Clicks "Restart"
6. Environment starts successfully
7. User clicks "View Logs" to verify
8. User clicks "Open Terminal" → runs `curl localhost:5176/health`

---

## Summary

**This PRD defines a complete transformation of Agor's architecture:**

1. **Data Model:** Normalize worktrees from nested arrays to dedicated table
2. **UI:** Worktree Modal as central hub (5 tabs: General, Environment, Concepts, Sessions, Repo)
3. **Features:** Environment management, concept browsing, terminal access, session history
4. **Implementation:** 4 phases over 4 weeks

**Key Benefits:**

- ✅ Worktrees become first-class, queryable entities
- ✅ One-click environment management per worktree
- ✅ Issue/PR tracking at worktree level (where work persists)
- ✅ Worktree-specific concepts (CLAUDE.md from repo)
- ✅ Session history per worktree (collaboration visibility)
- ✅ Terminal access to worktree directory

**Technical Foundation:**

- Normalized database (worktrees table)
- xterm.js + node-pty (terminal)
- Template engine (environment variables)
- Process manager (start/stop environments)
- WebSocket streaming (terminals, logs)

**Ready to implement!** 🚀
