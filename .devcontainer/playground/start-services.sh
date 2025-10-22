#!/bin/bash
set -e

echo "🎮 Starting Agor Playground..."
echo ""
echo "⚡ Fast boot mode - Pre-built production binaries"
echo ""

# Ensure dependencies are installed (in case build didn't complete)
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd /workspaces/agor
  pnpm install
  echo "✅ Dependencies installed"
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

  echo ""
  echo "✅ Initialization complete!"
  echo ""
fi

# Start daemon in background (using built dist/)
cd /workspaces/agor/apps/agor-daemon
echo "🔧 Starting daemon on :3030..."
pnpm start > /tmp/agor-daemon.log 2>&1 &
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

# Start UI in background (using built dist/)
cd /workspaces/agor/apps/agor-ui
echo "🎨 Starting UI on :5173..."
pnpm preview > /tmp/agor-ui.log 2>&1 &
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
