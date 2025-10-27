# Agor

Multiplayer canvas for orchestrating Claude Code, Codex, and Gemini sessions.

**Website:** https://agor.live
**GitHub:** https://github.com/mistercrunch/agor

---

## Installation

```bash
npm install -g agor-live
```

This installs two commands:

- **`agor`** - CLI for managing repos, sessions, and configuration
- **`agor-daemon`** - Background service with built-in web UI

---

## Quick Start

```bash
# Start the daemon (runs on http://localhost:3030)
agor daemon start

# Open the web UI in your browser
agor ui open

# Or use the CLI
agor repo add ~/my-project
agor session create
```

---

## What It Does

- **Agent orchestration** - Run Claude Code, Codex, Gemini from one interface
- **Git worktree management** - Isolated workspaces per session, no branch conflicts
- **Real-time multiplayer** - See teammates' sessions, collaborate async
- **Session tracking** - Every AI conversation is stored, searchable, forkable
- **MCP integration** - Configure MCP servers once, use across all agents

---

## Learn More

- **Documentation:** https://agor.live/guide/getting-started
- **Architecture:** https://agor.live/guide/architecture
- **Discussions:** https://github.com/mistercrunch/agor/discussions

---

## License

Business Source License 1.1 (BUSL-1.1)

Free for non-production use. Commercial licenses available from the author.
Converts to Apache 2.0 on 2029-01-15.
