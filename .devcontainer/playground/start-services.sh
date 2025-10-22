#!/bin/bash
set -e

echo "🎮 Starting Agor Playground..."
echo ""
echo "⚡ Dev mode - Running with tsx and Vite"
echo ""

# Ensure dependencies are installed (in case build didn't complete)
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd /workspaces/agor
  pnpm install
  echo "✅ Dependencies installed"
  echo ""
fi

# Verify core package is built (check for actual build artifacts)
if [ ! -f "/workspaces/agor/packages/core/dist/index.js" ]; then
  echo "⚠️  Core package not built - building now..."
  cd /workspaces/agor/packages/core
  pnpm build

  # Verify build succeeded
  if [ ! -f "dist/index.js" ]; then
    echo "❌ Core package build failed!"
    echo "   Check: cd /workspaces/agor/packages/core && pnpm build"
    exit 1
  fi

  echo "✅ Core package built"
  echo ""
else
  echo "✅ Core package already built"
  echo ""
fi

# Check if this is first run
if [ ! -d ~/.agor ]; then
  echo "📦 First run - initializing Agor..."
  echo ""
  echo "⚠️  SANDBOX MODE: Temporary playground instance"
  echo "   - Data is ephemeral (lost on rebuild)"
  echo "   - Read-only experience (source code pre-built)"
  echo "   - For development, use the 'dev' container instead"
  echo ""

  # Run agor init with --force (anonymous mode, no prompts)
  cd /workspaces/agor/apps/agor-cli
  pnpm exec tsx bin/dev.ts init --force

  # Create default admin user for playground
  echo "👤 Creating admin user..."
  pnpm exec tsx bin/dev.ts user create-admin

  echo ""
  echo "✅ Initialization complete!"
  echo ""
  echo "📝 Login credentials:"
  echo "   Email:    admin@agor.live"
  echo "   Password: admin"
  echo ""
fi

# Start daemon in background using tsx (simpler, avoids ESM module resolution issues)
cd /workspaces/agor/apps/agor-daemon
echo "🔧 Starting daemon on :3030 (tsx)..."
nohup pnpm exec tsx src/index.ts > /tmp/agor-daemon.log 2>&1 &
DAEMON_PID=$!

# Wait for daemon to be ready
echo -n "   Waiting for daemon"
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

# Start UI in background (dev mode - simpler, no build needed)
cd /workspaces/agor/apps/agor-ui
echo "🎨 Starting UI on :5173..."

# Detect Codespaces and set daemon URL accordingly
if [ -n "$CODESPACE_NAME" ]; then
  # In Codespaces, use the forwarded daemon URL
  DAEMON_URL="https://${CODESPACE_NAME}-3030.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  echo "   Codespaces detected - daemon URL: $DAEMON_URL"
  export VITE_DAEMON_URL="$DAEMON_URL"
fi

nohup pnpm dev > /tmp/agor-ui.log 2>&1 &
UI_PID=$!

# Wait for UI to be ready
echo -n "   Waiting for UI"
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
echo "🎉 Agor Playground is running!"
echo ""
echo "   Daemon: http://localhost:3030"
echo "   UI: http://localhost:5173"
echo ""
echo "   (Codespaces auto-forwards these ports)"
echo ""
echo "📝 Logs:"
echo "   tail -f /tmp/agor-daemon.log"
echo "   tail -f /tmp/agor-ui.log"
echo ""
echo "🎮 PLAYGROUND MODE"
echo "   - Try Agor without setup"
echo "   - Create sessions, orchestrate AI agents"
echo "   - Source code is read-only (for dev, use 'dev' container)"
echo ""
echo "💡 Services are running in the background and will persist until Codespace stops."
echo ""
