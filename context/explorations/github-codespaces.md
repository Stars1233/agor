# GitHub Codespaces Support

**Status:** Proposed
**Owner:** TBD
**Last Updated:** 2025-10-20

## Overview

GitHub Codespaces integration provides a **zero-install sandbox environment** for trying Agor without local setup. Users get a fully functional Agor instance with daemon + UI running on port-forwarded URLs, ready to orchestrate AI agents and manage worktrees.

**Key Goals:**

- **Fast boot** - Services auto-start in < 60 seconds
- **Sandbox mode** - Clear warnings about early beta status and security
- **Docker-in-Docker** - Agor can spin up environment containers
- **Multiplayer-ready** - Public URLs for collaborative sessions
- **No local install** - Works entirely in browser
- **Interactive setup** - Uses `agor init` for first-run configuration (auth, API keys)

**First-Run Experience:**

1. User opens Codespace → Dockerfile builds (~30s)
2. `postCreateCommand` runs: `pnpm install && pnpm -r build` (~60s)
3. `postStartCommand` runs `.devcontainer/start-services.sh`:
   - Detects no `~/.agor/` directory
   - Runs `agor init --force` (non-interactive, anonymous mode, no auth)
   - Displays message: "Run 'agor init' again to set up auth and API keys"
   - Starts daemon + UI in background
   - Opens port 5173 in browser automatically
4. User sees Agor UI with sandbox banner + setup reminder
5. User runs `agor init` in terminal when ready to configure properly
6. Ready to create sessions and orchestrate agents!

**Why `--force` first?**

- Fast boot - services start immediately without waiting for user input
- User sees UI right away and can explore
- They can run `agor init` properly when ready (with prompts for auth, keys, etc.)
- Improves time-to-first-screen significantly

---

## Architecture

### Dockerfile

Codespaces uses a **dedicated Dockerfile** (based on `Dockerfile.dev`) with additional Docker-in-Docker support:

**Key differences from `Dockerfile.dev`:**

1. **Base image:** `mcr.microsoft.com/devcontainers/typescript-node:20` (optimized for Codespaces)
2. **Docker-in-Docker:** Installed via devcontainer feature (see devcontainer.json)
3. **Non-root user:** Uses `node` user (Codespaces default) instead of `root`
4. **AI CLI tools:** Same as dev - Claude Code, Gemini CLI
5. **System deps:** sqlite3, git (matches Dockerfile.dev)

**Location:** `.devcontainer/Dockerfile`

```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install system dependencies (matches Dockerfile.dev)
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and AI coding agent CLIs (matches Dockerfile.dev)
RUN npm install -g pnpm@9.15.1 @anthropic-ai/claude-code @google/gemini-cli

# Set working directory
WORKDIR /workspace

# Switch to non-root user (required for Codespaces)
USER node
```

**Note:** Docker CLI and Docker Compose are installed via the `docker-in-docker` feature in `devcontainer.json`, not in the Dockerfile.

### devcontainer.json

**Location:** `.devcontainer/devcontainer.json`

**Key Configuration:**

- **Features:** `docker-in-docker` for nested container support
- **Port forwarding:** 3030 (daemon), 5173 (UI) with auto-visibility
- **Post-create command:** Install deps + build
- **Post-start command:** Auto-start daemon + UI in background
- **Extensions:** ESLint, Prettier, TypeScript, SQLite viewer

```json
{
  "name": "Agor Sandbox",
  "build": {
    "dockerfile": "Dockerfile"
  },
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {
      "version": "latest",
      "enableNonRootDocker": "true"
    }
  },
  "forwardPorts": [3030, 5173],
  "portsAttributes": {
    "3030": {
      "label": "Agor Daemon",
      "onAutoForward": "notify"
    },
    "5173": {
      "label": "Agor UI",
      "onAutoForward": "openBrowserOnce"
    }
  },
  "postCreateCommand": "pnpm install && pnpm -r build",
  "postStartCommand": "bash .devcontainer/start-services.sh",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
        "alexcvzz.vscode-sqlite"
      ],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "bash"
      }
    }
  },
  "remoteUser": "node"
}
```

### Service Startup Script

**Location:** `.devcontainer/start-services.sh`

**Purpose:** Auto-start daemon + UI in background with logging

**Key Features:**

- Runs `agor init` on first boot (creates ~/.agor/, database, prompts for auth setup)
- Starts daemon + UI in background with health checks
- Logs to `/tmp/` for easy debugging
- Displays Codespaces sandbox warning

```bash
#!/bin/bash
set -e

echo "🚀 Starting Agor Codespaces environment..."
echo ""

# Check if this is first run
if [ ! -d ~/.agor ]; then
  echo "📦 First run detected - initializing Agor with defaults..."
  echo ""
  echo "⚠️  SANDBOX MODE: This is a temporary Codespaces instance."
  echo "   - Data is ephemeral (lost on rebuild)"
  echo "   - Early beta - not production-ready"
  echo "   - See https://github.com/agor-dev/agor for local installation"
  echo ""

  # Run agor init with --force to skip prompts (anonymous mode, no auth)
  cd /workspace/apps/agor-cli
  pnpm exec tsx bin/dev.ts init --force

  echo ""
  echo "✅ Basic initialization complete!"
  echo ""
  echo "📝 IMPORTANT: Run 'agor init' again to:"
  echo "   - Set up authentication (create admin user)"
  echo "   - Configure API keys (Anthropic, OpenAI, Google)"
  echo "   - Customize settings for your workflow"
  echo ""
fi

# Start daemon in background
cd /workspace/apps/agor-daemon
echo "🔧 Starting daemon on :3030..."
pnpm dev > /tmp/agor-daemon.log 2>&1 &
DAEMON_PID=$!

# Wait for daemon to be ready
echo -n "   Waiting for daemon to start"
for i in {1..30}; do
  if curl -s http://localhost:3030/health > /dev/null 2>&1; then
    echo " ✅ (PID $DAEMON_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo " ❌"
    echo ""
    echo "Daemon failed to start. Check logs:"
    echo "  tail -f /tmp/agor-daemon.log"
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Start UI in background
cd /workspace/apps/agor-ui
echo "🎨 Starting UI on :5173..."
pnpm dev > /tmp/agor-ui.log 2>&1 &
UI_PID=$!

# Wait for UI to be ready
echo -n "   Waiting for UI to start"
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo " ✅ (PID $UI_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo " ❌"
    echo ""
    echo "UI failed to start. Check logs:"
    echo "  tail -f /tmp/agor-ui.log"
    exit 1
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "🎉 Agor is running!"
echo ""
echo "   Daemon: http://localhost:3030"
echo "   UI: http://localhost:5173"
echo ""
echo "   (Codespaces will auto-forward these ports)"
echo ""
echo "📝 Logs:"
echo "   tail -f /tmp/agor-daemon.log"
echo "   tail -f /tmp/agor-ui.log"
echo ""
echo "⚠️  SANDBOX MODE - Early beta, not production-ready"
echo "   - Use 'Ports' panel to make URLs public for collaboration"
echo "   - Data is ephemeral (persists only while Codespace is active)"
echo ""
```

---

## Sandbox Mode UI

### Welcome Banner

**Location:** `apps/agor-ui/src/components/SandboxBanner.tsx`

**Behavior:**

- Show banner at top of UI when `VITE_CODESPACES=true`
- Display Codespaces URL info and visibility toggle
- **Show setup reminder** if no API keys detected or auth is disabled
- Dismissible but persists across reloads (localStorage)

```tsx
import { Alert, Button, Space, Typography } from 'antd';
import { CloudOutlined, SettingOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

export function SandboxBanner() {
  const isCodespaces = import.meta.env.VITE_CODESPACES === 'true';
  const [showSetupReminder, setShowSetupReminder] = useState(false);

  useEffect(() => {
    // Check if API keys are set or if we're in anonymous mode
    // This is a simple heuristic - real check would ping daemon config
    const hasAnthropicKey = !!import.meta.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!import.meta.env.OPENAI_API_KEY;

    // Show reminder if no keys detected
    if (!hasAnthropicKey && !hasOpenAIKey) {
      setShowSetupReminder(true);
    }
  }, []);

  if (!isCodespaces) return null;

  return (
    <>
      {/* Main sandbox warning */}
      <Alert
        banner
        type="warning"
        icon={<CloudOutlined />}
        message={
          <Space>
            <Typography.Text strong>🧪 Sandbox Mode - GitHub Codespaces</Typography.Text>
            <Typography.Text type="secondary">
              Early beta - Data is ephemeral. Avoid sensitive data.
            </Typography.Text>
            <Button
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => {
                window.open('https://github.com/codespaces', '_blank');
              }}
            >
              Manage Visibility
            </Button>
          </Space>
        }
        closable
      />

      {/* Setup reminder (only if not configured) */}
      {showSetupReminder && (
        <Alert
          banner
          type="info"
          icon={<SettingOutlined />}
          message={
            <Space>
              <Typography.Text>
                Run <code>agor init</code> in the terminal to set up authentication and API keys
              </Typography.Text>
              <Button
                size="small"
                onClick={() => {
                  // Copy command to clipboard
                  navigator.clipboard.writeText('agor init');
                }}
              >
                Copy Command
              </Button>
            </Space>
          }
          closable
          onClose={() => setShowSetupReminder(false)}
        />
      )}
    </>
  );
}
```

**Integration in App.tsx:**

```tsx
import { SandboxBanner } from './components/SandboxBanner';

function App() {
  return (
    <>
      <SandboxBanner />
      {/* Rest of app */}
    </>
  );
}
```

### Environment Variables

**In `.devcontainer/devcontainer.json`:**

```json
{
  "containerEnv": {
    "VITE_CODESPACES": "true"
  }
}
```

---

## Port Forwarding & Visibility

### Default Behavior

- **3030 (daemon):** Private by default (auth required)
- **5173 (UI):** Private by default (GitHub auth)

### Public URLs

Users can make ports public via Codespaces UI:

1. Open **Ports** panel in VS Code
2. Right-click port → **Port Visibility** → **Public**
3. Share URL for multiplayer collaboration

**Security Considerations:**

- Public daemon = anyone can create sessions (add auth in Phase 3)
- Public UI = anonymous users see all boards (add permission checks)

### Recommended Settings

**For solo work:** Keep both private
**For collaboration:** Make UI public, keep daemon private (UI proxies requests)
**For demos:** Make both public with auth disabled

---

## Pre-installed AI Agent CLIs

**Location:** Installed globally in Dockerfile (matches `Dockerfile.dev`)

The Codespaces environment comes with these AI coding agent CLIs pre-installed:

### Claude Code CLI

```bash
claude --version
# Requires: ANTHROPIC_API_KEY environment variable
```

**Usage in Agor:**

- Agor's Claude Agent SDK uses this CLI under the hood
- Sessions with `agentic_tool: "claude-code"` will spawn `claude` processes
- Worktree isolation ensures each session has correct working directory

### Gemini CLI

```bash
gemini --version
# Requires: GOOGLE_AI_API_KEY environment variable
```

**Usage in Agor:**

- Agor's Gemini SDK integration (Phase 3) will use this CLI
- Sessions with `agentic_tool: "gemini"` will spawn `gemini` processes

### Why Pre-install?

1. **Fast boot** - No need to install during startup (saves ~30 seconds)
2. **Version consistency** - All Codespaces use same CLI versions
3. **Docker compatibility** - Pre-built binaries work in Docker-in-Docker context
4. **Matches dev environment** - Same setup as `Dockerfile.dev`

**Note:** Other agent CLIs (Cursor, Aider, etc.) can be installed manually if needed.

---

## Docker-in-Docker Setup

### Why Nested Docker?

Agor's environment management (Phase 2) requires spinning up docker-compose stacks for worktrees. Codespaces needs Docker-in-Docker to support this.

### Feature Configuration

**In `devcontainer.json`:**

```json
{
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {
      "version": "latest",
      "enableNonRootDocker": "true"
    }
  }
}
```

### Testing Docker

```bash
# In Codespaces terminal
docker ps
docker compose version

# Test environment spin-up
cd ~/.agor/worktrees/myrepo/worktree1
docker compose up -d
```

---

## User Documentation

### Quick Start (README.md section)

```markdown
## Try Agor in GitHub Codespaces (Sandbox)

**No installation required** - Get a fully functional Agor instance in < 60 seconds:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/agor-dev/agor?quickstart=1)

**What you get:**

- ✅ Daemon + UI auto-running on :3030 and :5173
- ✅ Docker-in-Docker for environment management
- ✅ Port-forwarded URLs (private or public)
- ✅ Full multiplayer support

**⚠️ Sandbox Mode:**

- Early beta - Not 100% secure
- Avoid storing sensitive data (API keys, credentials)
- Codespaces free tier: 60 hours/month (check your usage)

**Getting Started:**

1. Click the badge above → Wait for services to start (~60s)
2. Open forwarded URL for port 5173 (UI) in browser
3. Create a session and start orchestrating!

**Collaborating:**

1. Open **Ports** panel in VS Code
2. Right-click port 5173 → **Port Visibility** → **Public**
3. Share the public URL with teammates
```

### In-App Help

**Location:** Settings → About → Sandbox Info

**Content:**

- Codespaces instance details (machine type, region)
- Current port visibility status
- Usage limits and billing info link
- Security best practices

---

## Development Workflow

### Testing Codespaces Config Locally

Use the Dev Containers extension:

1. Install **Dev Containers** extension in VS Code
2. Command Palette → **Dev Containers: Reopen in Container**
3. Test startup script and port forwarding

### Debugging

**Check service logs:**

```bash
tail -f /tmp/agor-daemon.log
tail -f /tmp/agor-ui.log
```

**Restart services:**

```bash
# Kill existing processes
pkill -f "pnpm dev"

# Re-run startup script
bash .devcontainer/start-services.sh
```

### Updating Configuration

1. Edit `.devcontainer/devcontainer.json` or `Dockerfile`
2. Command Palette → **Dev Containers: Rebuild Container**
3. Codespaces will rebuild on next start

---

## Security Considerations

### Current Limitations (Early Beta)

- ❌ No authentication on daemon endpoints
- ❌ No rate limiting on public URLs
- ❌ No sandboxing for agent-executed code
- ❌ No secret management for API keys

### Best Practices

**For users:**

- Use private ports for sensitive work
- Avoid storing credentials in session data
- Delete Codespaces instances when done
- Monitor GitHub usage/billing

**For future phases:**

- Add JWT auth to daemon (Phase 3)
- Implement session-level permissions
- Secure secret storage (Vault integration)
- Rate limiting + abuse detection

---

## Improving `agor init` for Codespaces

**Goal:** Make `agor init` Codespaces-aware and guide users through sandbox setup

**Proposed Enhancements:**

### 1. Detect Codespaces Environment

```typescript
// In apps/agor-cli/src/commands/init.ts

private isCodespaces(): boolean {
  return process.env.CODESPACES === 'true' ||
         process.env.CODESPACE_NAME !== undefined;
}
```

### 2. Show Codespaces-Specific Welcome

```typescript
if (this.isCodespaces()) {
  this.log(chalk.cyan.bold('🚀 GitHub Codespaces detected!'));
  this.log('');
  this.log(chalk.yellow('⚠️  Sandbox Mode:'));
  this.log('   - Data persists only while Codespace is active');
  this.log('   - Stopped Codespaces retain data for 30 days');
  this.log('   - Rebuilt Codespaces lose all data');
  this.log('');
  this.log(chalk.dim('For production use, install Agor locally:'));
  this.log(chalk.dim('  https://github.com/agor-dev/agor#installation'));
  this.log('');
}
```

### 3. Offer API Key Setup Guidance

```typescript
// After database setup, prompt for API keys
const { setupKeys } = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'setupKeys',
    message: 'Configure API keys for AI agents? (Anthropic, OpenAI, Google)',
    default: true,
  },
]);

if (setupKeys) {
  this.log('');
  this.log(chalk.bold('API Key Setup:'));
  this.log('');
  this.log('You can set API keys in two ways:');
  this.log('');
  this.log(chalk.cyan('1. Environment variables (recommended for Codespaces):'));
  this.log('   export ANTHROPIC_API_KEY="sk-ant-..."');
  this.log('   export OPENAI_API_KEY="sk-..."');
  this.log('   export GOOGLE_AI_API_KEY="..."');
  this.log('');
  this.log(chalk.cyan('2. Codespaces Secrets (persistent):'));
  this.log('   GitHub → Settings → Codespaces → Secrets');
  this.log('   Add keys there and rebuild Codespace');
  this.log('');
}
```

### 4. Warn About Ephemeral Storage

```typescript
if (this.isCodespaces() && !flags.force) {
  this.log(chalk.yellow('💡 Tip: To preserve your work:'));
  this.log('   - Keep Codespace active (auto-stops after 30 min idle)');
  this.log('   - Export important sessions before stopping');
  this.log('   - Use git to commit session transcripts');
  this.log('');
}
```

### 5. Skip Prompts in `--force` Mode

Currently `agor init --force` skips all prompts. This is perfect for the startup script!

```bash
# In .devcontainer/start-services.sh
pnpm exec tsx bin/dev.ts init --force
```

---

## Implementation Checklist

### Phase 1: Basic Setup

- [ ] Create `.devcontainer/Dockerfile`
- [ ] Create `.devcontainer/devcontainer.json`
- [ ] Create `.devcontainer/start-services.sh`
- [ ] Add SandboxBanner component
- [ ] Set `VITE_CODESPACES=true` env var
- [ ] Test local Dev Container build

### Phase 1.5: Improve `agor init`

- [ ] Add `isCodespaces()` detection
- [ ] Show Codespaces-specific welcome message
- [ ] Add API key setup guidance (env vars + Codespaces Secrets)
- [ ] Warn about ephemeral storage
- [ ] Add tips for preserving work (export sessions, git commits)
- [ ] Test `agor init` in Codespaces
- [ ] Test `agor init --force` (non-interactive)

### Phase 2: Documentation

- [ ] Add Codespaces badge to README.md
- [ ] Write Quick Start section
- [ ] Add security warnings
- [ ] Document port visibility settings
- [ ] Create troubleshooting guide

### Phase 3: Testing

- [ ] Test cold start (new Codespace)
- [ ] Verify daemon + UI auto-start
- [ ] Test Docker-in-Docker (environment spin-up)
- [ ] Verify port forwarding (private → public toggle)
- [ ] Test multiplayer with public URL

### Phase 4: Polish

- [ ] Add in-app Codespaces status indicator
- [ ] Implement "Copy Public URL" button
- [ ] Add usage tracking (Codespaces hours)
- [ ] Create demo video for README

---

## Future Enhancements

### Prebuilt Codespaces

**Problem:** Cold start requires `pnpm install` + build (~60s)

**Solution:** Use Codespaces prebuild configuration

**In `.devcontainer/devcontainer.json`:**

```json
{
  "prebuild": {
    "commands": ["pnpm install", "pnpm -r build"]
  }
}
```

**Effect:** Reduces cold start to ~10 seconds

### Persistent Storage

**Problem:** Codespaces data is ephemeral (lost on rebuild)

**Solution:** Mount persistent volume for `~/.agor/`

**In `.devcontainer/devcontainer.json`:**

```json
{
  "mounts": ["source=agor-data,target=/home/node/.agor,type=volume"]
}
```

### Secrets Management

**Problem:** Users need API keys (Anthropic, OpenAI, Google, etc.) for AI agents

**Solution:** Use `agor init` interactive prompts + Codespaces secrets (optional)

**Recommended Flow (via `agor init`):**

The `agor init` command (run automatically on first boot) will:

1. Prompt for authentication setup (optional)
2. Guide users to add API keys to their environment
3. Store config in `~/.agor/config.yaml`

**Alternative: Codespaces Secrets (Optional)**

For users who want API keys pre-configured:

1. GitHub → Settings → Codespaces → Secrets
2. Add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`
3. Keys are automatically available as environment variables in the Codespace
4. AI agent tools (Claude Code, Gemini CLI, etc.) will pick them up

**Note:** Secrets are encrypted and never visible in logs or UI. Users can also set keys manually after init:

```bash
# Add to ~/.agor/config.yaml or set as environment variables
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
```

---

## References

- [GitHub Codespaces Docs](https://docs.github.com/en/codespaces)
- [Dev Containers Spec](https://containers.dev/)
- [Docker-in-Docker Feature](https://github.com/devcontainers/features/tree/main/src/docker-in-docker)
- [Port Forwarding](https://docs.github.com/en/codespaces/developing-in-codespaces/forwarding-ports-in-your-codespace)

---

## Summary: Recommended Approach

**Auto-run `agor init --force` on first boot:**

✅ **Pros:**

- Fast time-to-first-screen (services start immediately)
- No waiting for user input during boot
- User sees UI right away and can explore
- Can run `agor init` properly when ready

✅ **What happens:**

1. Codespace starts → builds dependencies (~90s total)
2. `.devcontainer/start-services.sh` runs `agor init --force`
   - Creates `~/.agor/` directory structure
   - Initializes database with default settings
   - **No prompts** (anonymous mode, no auth, no API keys)
3. Daemon + UI start in background
4. UI shows two banners:
   - **Sandbox warning:** "Early beta, ephemeral data"
   - **Setup reminder:** "Run `agor init` to configure API keys and auth"
5. User explores UI, then runs `agor init` when ready

✅ **Why this works:**

- Optimizes for exploration (user can try Agor immediately)
- Progressive setup (configure when needed, not blocking)
- Clear messaging (banners + terminal output guide next steps)
- Matches existing `agor init --force` behavior (already tested)

---

## Open Questions

1. **Billing:** Should we warn users about Codespaces costs? (Free tier = 60 hrs/month)
   - **Recommendation:** Add to README badge description
2. **Machine type:** Default is 2-core. Do we need 4-core for performance?
   - **Recommendation:** Start with 2-core, let users upgrade if needed
3. **Prebuilds:** Enable by default or opt-in? (Costs GitHub Actions minutes)
   - **Recommendation:** Enable prebuilds (worth the cost for good UX)
4. **Persistence:** Should we auto-backup sessions to GitHub Gist?
   - **Recommendation:** Phase 2 feature (not MVP)
