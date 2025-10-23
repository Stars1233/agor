# Launch Checklist

Simple todo list for launch preparation.

## Must-Do for Launch

### Core Features

- [ ] Session forking UI with genealogy visualization
- [ ] Troubleshoot Claude session edge cases (unclear/incomplete results)
- [ ] Concepts & Reports as first-class primitives (CRUD in UI/CLI)
- [ ] Report generation system

### Tool Visualization

- [ ] Todo tool rendering with checkboxes
- [ ] Write/Edit tool with file diffs and syntax highlighting

### Documentation

- [ ] Deploy docs website to docs.agor.dev (Vercel)
- [ ] Architecture docs (adapt from context/concepts/)
- [ ] Complete getting started guide with screenshots/videos

### Distribution

- [ ] Publish `@agor/core` to npm
- [ ] Publish `@agor/daemon` to npm
- [ ] Publish `@agor/cli` to npm
- [ ] Bundle daemon into CLI for simplified install
- [ ] Auto-start daemon on CLI commands
- [ ] Add `agor daemon` lifecycle commands (start/stop/status/logs)

---

## Nice-to-Have for Launch

### UX Polish

- [ ] Token count & cost tracking ($ per task/session)
- [ ] `@`-triggered autocomplete for sessions/repos/concepts
- [ ] Typing indicators in prompt input
- [ ] Worktree CLI commands (`agor worktree list/create/delete`)

### Advanced Features

- [ ] Multi-agent comparison view (side-by-side outputs)
- [ ] Session templates for common workflows
- [ ] Keyboard shortcuts for board navigation
- [ ] Export session/task as markdown

---

## Post-Launch (Future)

See [context/explorations/](context/explorations/) for detailed designs:

- **CLI session sync** - Keep local CLI sessions in sync with Agor for seamless solo-to-collab handoff
- OAuth & organizations (GitHub/Google login, team workspaces, RBAC)
- Additional agent integrations (Cursor, more Gemini modes)
- Cloud deployment (PostgreSQL, Turso/Supabase, hosted version)
- Advanced worktree UX (see `worktree-ux-design.md`)
- Background job system (see `async-jobs.md`)
- Subtask orchestration (see `subtask-orchestration.md`)
