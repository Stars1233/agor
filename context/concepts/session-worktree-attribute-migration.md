# Session → Worktree Attribute Migration Analysis

**Context:** With worktree-centric design, some session attributes logically belong to worktrees (persistent across sessions) rather than sessions (ephemeral conversations).

---

## Session Data Model (Current)

```typescript
sessions = {
  // Materialized
  session_id: UUID,
  status: 'idle' | 'running' | 'completed' | 'failed',
  agentic_tool: 'claude-code' | 'cursor' | 'codex' | 'gemini',
  board_id: UUID,
  created_by: UUID,

  // JSON blob (data)
  data: {
    // Repository context
    repo?: {
      repo_id?: string,
      repo_slug?: string,
      worktree_name?: string,  // ← Will become worktree_id FK
      cwd: string,
      managed_worktree: boolean,
    },

    // Git state
    git_state: { ref, base_sha, current_sha },

    // External references
    issue_url?: string,           // ← MOVE TO WORKTREE
    pull_request_url?: string,    // ← MOVE TO WORKTREE

    // Context files
    contextFiles: string[],       // ← HYBRID (see analysis below)

    // Session-specific
    title?: string,
    description?: string,
    agentic_tool_version?: string,
    sdk_session_id?: string,
    tasks: string[],
    message_count: number,
    tool_use_count: number,

    // Permission/model config
    permission_config?: {...},
    model_config?: {...},
    custom_context?: Record<string, unknown>,

    // Genealogy
    genealogy: { fork_point, spawn_point, children },
  }
}
```

---

## Attributes to MOVE to Worktree

### 1. `issue_url` ✅ MOVE

**Reason:** Issues are tied to work, not conversations

- ✅ Worktrees map 1:1 to issues (often)
- ✅ Multiple sessions work on same issue
- ✅ Issue persists across sessions (work continues over days/weeks)
- ❌ Sessions are ephemeral (one conversation)

**Migration:**

```typescript
// Before
session.data.issue_url = 'https://github.com/org/repo/issues/123';

// After
worktree.issue_url = 'https://github.com/org/repo/issues/123';
session.worktree_id = worktree.worktree_id; // FK reference
```

---

### 2. `pull_request_url` ✅ MOVE

**Reason:** PRs are tied to branches/worktrees, not sessions

- ✅ Worktrees map 1:1 to PRs (often)
- ✅ Multiple sessions contribute to same PR
- ✅ PR persists across sessions
- ❌ One session might touch multiple worktrees (review session)

**Migration:**

```typescript
// Before
session.data.pull_request_url = 'https://github.com/org/repo/pull/42';

// After
worktree.pull_request_url = 'https://github.com/org/repo/pull/42';
```

**Auto-population:** Detect when user runs `gh pr create` and update worktree.pull_request_url

---

### 3. `git_state` ⚠️ HYBRID (keep in both)

**Reason:** Both session and worktree need git state, but for different purposes

**Worktree git_state (persistent):**

- Current branch: `worktree.ref`
- Base branch: `worktree.base_ref`
- Base SHA: `worktree.base_sha`
- Last commit: `worktree.last_commit_sha`

**Session git_state (snapshot):**

- SHA when session started: `session.data.git_state.base_sha`
- SHA when session ended: `session.data.git_state.current_sha`
- Dirty status: `session.data.git_state.current_sha` (ends with "-dirty")

**Rationale:**

- Session git_state = historical record (what git state was during this conversation)
- Worktree git_state = current state (what branch/commit is checked out now)

**Decision:** KEEP IN BOTH (different purposes)

```typescript
// Worktree (current state)
worktree.ref = 'feat-auth';
worktree.base_ref = 'main';
worktree.base_sha = 'abc123';
worktree.last_commit_sha = 'def456';

// Session (historical snapshot)
session.data.git_state = {
  ref: 'feat-auth',
  base_sha: 'abc123', // SHA when session started
  current_sha: 'def456', // SHA when session ended
};
```

---

## Attributes to KEEP in Session

### 1. `repo` (repository context) ✅ KEEP (but simplify)

**Reason:** Session needs to know where it executed

**Current:**

```typescript
session.data.repo = {
  repo_id: 'abc123',
  repo_slug: 'agor',
  worktree_name: 'feat-auth', // ← Remove (redundant with FK)
  cwd: '/path/to/worktree',
  managed_worktree: true,
};
```

**Proposed:**

```typescript
// Add foreign key
session.worktree_id = 'def456'; // FK to worktrees table

// Simplify repo context (denormalized for display)
session.data.repo = {
  cwd: '/path/to/worktree', // Where session executed
};

// Query to get full context:
const session = await sessionsService.get(sessionId, {
  query: { $populate: 'worktree' },
});
// session.worktree.name, session.worktree.ref, etc.
```

**Decision:** KEEP (but denormalize cwd only, use FK for rest)

---

### 2. `contextFiles` ⚠️ HYBRID (mostly session, some worktree)

**Analysis:**

**Session-level context files:**

- Files agent loaded during THIS session
- Historical record: "What context did Claude have?"
- Varies per session (user might load different files)

**Worktree-level concept files:**

- Markdown files in worktree directory (CLAUDE.md, context/\*.md)
- Persistent across sessions
- Discovered via filesystem scan

**Recommendation:**

```typescript
// Session: Historical record of loaded files
session.data.contextFiles = ['CLAUDE.md', 'context/architecture.md', 'README.md'];

// Worktree: Discovered concept files (via WorktreeConceptsService)
const concepts = await worktreeConceptsService.find(worktreeId);
// Returns: All *.md files in worktree directory
```

**Decision:** KEEP in session (historical), ADD concept discovery to worktree (live)

---

### 3. `title`, `description` ✅ KEEP

**Reason:** Session-specific

- Title: "Implement JWT auth"
- Description: First user prompt or auto-generated summary
- Specific to this conversation

**Decision:** KEEP (session-specific)

---

### 4. `permission_config`, `model_config` ✅ KEEP

**Reason:** Session-specific preferences

- Permission mode might differ per session
- Model selection might differ per session
- User might want stricter permissions for experimental sessions

**Future Consideration:** Could add default_permission_config to worktree, but session can override

**Decision:** KEEP (session-specific, but could add worktree defaults)

---

### 5. `custom_context` (Handlebars) ✅ KEEP (but could add to worktree too)

**Reason:** Session-specific context for templates

**Future:** Add `worktree.custom_context` for worktree-level variables

**Decision:** KEEP in session, ADD to worktree (both useful)

---

## New Worktree Attributes

Beyond migrated session attributes, worktrees should have:

### 1. `notes` (NEW)

Freeform user notes about the worktree:

```typescript
worktree.notes = `
Implementing JWT auth with refresh tokens.
Still need to add rate limiting.
Blocker: Waiting for design review on token expiration.
`;
```

### 2. `environment_instance` (NEW)

Runtime environment state:

```typescript
worktree.environment_instance = {
  variables: { UI_PORT: 5173, DAEMON_PORT: 3030 },
  status: 'running',
  process: { pid: 12345, started_at: '...', uptime: '2h 34m' },
  access_urls: [
    { name: 'UI', url: 'http://localhost:5173' },
    { name: 'API', url: 'http://localhost:3030' },
  ],
  logs: ['[daemon] Starting...', '[ui] Vite dev server...'],
};
```

### 3. `base_ref`, `base_sha` (NEW)

What this worktree diverged from:

```typescript
worktree.base_ref = 'main';
worktree.base_sha = 'abc123';
```

### 4. `default_permission_config`, `default_model_config` (NEW - optional)

Defaults for sessions in this worktree:

```typescript
worktree.default_permission_config = {
  mode: 'on-request', // Stricter for prod worktrees
};

worktree.default_model_config = {
  mode: 'alias',
  model: 'sonnet-4.5',
};
```

---

## Migration Summary

### Move to Worktree ✅

1. `issue_url` - Issues are tied to work, not conversations
2. `pull_request_url` - PRs are tied to branches, not sessions

### Keep in Both (Hybrid) ⚠️

1. `git_state` - Worktree = current, Session = historical snapshot
2. `contextFiles` - Session = loaded files, Worktree = available concept files

### Keep in Session ✅

1. `repo.cwd` - Where session executed (denormalized)
2. `title`, `description` - Session-specific
3. `permission_config`, `model_config` - Session overrides
4. `custom_context` - Session-specific Handlebars variables
5. `genealogy` - Session relationships (fork/spawn)
6. `tasks`, `message_count`, `tool_use_count` - Session aggregates

### Add to Session ✅

1. `worktree_id` (FK) - Replace `data.repo.worktree_name`

### New Worktree Attributes ✅

1. `issue_url` (migrated from session)
2. `pull_request_url` (migrated from session)
3. `notes` (new)
4. `environment_instance` (new)
5. `base_ref`, `base_sha` (new)
6. `default_permission_config` (new, optional)
7. `default_model_config` (new, optional)

---

## Updated Data Models

### Worktree (Final)

```typescript
export interface Worktree {
  // ===== Identity =====
  worktree_id: UUID;
  repo_id: UUID;
  created_at: string;
  updated_at: string;
  created_by: UUID;

  // ===== Materialized =====
  name: WorktreeName; // "feat-auth"
  ref: string; // Current branch

  // ===== Git State (current) =====
  base_ref?: string; // "main"
  base_sha?: string; // SHA at worktree creation
  last_commit_sha?: string; // Latest commit
  tracking_branch?: string; // "origin/feat-auth"
  new_branch: boolean; // Created by Agor?

  // ===== Work Context =====
  issue_url?: string; // ← MIGRATED FROM SESSION
  pull_request_url?: string; // ← MIGRATED FROM SESSION
  notes?: string; // Freeform user notes

  // ===== Environment =====
  environment_instance?: WorktreeEnvironmentInstance;

  // ===== Defaults (optional) =====
  default_permission_config?: PermissionConfig;
  default_model_config?: ModelConfig;

  // ===== Metadata =====
  path: string;
  sessions: SessionID[];
  last_used: string;
  custom_context?: Record<string, unknown>;
}
```

### Session (Updated)

```typescript
export const sessions = sqliteTable('sessions', {
  // ===== Materialized =====
  session_id: text('session_id').primaryKey(),
  status: text('status', { enum: [...] }).notNull(),
  agentic_tool: text('agentic_tool', { enum: [...] }).notNull(),
  board_id: text('board_id'),
  created_by: text('created_by').notNull(),

  // ===== NEW: Worktree FK =====
  worktree_id: text('worktree_id')
    .references(() => worktrees.worktree_id, { onDelete: 'set null' }),

  // ===== JSON blob =====
  data: text('data', { mode: 'json' }).$type<{
    // Repository context (simplified)
    repo?: {
      cwd: string,  // Where session executed (denormalized)
    },

    // Git state (historical snapshot)
    git_state: {
      ref: string,
      base_sha: string,
      current_sha: string,  // Can end with "-dirty"
    },

    // Context files (loaded during session)
    contextFiles: string[],

    // Session-specific
    title?: string,
    description?: string,
    agentic_tool_version?: string,
    sdk_session_id?: string,
    tasks: string[],
    message_count: number,
    tool_use_count: number,

    // Overrides (session-level)
    permission_config?: PermissionConfig,
    model_config?: ModelConfig,
    custom_context?: Record<string, unknown>,

    // Genealogy
    genealogy: {
      fork_point_task_id?: string,
      spawn_point_task_id?: string,
      children: string[],
    },

    // ❌ REMOVED: issue_url (moved to worktree)
    // ❌ REMOVED: pull_request_url (moved to worktree)
  }>(),
});
```

---

## Query Examples

### Get session with worktree context

```typescript
// Before (nested lookup)
const session = await sessionsService.get(sessionId);
const repo = await reposService.get(session.data.repo.repo_id);
const worktree = repo.worktrees.find(w => w.name === session.data.repo.worktree_name);

// After (direct FK)
const session = await sessionsService.get(sessionId, {
  query: { $populate: 'worktree' },
});
// session.worktree.issue_url
// session.worktree.pull_request_url
// session.worktree.environment_instance.status
```

### Get all sessions for a worktree

```typescript
const sessions = await sessionsService.find({
  query: {
    worktree_id: worktreeId,
    $sort: { created_at: -1 },
  },
});
```

### Get all worktrees with active sessions

```typescript
const worktrees = await worktreesService.find({
  query: {
    sessions: { $ne: [] }, // Has at least one session
  },
});
```

---

## Migration Script Updates

```typescript
export async function migrateWorktreesToTable(db: Database) {
  const repos = await db.select().from(reposTable);

  for (const repo of repos) {
    const worktrees = repo.data.worktrees || [];

    for (const wt of worktrees) {
      const worktreeId = generateUUID();

      // Create worktree
      await db.insert(worktreesTable).values({
        worktree_id: worktreeId,
        repo_id: repo.repo_id,
        name: wt.name,
        ref: wt.ref,
        data: JSON.stringify({
          path: wt.path,
          base_ref: extractBaseRef(wt), // Extract from session git_state
          base_sha: extractBaseSha(wt), // Extract from session git_state
          last_commit_sha: wt.last_commit_sha,
          tracking_branch: wt.tracking_branch,
          new_branch: wt.new_branch,
          sessions: wt.sessions,
          last_used: wt.last_used,

          // Migrate issue/PR from first session (if exists)
          issue_url: undefined, // Populated below
          pull_request_url: undefined, // Populated below
        }),
      });

      // Update sessions
      for (const sessionId of wt.sessions) {
        const session = await db
          .select()
          .from(sessionsTable)
          .where(eq(sessionsTable.session_id, sessionId))
          .get();

        // Migrate issue/PR from session to worktree (first session wins)
        if (session.data.issue_url && !worktree.issue_url) {
          await db
            .update(worktreesTable)
            .set({
              data: { ...worktree.data, issue_url: session.data.issue_url },
            })
            .where(eq(worktreesTable.worktree_id, worktreeId));
        }

        if (session.data.pull_request_url && !worktree.pull_request_url) {
          await db
            .update(worktreesTable)
            .set({
              data: { ...worktree.data, pull_request_url: session.data.pull_request_url },
            })
            .where(eq(worktreesTable.worktree_id, worktreeId));
        }

        // Update session to reference worktree_id
        await db
          .update(sessionsTable)
          .set({
            worktree_id: worktreeId,
            data: {
              ...session.data,
              repo: {
                cwd: session.data.repo?.cwd || wt.path,
              },
              // Remove migrated fields
              issue_url: undefined,
              pull_request_url: undefined,
            },
          })
          .where(eq(sessionsTable.session_id, sessionId));
      }
    }
  }
}
```

---

## Conclusion

**Move to Worktree:**

- `issue_url` ✅
- `pull_request_url` ✅

**Keep in Both (Hybrid):**

- `git_state` (worktree = current, session = historical)

**Keep in Session:**

- `repo.cwd`, `title`, `description`, `permission_config`, `model_config`, etc.

**Add to Session:**

- `worktree_id` FK ✅

**New Worktree Fields:**

- `notes`, `environment_instance`, `base_ref`, `base_sha`, `default_permission_config`, `default_model_config`

This creates a clean separation: **Worktrees = persistent work context, Sessions = ephemeral conversations.**
