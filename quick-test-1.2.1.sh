#!/bin/bash
# Quick test script for v1.2.1

echo "🧪 Testing CNS MCP Server v1.2.1 Invisible Integration"
echo "======================================================"
echo ""

# Check package version
echo "📦 Checking NPM package..."
VERSION=$(npm view cns-mcp-server@latest version)
echo "Latest version: $VERSION"

if [ "$VERSION" != "1.2.1" ]; then
  echo "⚠️  Warning: Latest is not 1.2.1, installing specific version..."
  npm install -g cns-mcp-server@1.2.1
fi

# Test the server binary
echo ""
echo "🔧 Testing cns-server binary..."
npx cns-server@1.2.1 --version 2>/dev/null || npx -p cns-mcp-server@1.2.1 cns-server --version

# Start MCP server and check for agent runner
echo ""
echo "🚀 Starting MCP server (5 second test)..."
echo "Looking for agent runner integration..."
echo ""

timeout 5s npx cns-mcp-server@1.2.1 2>&1 | while IFS= read -r line; do
  # Check for agent runner messages
  if echo "$line" | grep -qE "(agent|Agent|runner|Runner|🤖|integrated)"; then
    echo "✅ FOUND: $line"
  elif echo "$line" | grep -qE "(🚀|Starting CNS|MCP Server)"; then
    echo "📝 Server: $line"
  fi
done

echo ""
echo "======================================================"
echo "🎯 TEST COMPLETE"
echo ""
echo "If you saw messages about:"
echo "  - 'Starting integrated agent runner'"
echo "  - 'Agent runner started successfully'"
echo "  - '🤖 Starting integrated agent runner'"
echo ""
echo "Then the invisible integration is working! ✅"
echo ""
echo "To fully test with Claude Code:"
echo "1. Add to Claude Code settings.json:"
echo '   "cns": { "command": "npx", "args": ["-y", "cns-mcp-server@1.2.1"] }'
echo "2. Restart Claude Code"
echo "3. Use cns:get_system_status to see agent_runner health check"