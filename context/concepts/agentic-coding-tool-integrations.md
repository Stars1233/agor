# Agentic Coding Tool Integrations

**Related:** [[agent-integration]], [[permissions]], [[conversation-ui]]

This document covers Agor's integration with agentic coding tools (Claude Code, Codex, Gemini), including feature comparison, implementation patterns, and integration status.

## Supported Tools

Agor integrates with three production-ready agentic coding tools:

1. **Claude Code** (Anthropic) - `@anthropic-ai/claude-agent-sdk`
2. **Codex** (OpenAI) - `@openai/codex-sdk`
3. **Gemini CLI** (Google) - `@google/gemini-cli-core`

All three use official SDKs for programmatic control, streaming, and session management.

## Feature Comparison Matrix

### Quick Reference

| Feature                           | Claude Code          | Codex               | Gemini             |
| --------------------------------- | -------------------- | ------------------- | ------------------ |
| **SDK Available**                 | ✅ Official          | ✅ Official         | ✅ Official        |
| **Streaming Support**             | ✅ Token-level       | ✅ Event-based      | ✅ Token-level     |
| **Permission Modes**              | ✅ 4 modes           | ✅ 4 modes (hybrid) | ✅ 3 modes         |
| **Mid-Session Permission Change** | ✅ Via hooks         | ✅ Via /approvals   | ⚠️ Needs testing   |
| **Session Continuity**            | ✅ sdk_session_id    | ✅ Thread ID        | ✅ History array   |
| **Model Selection**               | ✅ Via SDK           | ✅ Via SDK          | ✅ Via SDK         |
| **MCP Support**                   | ✅ Via SDK           | ❌ No MCP           | ✅ Via SDK         |
| **Session Import**                | ✅ JSONL transcripts | ❌ Format unknown   | ❌ Not implemented |
| **Tool Event Details**            | ✅ Rich metadata     | ✅ Rich metadata    | ✅ 13 event types  |
| **Interactive Permissions**       | ✅ PreToolUse hook   | ❌ Config-only      | ⚠️ Unknown         |

### Detailed Breakdown

#### 1. Streaming Support

**Claude Code:** Token-level streaming via `promptSessionStreaming()` with `includePartialMessages: true`

- Event types: `stream_event` with `content_block_delta`
- Granularity: Individual tokens
- Pattern: AsyncGenerator

**Codex:** Event-based streaming via `runStreamed()`

- Event types: `item.updated`, `item.started`, `item.completed`, `turn.completed`
- Granularity: Progressive text deltas
- Pattern: AsyncGenerator

**Gemini:** Token-level streaming via `sendMessageStream()`

- Event types: 13 types (content, tool_call_request, thought, error, etc.)
- Granularity: Text chunks + rich events
- Pattern: AsyncGenerator

**Agor Integration:** All three support `type: 'partial'` events with `textChunk` for typewriter effect.

---

#### 2. Permission Modes

**Claude Code:** 4 modes via `permissionMode` SDK parameter

| Agor Mode    | SDK Parameter         | Description                               |
| ------------ | --------------------- | ----------------------------------------- |
| `ask`        | `'default'`           | Prompt for each tool use                  |
| `auto`       | `'acceptEdits'`       | Auto-accept file edits, ask for shell/web |
| `allow-all`  | `'bypassPermissions'` | Allow all operations                      |
| N/A (hidden) | `'plan'`              | Generate plan without executing           |

**Codex:** 4 modes via hybrid approach (sandboxMode + approval_policy)

| Agor Mode    | SDK sandboxMode   | Config approval_policy | Description                |
| ------------ | ----------------- | ---------------------- | -------------------------- |
| `ask`        | `read-only`       | `untrusted`            | Prompt for each tool use   |
| `auto`       | `workspace-write` | `on-request`           | Auto-approve certain tools |
| `on-failure` | `workspace-write` | `on-failure`           | Only ask if tool fails     |
| `allow-all`  | `workspace-write` | `never`                | Allow all operations       |

**Gemini:** 3 modes via `ApprovalMode` enum in Config

| Agor Mode   | SDK ApprovalMode | Description              |
| ----------- | ---------------- | ------------------------ |
| `ask`       | `DEFAULT`        | Prompt for each tool use |
| `auto`      | `AUTO_EDIT`      | Auto-approve file edits  |
| `allow-all` | `YOLO`           | Allow all operations     |

**UI Implementation:**

- Claude Code: Shows 3 modes (Ask, Auto, Allow All)
- Codex: Shows 4 modes (Untrusted, On Request, On Failure, Never) - SDK-native terms
- Gemini: Shows 3 modes (Ask, Auto, Allow All)

---

#### 3. Mid-Session Permission Changes

**Claude Code:** ✅ Fully supported

- Mechanism: Permission mode passed on each `promptSessionStreaming()` call
- Storage: `session.permission_config` + WebSocket broadcast
- UX: Instant switch via SessionDrawer dropdown

**Codex:** ✅ Fully supported

- Mechanism: `/approvals` slash command updates `~/.codex/config.toml`
- Storage: Config file + `session.permission_config` + WebSocket broadcast
- UX: Permission dropdown updates both config and session state

**Gemini:** ⚠️ Needs testing

- Challenge: ApprovalMode passed to `Config` constructor at session start
- Workaround: May need to create new GeminiClient instance
- Status: Not yet tested

---

#### 4. Session Continuity (Resumption)

**Claude Code:** `resume: sdk_session_id` parameter

- Storage: `session.sdk_session_id` (UUID from SDK)
- Resumption: Pass saved ID to `promptSessionStreaming()`
- Status: ✅ Fully working

**Codex:** `resumeThread(threadId)` API

- Storage: `session.sdk_session_id` (maps to Codex thread ID)
- Resumption: Load thread ID from database
- Status: ✅ Fully working

**Gemini:** `setHistory(contents)` / `getHistory()` API

- Storage: Would need to serialize `Content[]` array
- Resumption: Restore conversation history on new client
- Status: ❌ Not yet implemented

---

#### 5. Model Selection

**Claude Code:**

- API: `model: 'sonnet-4-5'` parameter
- Options: `'sonnet-4-5'`, `'sonnet-4'`, `'opus-4'`
- Mid-session change: ✅ Yes (pass new model on next call)
- Status: ✅ Complete

**Codex:**

- API: Model specified in backend config (not exposed in SDK)
- Options: GPT-4.1 Turbo (default)
- Mid-session change: Unknown (SDK doesn't expose parameter)
- Status: ✅ UI-only (not sent to SDK)

**Gemini:**

- API: `model: 'gemini-2.5-flash'` in Config
- Options: `'gemini-2.5-pro'`, `'gemini-2.5-flash'`, `'gemini-2.5-flash-lite'`
- Mid-session change: May require new client instance
- Status: ✅ Complete (needs testing for mid-session)

---

#### 6. MCP (Model Context Protocol) Support

**Claude Code:** ✅ Full support

- API: `mcpServers: Record<string, MCPServerConfig>` parameter
- Agor integration: Session-level MCP server selection via UI
- Status: ✅ Fully wired and working

**Codex:** ❌ Not supported

- Status: Codex SDK does not support MCP

**Gemini:** ✅ SDK supports MCP

- API: `mcpServers: Record<string, MCPServerConfig>` in Config
- Agor integration: Ready but not yet wired
- Status: ⚠️ SDK ready, Agor integration pending

---

#### 7. Session Import (Loading Past Sessions)

**Claude Code:** ✅ Full import support

- Source: `~/.claude/projects/<project-name>/<session-id>.jsonl`
- Parser: `packages/core/src/tools/claude/import/`
- Command: `agor session load-claude <id>`
- Features: Message filtering, task extraction, bulk insert, board assignment
- Status: ✅ Complete

**Codex:** ❌ Not implemented

- Challenge: Session format unknown
- Status: Deferred pending format discovery

**Gemini:** ❌ Not implemented

- Alternative: Could use `getHistory()` for live sessions
- Status: Deferred pending checkpoint format documentation

---

#### 8. Tool Event Details

**Claude Code:** Rich metadata with specialized UI components

- Tools: File read/write, bash, grep, glob, web search, web fetch, MCP tools
- UI: BashBlock, FileEditBlock, GrepBlock, etc. with semantic grouping
- Status: ✅ Full tool visualization

**Codex:** Rich metadata with basic rendering

- Tools: File ops, shell, grep, web search, web fetch, command execution
- Event types: `command_execution`, `file_change`, `mcp_tool_call`
- Status: ⚠️ Basic rendering (needs enhancement)

**Gemini:** 13 event types with extensive metadata

- Events: `content`, `tool_call_request`, `tool_call_response`, `thought`, `error`, `chat_compressed`, `citation`, `retry`, etc.
- Unique: Agent reasoning (`thought`), loop detection, context compression
- Status: ❌ Tool blocks not yet implemented

---

#### 9. Interactive Permission Checks

**Claude Code:** ✅ PreToolUse hook

- Capabilities: Inspect tool + input, approve/reject, modify input
- Implementation: Agor uses for `ask` mode UI prompts
- Requires: `permissionMode: 'default'`
- Status: ✅ Complete

**Codex:** ❌ Config-only

- Mechanism: Permission policy in `~/.codex/config.toml`
- Limitation: No per-tool runtime inspection in Agor
- Workaround: User uses `/approvals` slash command within Codex
- Status: Not supported (by design)

**Gemini:** ⚠️ Unknown

- Possibility: `tool_call_confirmation` event suggests approval system
- Challenge: Unclear how to hook into approval flow
- Status: Needs investigation

---

## Implementation Patterns

All three integrations follow a common architecture in Agor:

### File Structure

```
packages/core/src/tools/
├── claude/
│   ├── claude-tool.ts        # ClaudeTool class (implements ITool)
│   ├── prompt-service.ts     # SDK wrapper with streaming
│   ├── models.ts             # Model definitions
│   └── import/               # Session import utilities
│       ├── load-session.ts
│       ├── transcript-parser.ts
│       └── task-extractor.ts
│
├── codex/
│   ├── codex-tool.ts         # CodexTool class (implements ITool)
│   ├── prompt-service.ts     # SDK wrapper with streaming
│   └── models.ts             # Model definitions
│
└── gemini/
    ├── gemini-tool.ts        # GeminiTool class (implements ITool)
    ├── prompt-service.ts     # SDK wrapper with streaming
    └── models.ts             # Model definitions
```

### Common Interface (ITool)

```typescript
interface ITool {
  executePromptWithStreaming(
    sessionId: SessionID,
    prompt: string,
    taskId: TaskID,
    permissionMode: PermissionMode,
    streamingCallbacks: StreamingCallbacks
  ): Promise<void>;

  executePrompt(
    sessionId: SessionID,
    prompt: string,
    taskId: TaskID,
    permissionMode: PermissionMode
  ): Promise<void>;
}
```

### Streaming Callbacks

```typescript
interface StreamingCallbacks {
  onStreamStart: (messageId: MessageID) => void;
  onStreamChunk: (messageId: MessageID, chunk: string) => void;
  onStreamComplete: (messageId: MessageID) => void;
}
```

### Session Schema

```typescript
interface Session {
  session_id: SessionID;
  agentic_tool: 'claude' | 'codex' | 'gemini';
  sdk_session_id?: string; // For Claude/Codex resumption
  permission_config?: {
    mode: PermissionMode;
    updated_at: string;
  };
  model_config?: {
    mode: 'exact' | 'latest';
    model?: string;
    updated_at?: string;
  };
  mcp_server_ids?: string[]; // MCP server UUIDs
  // ... other fields
}
```

---

## Agor Integration Status

| Feature                     | Claude Code | Codex            | Gemini               |
| --------------------------- | ----------- | ---------------- | -------------------- |
| **Live Execution**          | ✅ Complete | ✅ Complete      | ✅ Complete          |
| **Streaming UI**            | ✅ Complete | ✅ Complete      | ✅ Complete          |
| **Permission Modes**        | ✅ Complete | ✅ Complete      | ✅ Complete          |
| **Mid-Session Mode Change** | ✅ Complete | ✅ Complete      | ⚠️ Needs testing     |
| **Session Resumption**      | ✅ Complete | ✅ Complete      | ❌ Not implemented   |
| **Model Selection UI**      | ✅ Complete | ✅ Complete      | ✅ Complete          |
| **MCP Integration**         | ✅ Complete | ❌ Not supported | ⚠️ Ready (not wired) |
| **Session Import**          | ✅ Complete | ❌ Deferred      | ❌ Not implemented   |
| **Tool Visualization**      | ✅ Complete | ⚠️ Basic         | ❌ Not implemented   |
| **Interactive Approvals**   | ✅ Complete | ❌ Not supported | ⚠️ Unknown           |

---

## Unique Features by Tool

### Claude Code Only

- **PreToolUse hook** - Runtime tool approval with input inspection
- **Session import** - Load past sessions from JSONL transcripts
- **Plan mode** - Generate plan without execution
- **Full MCP integration** - Working in Agor

### Codex Only

- **Hybrid permission system** - Dual-setting approach (sandboxMode + approval_policy)
- **On-failure approval** - Only ask if tool execution fails
- **Slash commands** - `/approvals` for mid-session permission changes

### Gemini Only

- **13 event types** - Most detailed event stream
- **Thought events** - Explicit agent reasoning exposed
- **Loop detection** - Automatic infinite loop prevention
- **Context compression** - Automatic context window management
- **ApprovalMode.YOLO** - Most permissive mode name

---

## Cost Comparison

| Provider      | Model                 | Input ($/1M tokens) | Output ($/1M tokens) | Use Case                   |
| ------------- | --------------------- | ------------------- | -------------------- | -------------------------- |
| **Anthropic** | Sonnet 4.5            | ~$3.00              | ~$15.00              | Claude Code (most capable) |
| **OpenAI**    | GPT-4.1 Turbo         | ~$2.50              | ~$10.00              | Codex (balanced)           |
| **Google**    | Gemini 2.5 Pro        | Higher              | Higher               | Complex reasoning          |
| **Google**    | Gemini 2.5 Flash      | $0.30               | $2.50                | Agentic tasks (cheapest)   |
| **Google**    | Gemini 2.5 Flash-Lite | $0.10               | $0.40                | High throughput            |

**Note:** Gemini Flash/Flash-Lite offer significant cost savings for high-volume usage.

---

## Future Work

### Gemini Integration Gaps

1. **Session resumption** - Implement history serialization
2. **MCP wiring** - Connect session MCP server IDs to SDK config
3. **Mid-session mode change** - Test if new client required
4. **Tool visualization** - Build Gemini-specific tool blocks
5. **Interactive approvals** - Investigate `tool_call_confirmation` handling
6. **Session import** - Discover checkpoint format

### Codex Enhancements

1. **Tool visualization** - Enhance tool blocks to Claude Code level
2. **Session import** - Discover and parse Codex session format

### Cross-Tool Features

1. **Permission audit trail** - Log all approval decisions
2. **Unified tool blocks** - Abstract tool rendering
3. **Session migration** - Convert sessions between agent formats
4. **Cost tracking** - Track token usage per agent/model

---

## References

**SDKs:**

- [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [@openai/codex-sdk](https://www.npmjs.com/package/@openai/codex-sdk)
- [@google/gemini-cli-core](https://www.npmjs.com/package/@google/gemini-cli-core)

**Related Concepts:**

- [[agent-integration]] - Claude Code SDK integration details
- [[permissions]] - Permission system design
- [[conversation-ui]] - Message and tool rendering
- [[mcp-integration]] - MCP server management

**Explorations:**

- `context/explorations/native-cli-feature-gaps.md` - Native CLI vs SDK comparison
