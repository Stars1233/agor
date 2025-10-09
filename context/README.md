# Agor Context

This directory contains modular knowledge files that document Agor's concepts, architecture, and design principles. These files are designed to be:

- **Composable** - Load only what you need
- **Self-referencing** - Concepts link to related concepts
- **Version-controlled** - Track evolution of ideas over time
- **AI-friendly** - Agents can load specific concepts as context

## Available Concepts

### Core Concepts

- **[core.md](concepts/core.md)** - The 5 primitives, core insights, and vision
- **[models.md](concepts/models.md)** - Information architecture, data models, and relationships
- **[id-management.md](concepts/id-management.md)** - UUIDv7 strategy, short IDs, collision resolution
- **[architecture.md](concepts/architecture.md)** - System design, storage structure, data flow (WIP)
- **[design.md](concepts/design.md)** - UI/UX principles and component patterns

### Explorations (Work in Progress)

Experimental ideas and designs not yet crystallized into concepts. These represent active thinking and may graduate to `concepts/` when ready:

**Agent Integration:**

- **[agent-interface.md](explorations/agent-interface.md)** - Agent abstraction layer design for supporting multiple AI agents (Claude Code, Cursor, Codex, Gemini)
- **[agent-abstraction-analysis.md](explorations/agent-abstraction-analysis.md)** - Analysis of agent integration patterns and common abstractions
- **[terminology-agentic-tools.md](explorations/terminology-agentic-tools.md)** - Terminology definitions for agentic systems and tools

**CLI & User Experience:**

- **[cli.md](explorations/cli.md)** - CLI design patterns (oclif framework, entity commands, stateful context management)
- **[conversation-design.md](explorations/conversation-design.md)** - Conversational interface patterns for agent interactions
- **[native-cli-feature-gaps.md](explorations/native-cli-feature-gaps.md)** - Feature comparison between native agent CLIs and SDK capabilities

**Orchestration & Coordination:**

- **[subtask-orchestration.md](explorations/subtask-orchestration.md)** - Multi-agent task coordination and getting agents to spawn Agor-tracked subtasks
- **[async-jobs.md](explorations/async-jobs.md)** - Background job processing, queuing strategies, and long-running task management

**Real-time Communication:**

- **[websockets.md](explorations/websockets.md)** - WebSocket architecture with Socket.io, current broadcast-all design, future board-based channels, and multiplayer features (cursor tracking, presence, collaborative editing)

**Lifecycle:** `explorations/` → `concepts/` when design is validated and ready to be official

### Primitives (Deep Dives)

Future location for detailed explorations of each primitive:

- `primitives/session.md` - Sessions in depth
- `primitives/task.md` - Tasks in depth
- `primitives/report.md` - Reports in depth
- `primitives/worktree.md` - Worktrees in depth
- `primitives/concept.md` - Concepts in depth (meta!)

## Using Context Files

### For Developers

Read concept files to understand specific aspects of Agor:

```bash
# Start with core concepts
cat context/concepts/core.md

# Then explore specific areas
cat context/concepts/architecture.md
cat context/concepts/design.md
```

### For AI Agents

Load relevant concepts into session context:

```bash
# Example: Starting a session focused on UI work
agor session start \
  --concepts design \
  --agent claude-code
```

## Contributing

When adding new concepts:

1. Create focused, single-topic files (prefer smaller over larger)
2. Use wiki-style links to reference related concepts: `[[concept-name]]`
3. Include "Related:" section at the top
4. Add entry to this README
5. Update cross-references in existing concepts

## Philosophy

> "Context engineering isn't about prompt templates—it's about managing modular knowledge as first-class composable primitives."

These concept files embody Agor's own design philosophy applied to documentation.
