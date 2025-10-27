#!/bin/bash
set -e

echo "🎮 Starting Agor Playground..."
echo ""

# Check if this is first run
if [ ! -d ~/.agor ]; then
  echo "📦 First run - initializing Agor..."
  echo ""
  echo "⚠️  SANDBOX MODE: Temporary playground instance"
  echo "   - Data is ephemeral (lost on rebuild)"
  echo "   - Try Agor without setup!"
  echo ""

  # Run agor init with --force (anonymous mode, no prompts)
  agor init --force

  # Create default admin user
  echo "👤 Creating admin user..."
  agor user create-admin

  echo ""
  echo "✅ Initialization complete!"
  echo ""
  echo "📝 Login credentials:"
  echo "   Email:    admin@agor.live"
  echo "   Password: admin"
  echo ""
fi

# Start daemon in background
echo "🔧 Starting daemon on :3030..."
agor daemon start
