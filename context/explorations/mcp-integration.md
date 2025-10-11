# MCP Integration Design

**Status:** Design Proposal
**Created:** 2025-01-11
**Last Updated:** 2025-01-11
**Priority:** P1 (Critical for multi-agent support)

Related: [[claude-code-feature-parity]], [[agent-interface]], [[models]]

---

## Executive Summary

MCP (Model Context Protocol) servers extend agent capabilities by connecting to external tools, databases, and APIs. Claude Code provides full MCP support via both CLI and SDK. **Agor must federate MCP configurations** to enable users to leverage existing MCP investments while adding orchestration value.

**Key Insight:** MCP integration is **critical** because:

1. Users invest heavily in MCP server configs
2. MCP ecosystem is growing rapidly (Sentry, GitHub, databases, etc.)
3. SDK provides full MCP support (pass-through works)
4. Session-level MCP selection enables fine-grained control
5. Cross-agent MCP sharing is a unique Agor differentiator

**Strategic Approach:** CRUD for MCP configurations + session-level selection + usage tracking

---

## MCP Overview

### What is MCP?

**Model Context Protocol** is a standardized way to connect LLM agents to:

- External tools (filesystem, git, search engines)
- Data sources (databases, APIs, cloud storage)
- Services (Sentry, GitHub, Slack, Figma, etc.)

### MCP Server Types

1. **stdio** - Local process communication (most common)
2. **HTTP** - Remote HTTP servers (recommended for production)
3. **SSE** - Server-Sent Events (streaming)

### MCP Capabilities

**Tools:** Functions the agent can call (e.g., `list_files`, `create_issue`)
**Resources:** Data the agent can read (e.g., file contents, database rows)
**Prompts:** Pre-built prompt templates exposed as slash commands

---

## Current State: Claude Code MCP

### CLI Configuration

**File:** `.mcp.json` (project root)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_PATHS": "/Users/me/projects"
      }
    },
    "sentry": {
      "transport": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}"
      }
    }
  }
}
```

**Also:** `~/.claude/mcp.json` for user-global configs

### CLI Commands

```bash
# Add MCP server
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# List MCP servers
claude mcp list

# Remove MCP server
claude mcp remove sentry

# Test MCP server
claude mcp test filesystem
```

### SDK Usage

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'List files in my project',
  options: {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
        env: { ALLOWED_PATHS: '/Users/me/projects' },
      },
    },
    allowedTools: ['mcp__filesystem__list_files'],
  },
})) {
  console.log(message);
}
```

**Key Observations:**

- ✅ SDK has full MCP support
- ✅ Configuration is per-query (not global)
- ✅ Tool allowlisting works
- ⚠️ OAuth2 not yet supported
- ⚠️ No server lifecycle management in SDK

---

## Agor MCP Design

### Goals

1. **CRUD Management:** Users can manage MCP servers via UI/CLI
2. **Scoped Configs:** Global (user), team, repo, session levels
3. **Session Selection:** Choose which servers to enable per session
4. **Federation:** Import existing `.mcp.json` configs
5. **Usage Tracking:** See which tools are used, how often
6. **Team Sharing:** Distribute MCP configs across team
7. **Cross-Agent:** Same MCP configs work with Claude, Cursor, etc.

### Non-Goals

1. ❌ Running MCP servers (agents do this)
2. ❌ MCP server marketplace (use existing)
3. ❌ MCP protocol implementation (use SDK)

---

## Data Model

### MCP Server Entity

```typescript
interface MCPServer {
  mcp_server_id: MCPServerID; // UUIDv7
  name: string; // e.g., "filesystem", "sentry"
  display_name?: string; // e.g., "Filesystem Access"
  description?: string;
  transport: 'stdio' | 'http' | 'sse';

  // stdio config
  command?: string; // e.g., "npx"
  args?: string[]; // e.g., ["@modelcontextprotocol/server-filesystem"]

  // HTTP config
  url?: string; // e.g., "https://mcp.sentry.dev/mcp"

  // Environment variables
  env?: Record<string, string>; // e.g., { "ALLOWED_PATHS": "/Users/me/projects" }

  // Scope
  scope: 'global' | 'team' | 'repo' | 'session';
  owner_user_id?: UserID; // For 'global' scope
  team_id?: TeamID; // For 'team' scope
  repo_id?: RepoID; // For 'repo' scope
  session_id?: SessionID; // For 'session' scope

  // Metadata
  source: 'user' | 'imported' | 'agor';
  import_path?: string; // e.g., "/Users/me/project/.mcp.json"
  enabled: boolean;

  // Capabilities (discovered from server)
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];

  created_at: Date;
  updated_at: Date;
}

interface MCPTool {
  name: string; // e.g., "mcp__filesystem__list_files"
  description: string;
  input_schema: JSONSchema;
}

interface MCPResource {
  uri: string; // e.g., "file:///path/to/file"
  name: string;
  mimeType?: string;
}

interface MCPPrompt {
  name: string; // Becomes slash command
  description: string;
  arguments?: PromptArgument[];
}
```

### Session-MCP Relationship

```typescript
interface SessionMCPServer {
  session_id: SessionID;
  mcp_server_id: MCPServerID;
  enabled: boolean;
  added_at: Date;
}
```

**Many-to-many:** A session can use multiple MCP servers, an MCP server can be used by multiple sessions.

### MCP Tool Usage Tracking

```typescript
interface MCPToolUsage {
  usage_id: ToolUsageID; // UUIDv7
  session_id: SessionID;
  task_id?: TaskID;
  mcp_server_id: MCPServerID;
  tool_name: string; // e.g., "mcp__filesystem__list_files"
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'success' | 'error';
  error_message?: string;
  execution_time_ms: number;
  timestamp: Date;
}
```

**Purpose:** Analytics, debugging, cost tracking (future)

---

## Database Schema

### Tables

```sql
-- MCP Servers
CREATE TABLE mcp_servers (
  mcp_server_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'http', 'sse')),

  -- Transport config (JSON)
  command TEXT,
  args JSON,
  url TEXT,
  env JSON,

  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('global', 'team', 'repo', 'session')),
  owner_user_id TEXT REFERENCES users(user_id),
  team_id TEXT REFERENCES teams(team_id),
  repo_id TEXT REFERENCES repos(repo_id),
  session_id TEXT REFERENCES sessions(session_id),

  -- Metadata
  source TEXT NOT NULL CHECK (source IN ('user', 'imported', 'agor')),
  import_path TEXT,
  enabled BOOLEAN DEFAULT TRUE,

  -- Capabilities (JSON)
  tools JSON,
  resources JSON,
  prompts JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session-MCP relationship
CREATE TABLE session_mcp_servers (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(mcp_server_id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT TRUE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (session_id, mcp_server_id)
);

-- MCP Tool Usage
CREATE TABLE mcp_tool_usage (
  usage_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL,
  mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(mcp_server_id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSON,
  output JSON,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,
  execution_time_ms INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_mcp_servers_scope ON mcp_servers(scope);
CREATE INDEX idx_mcp_servers_owner ON mcp_servers(owner_user_id);
CREATE INDEX idx_mcp_servers_team ON mcp_servers(team_id);
CREATE INDEX idx_mcp_servers_repo ON mcp_servers(repo_id);
CREATE INDEX idx_session_mcp_enabled ON session_mcp_servers(session_id, enabled);
CREATE INDEX idx_mcp_tool_usage_session ON mcp_tool_usage(session_id);
CREATE INDEX idx_mcp_tool_usage_server ON mcp_tool_usage(mcp_server_id);
```

---

## API Design

### Daemon Services

**File:** `apps/agor-daemon/src/services/mcp-servers.ts`

```typescript
class MCPServerService {
  // CRUD
  async create(data: CreateMCPServerInput): Promise<MCPServer>;
  async get(id: MCPServerID): Promise<MCPServer>;
  async list(filters: MCPServerFilters): Promise<MCPServer[]>;
  async update(id: MCPServerID, data: UpdateMCPServerInput): Promise<MCPServer>;
  async delete(id: MCPServerID): Promise<void>;

  // Scope queries
  async listByScope(scope: MCPScope, scopeId: string): Promise<MCPServer[]>;
  async listForSession(sessionId: SessionID): Promise<MCPServer[]>;

  // Import/Export
  async importFromFile(filePath: string, scope: MCPScope): Promise<MCPServer[]>;
  async exportToFile(filePath: string, serverIds: MCPServerID[]): Promise<void>;

  // Capabilities
  async discoverCapabilities(id: MCPServerID): Promise<MCPCapabilities>;
  async testConnection(id: MCPServerID): Promise<TestResult>;
}

class SessionMCPService {
  // Session-MCP relationship
  async addServer(sessionId: SessionID, serverId: MCPServerID): Promise<void>;
  async removeServer(sessionId: SessionID, serverId: MCPServerID): Promise<void>;
  async toggleServer(sessionId: SessionID, serverId: MCPServerID, enabled: boolean): Promise<void>;
  async listServers(sessionId: SessionID, enabledOnly?: boolean): Promise<MCPServer[]>;

  // Bulk operations
  async setServers(sessionId: SessionID, serverIds: MCPServerID[]): Promise<void>;
}

class MCPToolUsageService {
  // Track tool usage
  async record(usage: MCPToolUsageInput): Promise<MCPToolUsage>;

  // Analytics
  async getSessionUsage(sessionId: SessionID): Promise<MCPToolUsage[]>;
  async getServerUsage(serverId: MCPServerID): Promise<MCPToolUsageStats>;
  async getToolStats(toolName: string): Promise<ToolStats>;
}
```

### REST Endpoints

```
POST   /mcp-servers                   # Create MCP server
GET    /mcp-servers/:id               # Get MCP server
GET    /mcp-servers                   # List MCP servers (with filters)
PATCH  /mcp-servers/:id               # Update MCP server
DELETE /mcp-servers/:id               # Delete MCP server

GET    /mcp-servers/scope/:scope/:id  # List by scope (e.g., /mcp-servers/scope/repo/abc123)
POST   /mcp-servers/import            # Import from .mcp.json
POST   /mcp-servers/:id/test          # Test connection
POST   /mcp-servers/:id/discover      # Discover capabilities

POST   /sessions/:id/mcp-servers      # Add MCP server to session
DELETE /sessions/:id/mcp-servers/:mcpId  # Remove MCP server from session
PATCH  /sessions/:id/mcp-servers/:mcpId  # Toggle enabled
GET    /sessions/:id/mcp-servers      # List session's MCP servers

POST   /mcp-tool-usage                # Record tool usage (internal)
GET    /mcp-tool-usage/session/:id    # Get session tool usage
GET    /mcp-tool-usage/server/:id     # Get server usage stats
```

---

## CLI Commands

**File:** `apps/agor-cli/src/commands/mcp/`

```bash
# MCP server management
pnpm agor mcp list                          # List all MCP servers
pnpm agor mcp list --scope global           # List global servers
pnpm agor mcp list --repo <repo-id>         # List repo servers

pnpm agor mcp show <id>                     # Show MCP server details
pnpm agor mcp add stdio filesystem \        # Add stdio server
  --command npx \
  --args "@modelcontextprotocol/server-filesystem" \
  --env ALLOWED_PATHS=/Users/me/projects \
  --scope global

pnpm agor mcp add http sentry \             # Add HTTP server
  --url https://mcp.sentry.dev/mcp \
  --env SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
  --scope repo --repo <repo-id>

pnpm agor mcp update <id> --display-name "My Filesystem"
pnpm agor mcp remove <id>

# Import/Export
pnpm agor mcp import .mcp.json --scope repo --repo <repo-id>
pnpm agor mcp import ~/.claude/mcp.json --scope global
pnpm agor mcp export --server <id> --output .mcp.json

# Testing
pnpm agor mcp test <id>                     # Test connection
pnpm agor mcp discover <id>                 # Discover capabilities

# Session-level
pnpm agor session mcp list <session-id>     # List session's servers
pnpm agor session mcp add <session-id> <server-id>
pnpm agor session mcp remove <session-id> <server-id>
pnpm agor session mcp toggle <session-id> <server-id> --enabled=false

# Usage analytics
pnpm agor mcp usage session <session-id>    # Tool usage for session
pnpm agor mcp usage server <server-id>      # Usage stats for server
```

---

## UI Design

### MCP Management Page

**Route:** `/mcp-servers`

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ MCP Servers                                  [+ Add]    │
├─────────────────────────────────────────────────────────┤
│ Filters: [Global ▼] [All Types ▼] [Enabled ✓]         │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐    │
│ │ 🗂️  Filesystem                              [✓] │    │
│ │ Local file access via MCP                       │    │
│ │ stdio | Global | 15 tools                       │    │
│ │ Used in 23 sessions                              │    │
│ │ [Edit] [Test] [Remove]                          │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ 🐛 Sentry                                   [✓] │    │
│ │ Error monitoring and issue tracking             │    │
│ │ http | Repo: my-app | 12 tools                  │    │
│ │ Used in 5 sessions                               │    │
│ │ [Edit] [Test] [Remove]                          │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ 🐙 GitHub                                   [✓] │    │
│ │ Pull requests, issues, code search              │    │
│ │ http | Team | 25 tools                          │    │
│ │ Used in 42 sessions                              │    │
│ │ [Edit] [Test] [Remove]                          │    │
│ └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Session MCP Selection

**Location:** Session creation/edit form

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ New Session                                              │
├─────────────────────────────────────────────────────────┤
│ Name: [Feature: User Authentication          ]          │
│ Agent: [Claude Code ▼]                                  │
│ Repo: [my-app ▼]                                        │
│                                                          │
│ MCP Servers:                                            │
│ ┌───────────────────────────────────────────────┐      │
│ │ ☑ Filesystem (Global)                         │      │
│ │   Local file access                            │      │
│ │                                                │      │
│ │ ☐ Sentry (Repo: my-app)                       │      │
│ │   Error monitoring                             │      │
│ │                                                │      │
│ │ ☑ GitHub (Team)                                │      │
│ │   Pull requests and issues                     │      │
│ │                                                │      │
│ │ ☐ Database (Repo: my-app)                     │      │
│ │   PostgreSQL access                            │      │
│ └───────────────────────────────────────────────┘      │
│                                                          │
│ [+ Add MCP Server]                                      │
│                                                          │
│ Concepts: [Select concepts...]                          │
│                                                          │
│ [Cancel]                               [Create Session] │
└─────────────────────────────────────────────────────────┘
```

### Session Detail - Active MCP Servers

**Location:** Session detail sidebar

**Layout:**

```
┌─────────────────────────────────────┐
│ Session: User Auth                  │
├─────────────────────────────────────┤
│ Status: Running                     │
│ Agent: Claude Code                  │
│ Repo: my-app                        │
│                                     │
│ Active MCP Servers (2):             │
│ ┌─────────────────────────────────┐ │
│ │ 🗂️  Filesystem                  │ │
│ │ 147 tool calls                  │ │
│ │ [View Usage] [Disable]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🐙 GitHub                       │ │
│ │ 23 tool calls                   │ │
│ │ [View Usage] [Disable]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [+ Enable More]                     │
└─────────────────────────────────────┘
```

### MCP Tool Usage Analytics

**Route:** `/mcp-servers/:id/usage`

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ MCP Server: Filesystem                                   │
│ Usage Analytics                                          │
├─────────────────────────────────────────────────────────┤
│ Time Range: [Last 30 days ▼]                           │
│                                                          │
│ Total Tool Calls: 1,247                                 │
│ Sessions Using: 23                                      │
│ Success Rate: 98.7%                                     │
│ Avg Execution Time: 45ms                                │
│                                                          │
│ Top Tools:                                              │
│ ┌─────────────────────────────────────────────────┐    │
│ │ mcp__filesystem__list_files      847 (68%)      │    │
│ │ mcp__filesystem__read_file       312 (25%)      │    │
│ │ mcp__filesystem__write_file       88 (7%)       │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ Usage Over Time:                                        │
│ [Line chart showing tool calls per day]                │
│                                                          │
│ Recent Usage:                                           │
│ ┌─────────────────────────────────────────────────┐    │
│ │ Session: User Auth | list_files | 12ms | ✓     │    │
│ │ Session: Bug Fix   | read_file  | 34ms | ✓     │    │
│ │ Session: Refactor  | write_file | 56ms | ✓     │    │
│ └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core CRUD (P1 - Q1 2026)

**Goal:** Basic MCP server management

**Tasks:**

1. Database schema and migrations
2. Repository layer (`MCPServerRepository`)
3. Daemon services (`MCPServerService`, `SessionMCPService`)
4. REST API endpoints
5. CLI commands (add, list, show, remove)
6. Basic UI (list, create, edit, delete)

**Deliverable:** Users can create and manage MCP servers in Agor

---

### Phase 2: Federation (P1 - Q1 2026)

**Goal:** Import existing Claude Code configs

**Tasks:**

1. `.mcp.json` parser
2. Import command (`pnpm agor mcp import`)
3. Automatic detection of `.mcp.json` in repos
4. Sync with `~/.claude/mcp.json` on daemon start
5. UI for import (drag-and-drop `.mcp.json`)

**Deliverable:** Users can import their existing MCP configs seamlessly

---

### Phase 3: Session Integration (P1 - Q1 2026)

**Goal:** Enable session-level MCP server selection

**Tasks:**

1. Session-MCP relationship (database + API)
2. SDK integration (pass `mcpServers` to `query()`)
3. UI for selecting MCP servers during session creation
4. UI for toggling MCP servers in active sessions
5. Visual indication of active MCP servers in session detail

**Deliverable:** Users can choose which MCP servers to use per session

---

### Phase 4: Usage Tracking (P2 - Q2 2026)

**Goal:** Track and visualize MCP tool usage

**Tasks:**

1. Tool usage recording (intercept SDK tool calls)
2. Usage analytics API endpoints
3. CLI commands for usage stats
4. UI for usage analytics (charts, tables)
5. Per-session, per-server, per-tool views

**Deliverable:** Users can see which MCP tools are used and how often

---

### Phase 5: Advanced Features (P2-P3 - Q2 2026)

**Goal:** Enhanced MCP capabilities

**Tasks:**

1. **Server Testing:** `pnpm agor mcp test` command
2. **Capability Discovery:** Automatically detect tools/resources/prompts
3. **Team Sharing:** Share MCP configs across team
4. **Export:** Export Agor MCP configs to `.mcp.json`
5. **Prompts as Slash Commands:** Expose MCP prompts as Agor commands
6. **Health Monitoring:** Track server uptime and errors

**Deliverable:** Full-featured MCP management system

---

## SDK Integration Pattern

### Passing MCP Servers to Agent

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { MCPServerRepository } from "@agor/core/db/repositories";

async function executeTa with MCP(
  sessionId: SessionID,
  prompt: string
) {
  // Get session's enabled MCP servers
  const mcpServers = await db.sessionMCPServers.listEnabled(sessionId);

  // Convert to SDK format
  const mcpConfig = mcpServers.reduce((acc, server) => {
    acc[server.name] = {
      transport: server.transport,
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env
    };
    return acc;
  }, {} as MCPServersConfig);

  // Get allowed tools (all tools from enabled servers)
  const allowedTools = mcpServers.flatMap(server =>
    server.tools?.map(t => t.name) || []
  );

  // Execute query with MCP
  for await (const message of query({
    prompt,
    options: {
      mcpServers: mcpConfig,
      allowedTools
    }
  })) {
    // Track tool usage
    if (message.type === 'tool_use') {
      await trackToolUsage(sessionId, message);
    }

    yield message;
  }
}

async function trackToolUsage(
  sessionId: SessionID,
  toolUse: ToolUseMessage
) {
  const toolName = toolUse.name;

  // Find which MCP server this tool belongs to
  const server = await findServerByToolName(sessionId, toolName);
  if (!server) return; // Not an MCP tool

  // Record usage
  await db.mcpToolUsage.create({
    usage_id: generateUUIDv7(),
    session_id: sessionId,
    mcp_server_id: server.mcp_server_id,
    tool_name: toolName,
    input: toolUse.input,
    output: toolUse.output,
    status: toolUse.error ? 'error' : 'success',
    error_message: toolUse.error,
    execution_time_ms: toolUse.executionTime,
    timestamp: new Date()
  });
}
```

---

## Scope Resolution

When a session needs MCP servers, resolve in this order:

1. **Session-specific:** Servers explicitly added to this session
2. **Repo-level:** Servers configured for this repo
3. **Team-level:** Servers shared across team (if user is in team)
4. **Global:** User's global MCP servers

**Example:**

```typescript
async function resolveMCPServers(sessionId: SessionID): Promise<MCPServer[]> {
  const session = await db.sessions.get(sessionId);

  // Start with session-specific servers
  const servers = await db.sessionMCPServers.list(sessionId);

  // Add repo servers (if not already in session)
  if (session.repo_id) {
    const repoServers = await db.mcpServers.listByScope('repo', session.repo_id);
    servers.push(
      ...repoServers.filter(s => !servers.find(x => x.mcp_server_id === s.mcp_server_id))
    );
  }

  // Add team servers (if user is in team)
  const user = await db.users.get(session.user_id);
  if (user.team_id) {
    const teamServers = await db.mcpServers.listByScope('team', user.team_id);
    servers.push(
      ...teamServers.filter(s => !servers.find(x => x.mcp_server_id === s.mcp_server_id))
    );
  }

  // Add global servers
  const globalServers = await db.mcpServers.listByScope('global', session.user_id);
  servers.push(
    ...globalServers.filter(s => !servers.find(x => x.mcp_server_id === s.mcp_server_id))
  );

  // Filter to enabled only
  return servers.filter(s => s.enabled);
}
```

---

## Security Considerations

### Environment Variables

**Problem:** MCP configs often contain secrets (API keys, tokens)

**Solutions:**

1. **Variable Expansion:** Support `${VAR_NAME}` syntax, resolve from env
2. **Encrypted Storage:** Encrypt `env` JSON field in database
3. **Secret Management:** Integration with secret managers (Vault, AWS Secrets Manager)
4. **User-Scoped Secrets:** Each user has own secret values

**Example:**

```json
{
  "mcpServers": {
    "sentry": {
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}"
      }
    }
  }
}
```

**Agor resolves:**

```typescript
const envValue = process.env.SENTRY_AUTH_TOKEN || user.secrets['SENTRY_AUTH_TOKEN'];
```

### Tool Permissions

**Problem:** MCP tools can be dangerous (file writes, shell commands)

**Solution:** Leverage existing tool permission system

- PreToolUse hooks can block MCP tool calls
- Policies can auto-approve/deny specific MCP tools
- UI shows which MCP tools will be available

---

## Cross-Agent Support

**Key Differentiator:** Same MCP configs work across agents

### Agent-Specific MCP Formats

Different agents may have different MCP config formats. Agor normalizes:

**Claude Code:**

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": [...] }
  }
}
```

**Cursor (hypothetical):**

```json
{
  "mcp": {
    "servers": [
      { "name": "filesystem", "command": "npx", "args": [...] }
    ]
  }
}
```

**Agor's Abstraction:**

```typescript
interface AgentMCPAdapter {
  toAgentFormat(servers: MCPServer[]): unknown;
  fromAgentFormat(config: unknown): MCPServer[];
}

class ClaudeCodeMCPAdapter implements AgentMCPAdapter {
  toAgentFormat(servers: MCPServer[]) {
    return {
      mcpServers: servers.reduce((acc, s) => {
        acc[s.name] = { command: s.command, args: s.args, env: s.env };
        return acc;
      }, {}),
    };
  }
  // ...
}
```

---

## Future Enhancements

### MCP Server Marketplace

**Phase 5 (P5):**

- Discover MCP servers from community
- One-click install
- Ratings and reviews
- Auto-update

### MCP Server Hosting

**Phase 6 (P6):**

- Agor hosts MCP servers (no local setup)
- Managed MCP servers with SLA
- Team-wide server instances

### MCP Analytics Dashboard

**Phase 4 (P3):**

- Cost tracking per MCP server (if applicable)
- Performance metrics (latency, success rate)
- Recommendations (suggest MCP servers based on tasks)

---

## Success Metrics

### Adoption

- **Target:** 80% of users with ≥1 MCP server configured
- **Target:** 50% of sessions use ≥1 MCP server
- **Target:** 70% of imported CLI configs successfully used

### Usage

- **Metric:** Average MCP servers per session
- **Metric:** Total MCP tool calls per day
- **Metric:** MCP tool success rate (target: >95%)

### Satisfaction

- **Metric:** User satisfaction with MCP management (survey)
- **Metric:** Support tickets related to MCP (minimize)

---

## Open Questions

### Q1: Should Agor run MCP servers?

**Current:** Agents run MCP servers (stdio process)

**Alternative:** Agor daemon runs MCP servers, agents connect via HTTP

**Pros of Agor-hosted:**

- Centralized management
- Better health monitoring
- Shared across agents

**Cons:**

- Complexity (Agor becomes MCP server host)
- Security (Agor needs permissions)
- SDK compatibility (may not support external MCP)

**Decision:** Start with agent-run model (simpler), revisit if needed

---

### Q2: How to handle MCP server updates?

**Scenario:** MCP server adds new tools

**Options:**

- A) Manual re-discovery (user clicks "Refresh Capabilities")
- B) Auto-discovery on daemon start
- C) Periodic background checks

**Recommendation:** A + B (manual + on-start)

---

### Q3: Should MCP configs be version-controlled?

**Scenario:** Team wants to track MCP config changes

**Options:**

- A) Store in git (`.agor/mcp.json`)
- B) Store in Agor database only
- C) Hybrid (database + optional git export)

**Recommendation:** C (database primary, git export optional)

---

## Conclusion

MCP integration is **critical** for Agor's success. The SDK provides full support, so implementation is primarily about CRUD, scope management, and UI/UX.

**Next Steps:**

1. ✅ Design complete (this document)
2. 📋 Implement Phase 1 (Core CRUD) - Q1 2026
3. 📋 Implement Phase 2 (Federation) - Q1 2026
4. 📋 Implement Phase 3 (Session Integration) - Q1 2026
5. 📋 Implement Phase 4 (Usage Tracking) - Q2 2026

**Success = Users can import their MCP configs, select servers per session, and gain visibility into MCP usage—all while using Agor's orchestration features.**
