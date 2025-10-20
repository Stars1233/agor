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
  echo "   - See https://github.com/mistercrunch/agor for local installation"
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
