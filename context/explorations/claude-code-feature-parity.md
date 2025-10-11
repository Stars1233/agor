# Claude Code CLI vs SDK: Complete Feature Analysis

**Status:** Active Analysis
**Created:** 2025-01-11
**Last Updated:** 2025-01-11

Related: [[native-cli-feature-gaps]], [[agent-interface]], [[mcp-integration]]

---

## Executive Summary

This document provides a comprehensive analysis of Claude Code's CLI features, evaluates SDK accessibility, stack-ranks by importance for Agor, and proposes implementation strategies.

**Key Finding:** While Claude Code CLI has a rich feature set (plugins, hooks, custom commands), the SDK provides sufficient primitives for core functionality (MCP, subagents, sessions). The gap lies primarily in **extensibility** and **ecosystem features**, not core capabilities.

**Strategic Recommendation:** Focus on **federation over replication**—import and execute existing user configurations rather than rebuilding from scratch. Double down on Agor's unique orchestration capabilities.

---

## Feature Comparison Matrix

| Feature                       | CLI Support | SDK Support | Importance  | Feasibility | Agor Strategy           |
| ----------------------------- | ----------- | ----------- | ----------- | ----------- | ----------------------- |
| **Session Management**        | ✅ Full     | 🟡 Partial  | 🔴 Critical | 🟢 Easy     | ✅ Complete             |
| **MCP Servers**               | ✅ Full     | ✅ Full     | 🔴 Critical | 🟢 Easy     | Pass-through + CRUD     |
| **Subagents**                 | ✅ Full     | ✅ Full     | 🟢 High     | 🟢 Easy     | Pass-through + Track    |
| **Slash Commands (Custom)**   | ✅ Full     | ❌ None     | 🟢 High     | 🟡 Medium   | Federate                |
| **Slash Commands (Built-in)** | ✅ Full     | ❌ None     | 🟡 Medium   | 🔴 Hard     | Alternative UX          |
| **Hooks**                     | ✅ Full     | ❌ None     | 🟢 High     | 🟡 Medium   | Replicate Pattern       |
| **Plugins**                   | ✅ Full     | ❌ None     | 🟢 High     | 🔴 Hard     | Long-term               |
| **Memory (CLAUDE.md)**        | ✅ Full     | 🟡 Manual   | 🟢 High     | 🟢 Easy     | ✅ Enhanced (Concepts)  |
| **Session Resume/Fork**       | ✅ Full     | ✅ Full     | 🔴 Critical | 🟢 Easy     | ✅ Complete             |
| **Git Integration**           | ✅ Full     | ✅ Full     | 🔴 Critical | 🟢 Easy     | ✅ Enhanced (Worktrees) |
| **Interactive REPL**          | ✅ Full     | ❌ None     | 🟡 Medium   | ❌ N/A      | Different Paradigm      |
| **VS Code Extension**         | ✅ Full     | ❌ None     | 🟢 High     | 🔴 Hard     | Future                  |

**Legend:**

- Support: ✅ Full | 🟡 Partial | ❌ None
- Importance: 🔴 Critical | 🟢 High | 🟡 Medium | ⚪ Low
- Feasibility: 🟢 Easy | 🟡 Medium | 🔴 Hard | ❌ N/A

---

## Detailed Feature Breakdown

### 1. Session Management ⭐ CRITICAL

**CLI Capabilities:**

- Automatic session creation and ID tracking
- Resume most recent (`-c`) or specific session (`-r <id>`)
- Session history browsing
- Context restoration

**SDK Capabilities:**

- ✅ Session creation with ID in first system message
- ✅ Resume via `resume: sessionId` option
- ✅ Forking via `forkSession: boolean` option
- ❌ No session listing/discovery APIs

**Agor Status:** ✅ **COMPLETE**

- Full session CRUD with rich metadata
- Genealogy tracking (fork/spawn relationships)
- Session search by repo, agent, status, concepts
- Visual session trees in UI

**Priority:** P0 (Foundation complete)

---

### 2. MCP Servers (Model Context Protocol) ⭐ CRITICAL

**CLI Capabilities:**

```bash
# Add servers
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# Manage via /mcp command
/mcp list
/mcp remove <server>
```

**Configuration:** `.mcp.json` at project root

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": { "ALLOWED_PATHS": "/Users/me/projects" }
    }
  }
}
```

**Scopes:** Local, project, user

**SDK Capabilities:**

```typescript
for await (const message of query({
  prompt: 'List files in my project',
  options: {
    mcpServers: {
      /* server config */
    },
    allowedTools: ['mcp__filesystem__list_files'],
  },
})) {
  /* ... */
}
```

**✅ Full MCP functionality via SDK!**

**Agor Strategy: PASS-THROUGH + CRUD MANAGEMENT**

**See [[mcp-integration]] for detailed design.**

**Key Requirements:**

1. **MCP Configuration CRUD**
   - Store MCP server configs in database
   - Scopes: global (user), team, repo, session
   - UI for adding/editing/removing servers

2. **Session-Level MCP Selection**
   - User selects which MCP servers to enable per session
   - Visual indicator of active MCP servers
   - Tool usage tracking per MCP server

3. **Federation with CLI Configs**
   - Import `.mcp.json` files automatically
   - Sync user's `~/.claude/mcp.json` config
   - Bidirectional updates (optional)

**Priority:** P1 (High value, SDK provides foundation)

---

### 3. Subagents ⭐ HIGH

**CLI Capabilities:**

- Define in `.claude/agents/*.md` with YAML frontmatter
- Interactive creation via `/agents` command
- Automatic or explicit invocation
- Separate context windows
- Concurrent execution

**Example Agent Definition:**

```markdown
---
name: code-reviewer
description: Reviews code for best practices and bugs
model: claude-sonnet-4
allowedTools: ['Read', 'Grep']
---

You are an expert code reviewer. Focus on:

- Security vulnerabilities
- Performance issues
- Best practices
```

**SDK Capabilities:**

```typescript
await query({
  prompt: 'Review the auth module',
  options: {
    agents: [
      {
        name: 'code-reviewer',
        description: 'Reviews code for best practices',
        systemPrompt: '...',
        allowedTools: ['Read', 'Grep'],
      },
    ],
  },
});
```

**✅ Full subagent functionality via SDK!**

**Agor Strategy: PASS-THROUGH + ORCHESTRATION TRACKING**

- Track subagent invocations per session
- Visualize delegation tree in UI
- Share custom subagents across team
- Performance metrics (execution time, success rate)

**Priority:** P1 (SDK sufficient, add observability layer)

---

### 4. Custom Slash Commands ⭐ HIGH

**CLI Capabilities:**

- Define in `.claude/commands/*.md` files
- Project (`.claude/commands/`) and user (`~/.claude/commands/`) scopes
- Support for:
  - Arguments with defaults
  - File references (`@syntax`)
  - Bash execution (backticks)
  - Frontmatter configuration
  - Namespacing via directories

**Example Command:**

````markdown
---
description: 'Run tests for a specific module'
arguments:
  - name: module
    description: 'Module to test'
    default: 'all'
allowedTools: ['Bash', 'Read']
---

Run tests for the {{module}} module using:

```bash
npm test -- {{module}}
```
````

Report results and suggest fixes for failures.

````

**SDK Capabilities:**
- ❌ No native slash command support
- ⚠️ Must manually template prompts

**Agor Strategy: FEDERATE AND ENHANCE**

**Phase 1: Federation (P2)**
```typescript
// Parse .claude/commands/ directory
interface SlashCommand {
  name: string;
  description: string;
  arguments: CommandArg[];
  template: string;
  allowedTools?: string[];
  source: 'project' | 'personal' | 'agor';
}

// Execute custom command
async function executeCommand(
  command: SlashCommand,
  args: Record<string, string>
) {
  // Substitute arguments in template
  const prompt = substituteTemplate(command.template, args);

  // Execute via SDK
  return await query({
    prompt,
    options: {
      allowedTools: command.allowedTools
    }
  });
}
````

**Phase 2: Agor-Native Commands (P3)**

- Store commands in database
- Version control
- Team sharing
- Usage analytics
- Cross-agent compatibility

**Phase 3: Command Marketplace (P4)**

- Discover and install community commands
- Rate and review
- Auto-updates

**Priority:** P2 (High value for power users, enables reuse of existing investments)

---

### 5. Hooks ⭐ HIGH

**CLI Capabilities:**
Hooks execute shell commands at specific lifecycle events.

**Hook Types:**

1. **PreToolUse** - Before tool execution (validation/approval)
2. **PostToolUse** - After tool completion (logging/feedback)
3. **UserPromptSubmit** - When user submits prompt (context injection/blocking)
4. **Notification** - During system notifications
5. **Stop/SubagentStop** - When agent finishes responding
6. **SessionStart/SessionEnd** - Session lifecycle

**Configuration:** `~/.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Remember to use MCP tools!'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "git push",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Pushing to remote...'"
          }
        ]
      }
    ]
  }
}
```

**Exit Codes:**

- `0` = Continue
- `1` = Fail operation
- `2` = Block operation

**SDK Capabilities:**

- ❌ No native hooks system
- ⚠️ Must implement event handling manually

**Agor Strategy: REPLICATE PATTERN IN ORCHESTRATION LAYER**

**Agor Hook System Design:**

```typescript
interface AgorHook {
  event: HookEvent;
  matcher?: string; // Regex for tool names
  handler: (context: HookContext) => Promise<HookResult>;
  scope: 'global' | 'team' | 'repo' | 'session';
}

type HookEvent =
  | 'pre-tool'
  | 'post-tool'
  | 'prompt-submit'
  | 'session-start'
  | 'session-end'
  | 'task-complete'
  | 'task-fail';

interface HookContext {
  sessionId: SessionID;
  taskId?: TaskID;
  agent: AgentType;
  toolName?: string;
  toolArgs?: any;
  prompt?: string;
  user: User;
}

interface HookResult {
  action: 'continue' | 'block' | 'fail';
  additionalContext?: string; // Injected into prompt
  metadata?: Record<string, any>; // Stored with task
}
```

**Implementation:**

**Phase 1: Native Agor Hooks (P2)**

- JavaScript/TypeScript handlers (via tsx)
- Event system in daemon
- Hook configuration UI
- Metadata storage

**Phase 2: CLI Hook Federation (P3)**

- Parse `.claude/settings.json` hooks
- Execute shell commands via child_process
- Map CLI hook events to Agor events
- Reuse existing hook scripts

**Priority:** P2 (native), P3 (federation)

**Use Cases:**

- Cost tracking (sum tool usage costs)
- Compliance (block dangerous operations)
- Context injection (add relevant docs to prompts)
- Automatic logging (track all file edits)
- Team workflows (require code review hooks)
- Multi-agent coordination (trigger dependent sessions)

---

### 6. Plugins ⭐ HIGH

**CLI Capabilities:**
Plugins bundle commands, agents, hooks, and MCP servers for easy sharing.

**Plugin Structure:**

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json     # Metadata, version, dependencies
├── commands/           # Custom slash commands
├── agents/             # Custom subagents
├── hooks/              # Event handlers
└── mcp-servers/        # Bundled MCP servers
```

**Plugin Lifecycle:**

```bash
# Add marketplace
/plugin marketplace add <url>

# Install plugin
/plugin install <name>

# Update plugins
/plugin update

# Remove plugin
/plugin remove <name>
```

**SDK Capabilities:**

- ❌ No plugin system
- ⚠️ Must manually bundle configurations

**Agor Strategy: LONG-TERM ECOSYSTEM GOAL**

**Phase 1: Plugin Federation (P3)**

- Parse `.claude-plugin/plugin.json` manifests
- Load bundled commands, agents, MCP servers
- Enable Claude plugins in Agor
- Track plugin usage

**Phase 2: Agor-Native Plugins (P4)**

- Define Agor plugin specification
- Support cross-agent plugins (Claude + Cursor)
- Enhanced capabilities:
  - Plugin analytics
  - Version history
  - Plugin composition
  - Dependency management

**Phase 3: Plugin Marketplace (P5)**

- Public Agor plugin marketplace
- Revenue sharing for creators
- Team plugin management
- Security scanning/certification

**Priority:** P3 (federation), P4 (native), P5 (marketplace)

**Competitive Advantage:**

- **Cross-agent plugins:** Same plugin works with Claude, Cursor, Copilot
- **Better analytics:** Track plugin effectiveness
- **Visual editor:** Build plugins without code
- **Team management:** Centralized plugin distribution

**Risk:** Network effects favor Claude marketplace, requires significant investment

---

### 7. Memory (CLAUDE.md) ⭐ HIGH

**CLI Capabilities:**
Hierarchical memory files provide persistent context.

**Memory Scopes (loaded in order):**

1. **Enterprise Policy** (organization-wide, read-only)
2. **Project Memory** (`.claude/CLAUDE.md`, team-shared)
3. **User Memory** (`~/.claude/CLAUDE.md`, personal)
4. **Local Project** (deprecated, gitignored)

**Features:**

- Automatic loading at session start
- File imports via `@path/to/import` (max 5 hops)
- Quick add via `#` shortcut
- Edit via `/memory` command

**SDK Capabilities:**

- 🟡 Manual via `systemPrompt` or initial message
- ⚠️ Must handle file loading yourself
- ⚠️ No hierarchical composition

**Agor Strategy: ENHANCED CONCEPTS SYSTEM**

**Agor's "Concepts" are superior:**

**Advantages:**

1. **First-Class Entities**
   - Stored in database with metadata
   - Version control and history
   - Track usage across sessions

2. **Dynamic Composition**
   - Select concepts per session
   - Auto-suggest based on repo/task
   - Update without session restart

3. **Multi-Agent Support**
   - Same concepts work with any agent
   - Agent-specific variants
   - Cross-agent knowledge sharing

4. **Smart Selection**
   - Relevance scoring
   - Usage analytics
   - Effectiveness tracking

**Status:** 🔄 In Progress

- ✅ Concept model defined
- ✅ Session-concept relationships
- 📋 Concept CRUD API
- 📋 Concept UI
- 📋 CLAUDE.md import tool
- 📋 Recommendation engine

**Migration Path:**

```bash
# Import existing CLAUDE.md files
pnpm agor concept import --source .claude/CLAUDE.md --scope project
pnpm agor concept import --source ~/.claude/CLAUDE.md --scope user

# Auto-attach to sessions
pnpm agor concept auto-attach --session <id> --repo <repo>
```

**Priority:** P1 (Core differentiator)

---

### 8. Built-in Slash Commands 🟡 MEDIUM

**CLI Built-in Commands:**

- `/add-dir` - Add working directories
- `/clear` - Clear conversation history
- `/init` - Initialize project guide
- `/model` - Select AI model
- `/review` - Request code review
- `/mcp` - Manage MCP servers
- `/permissions` - View/update permissions
- `/status` - Show system settings
- `/help` - Get usage help
- `/memory` - Edit CLAUDE.md files
- `/hooks` - Configure hooks
- `/plugin` - Manage plugins
- `/agents` - Manage subagents

**SDK Capabilities:**

- ❌ No built-in commands
- ⚠️ Programmatic equivalents available

**Agor Strategy: ALTERNATIVE UX PATTERNS**

Don't replicate CLI commands directly—provide superior alternatives:

| CLI Command | Agor Alternative                         |
| ----------- | ---------------------------------------- |
| `/clear`    | Start new session (keep history in tree) |
| `/model`    | Visual model selector dropdown           |
| `/add-dir`  | Drag-and-drop directory management       |
| `/mcp`      | MCP management UI                        |
| `/status`   | Session info panel                       |
| `/memory`   | Concepts UI                              |
| `/hooks`    | Hooks configuration dashboard            |
| `/plugin`   | Plugin browser                           |
| `/agents`   | Subagent library                         |

**Priority:** P3 (Low, better UX alternatives exist)

---

### 9. Interactive REPL 🟡 MEDIUM

**CLI Capabilities:**

- Keyboard shortcuts (Ctrl+C, Ctrl+D, Ctrl+L, etc.)
- Command history (Up/Down, Ctrl+R)
- Multiline input (multiple methods)
- Vim mode
- Quick commands (`#`, `/`, `!`)
- Conversation rewind (Esc+Esc)
- Live toggles (Tab, Shift+Tab)

**SDK Capabilities:**

- ❌ No interactive mode (programmatic API)

**Agor Strategy: N/A (DIFFERENT PARADIGM)**

**Agor's Interaction Model:**

- UI-first (web/desktop app)
- Visual session management
- Multi-session view
- Real-time collaboration
- Rich media support
- Async by default

**No need to replicate CLI REPL—different UX paradigm.**

**Priority:** P∞ (Not applicable)

---

### 10. Git Integration ⭐ CRITICAL

**CLI Capabilities:**

- Automatic git repository detection
- Commit creation and amending
- Branch management
- Pull request creation
- Git status monitoring
- Pre-commit hook integration

**SDK Capabilities:**

- ✅ Full git operations via Bash tool
- ⚠️ Must implement workflow yourself

**Agor Status:** ✅ **ENHANCED**

- Repository management (`repos` table)
- Git worktree isolation per session
- Git state tracking in sessions/tasks
- Worktree lifecycle management

**Unique Capabilities:**

1. **Worktree Isolation:** Each session = dedicated working directory
2. **Parallel Work:** Multiple sessions, same repo, different branches
3. **Reproducibility:** Git state captured at task level
4. **Knowledge Extraction:** Link commits to sessions/tasks
5. **Team Visibility:** See which sessions modified which files

**Priority:** P0 (Foundation complete, enhancements ongoing)

---

### 11. VS Code Extension 🟢 HIGH

**CLI Extension Features:**

- Dedicated sidebar panel
- Plan mode with editing
- Auto-accept edits mode
- File management (@-mentions, attachments)
- MCP server support
- Conversation history
- Multiple simultaneous sessions
- Keyboard shortcuts
- Slash commands

**SDK Capabilities:**

- ❌ No IDE extension

**Agor Strategy: FUTURE IDE INTEGRATION**

**Phase 1: VS Code Extension for Agor (P4)**

- Agor sidebar in VS Code
- View sessions/tasks/boards
- Click to open file at session state
- Session creation from editor selection

**Phase 2: Enhanced Integration (P5)**

- Side-by-side with native Claude Code extension
- Share context between Agor and native
- Bi-directional sync
- Unified command palette

**Phase 3: Multi-IDE Support (P6)**

- JetBrains plugin
- Neovim plugin
- Universal protocol (LSP-like for agents)

**Priority:** P4 (High value, significant investment)

---

## Stack-Ranked Implementation Roadmap

### Tier 1: Foundation (Complete or In Progress)

| Feature             | Priority | Status               | Effort |
| ------------------- | -------- | -------------------- | ------ |
| Session Management  | P0       | ✅ Complete          | -      |
| Git Integration     | P0       | ✅ Complete          | -      |
| Session Resume/Fork | P0       | ✅ Complete          | -      |
| MCP Servers         | P1       | ✅ SDK + CRUD needed | Medium |
| Subagents           | P1       | ✅ SDK Sufficient    | -      |
| Concepts (Memory)   | P1       | 🔄 In Progress       | Medium |

### Tier 2: Power User Features (High Value, Medium Effort)

| Feature                      | Priority | Effort | Timeline | Value                        |
| ---------------------------- | -------- | ------ | -------- | ---------------------------- |
| MCP CRUD + Session Selection | P1       | Medium | Q1 2026  | Critical for multi-agent     |
| Custom Commands (Federation) | P2       | Medium | Q1 2026  | Leverage existing investment |
| Hooks System (Native)        | P2       | Medium | Q1 2026  | Workflow automation          |
| Concept Recommendation       | P2       | Medium | Q2 2026  | Smart context                |
| Session Templates            | P2       | Low    | Q1 2026  | Faster onboarding            |

### Tier 3: Ecosystem Features (High Value, High Effort)

| Feature              | Priority | Effort    | Timeline | Risk                |
| -------------------- | -------- | --------- | -------- | ------------------- |
| Plugin Federation    | P3       | High      | Q2 2026  | Compatibility       |
| CLI Hook Federation  | P3       | Medium    | Q2 2026  | Shell execution     |
| VS Code Extension    | P4       | Very High | Q3 2026  | Complex integration |
| Native Plugin System | P4       | Very High | Q4 2026  | Ecosystem adoption  |

### Tier 4: Advanced/Future

| Feature             | Priority | Effort    | Timeline | Notes              |
| ------------------- | -------- | --------- | -------- | ------------------ |
| Plugin Marketplace  | P5       | Very High | 2027+    | Requires ecosystem |
| Multi-IDE Support   | P6       | Very High | 2027+    | After VS Code      |
| Built-in Command UX | P∞       | N/A       | N/A      | Different paradigm |
| Interactive REPL    | P∞       | N/A       | N/A      | Different paradigm |

---

## Strategic Recommendations

### 1. MCP Integration is Critical (P1)

**Why:**

- MCP servers extend agent capabilities dramatically
- Users invest in MCP configurations
- Essential for tool ecosystem
- SDK provides full support

**What to Build:**

- MCP configuration CRUD (database + UI)
- Session-level MCP server selection
- Visual indication of active servers
- Tool usage tracking per MCP server
- Import `.mcp.json` files
- Sync with user's CLI configs

**See [[mcp-integration]] for detailed design.**

### 2. Focus on Federation Over Replication

**Federation Targets:**

- ✅ MCP servers (via SDK pass-through)
- ✅ Subagents (via SDK pass-through)
- 🔄 Custom slash commands (parse and execute)
- 🔄 Hooks (execute shell scripts)
- 🔄 Plugins (load and proxy)

**Replication Targets:**

- ✅ Session management (foundation)
- ✅ Git integration (enhanced with worktrees)
- 🔄 Concepts (enhanced CLAUDE.md)
- 📋 Native hooks (better than shell scripts)

### 3. Double Down on Differentiators

**Agor's Unique Strengths:**

- Multi-agent orchestration
- Visual session trees
- Cross-session analytics
- Team collaboration
- Worktree isolation
- Reproducible environments
- Cross-agent knowledge sharing

**Don't compete head-to-head—focus on orchestration value.**

### 4. Enable Bi-Directional Sync

**Interoperability Strategy:**

- Import native CLI sessions (✅ implemented for Claude)
- Export Agor sessions to native format
- Sync concepts/commands/configs
- Federate hooks across platforms

**Benefits:**

- Lower switching cost
- Leverage existing investments
- Gradual migration path
- Best-of-both-worlds

### 5. Target Team/Enterprise Use Cases

**Where Agor Wins:**

- Knowledge sharing (sessions/concepts/commands shared)
- Visibility (managers see team progress)
- Governance (enforce hooks/policies org-wide)
- Analytics (aggregate usage, cost, success rates)
- Onboarding (browse existing sessions)
- Reproducibility (recreate session from ID)

---

## Success Metrics

### Adoption (6 months)

- 1,000 active users
- 50 teams (5+ users)
- 10,000 sessions imported
- 20 sessions/user average

### Engagement

- 30% daily active users
- 5 sessions/week per active user
- 60% concept reuse rate
- 20% multi-agent adoption

### Retention

- 60% 30-day retention
- 40% 90-day retention
- 80% team retention
- 70% power user retention (20+ sessions)

---

## Open Questions

### Q1: Should Agor run native CLI sessions directly?

**Options:**

- A) Agor as orchestrator, CLI as execution engine
- B) Agor uses SDK exclusively, CLI separate
- C) Hybrid - SDK default, CLI fallback

**Recommendation:** Option C (hybrid)

- Use SDK for control and metadata
- Fallback to CLI for missing features
- User choice per session

### Q2: How to handle version drift?

**Scenario:** CLI adds feature, Agor doesn't support yet

**Strategy:**

- Graceful degradation
- Telemetry on unsupported features
- Prioritize based on usage
- Transparent roadmap

### Q3: Build Agor plugin marketplace?

**Recommendation:** Federate first, build later

- Phase 1: Support Claude plugins (P3)
- Phase 2: Build Agor spec (P4)
- Phase 3: Launch marketplace if demand (P5)
- Differentiate with cross-agent support

---

## Conclusion

### Key Takeaways

1. **SDK Sufficient for Core:** MCP, subagents, sessions all work
2. **Gap is Extensibility:** Commands, hooks, plugins are CLI-only
3. **Federation > Replication:** Reuse existing configs
4. **Orchestration is Key:** Focus on multi-session/agent/user value
5. **Team Value Justifies Cost:** Enterprise features drive adoption

### Next Steps (Q1 2026)

1. ✅ Complete Concepts UI and recommendation
2. 🔄 Build MCP CRUD and session selection
3. 📋 Implement custom command federation
4. 📋 Add native hooks system
5. 📋 Create CLI migration tool

**Success = Users can import 100% of CLI sessions and reuse 80%+ of configs while gaining orchestration superpowers.**

---

## Appendix: Documentation Links

### Claude Code CLI

- [Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [MCP Servers](https://docs.claude.com/en/docs/claude-code/mcp)
- [Subagents](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Hooks](https://docs.claude.com/en/docs/claude-code/hooks)
- [Plugins](https://docs.claude.com/en/docs/claude-code/plugins)
- [Memory](https://docs.claude.com/en/docs/claude-code/memory)
- [CLI Reference](https://docs.claude.com/en/docs/claude-code/cli-reference)
- [Interactive Mode](https://docs.claude.com/en/docs/claude-code/interactive-mode)

### Claude Code SDK

- [Sessions](https://docs.claude.com/en/docs/claude-code/sdk/sdk-sessions)
- [MCP in SDK](https://docs.claude.com/en/docs/claude-code/sdk/sdk-mcp)
- [Subagents in SDK](https://docs.claude.com/en/docs/claude-code/sdk/subagents)

### Agor Documentation

- [[core]] - Core concepts
- [[models]] - Data models
- [[architecture]] - System architecture
- [[agent-interface]] - Agent abstraction
- [[mcp-integration]] - MCP design (to be created)
