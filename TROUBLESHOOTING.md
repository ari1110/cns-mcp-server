# Troubleshooting Guide

## Common Issues and Solutions

### Installation Issues

#### Error: `npm install -g cns-mcp-server` fails with permission errors

**Solution**: Use npm with proper permissions:
```bash
# Option 1: Use sudo (Linux/macOS)
sudo npm install -g cns-mcp-server

# Option 2: Configure npm to use a different directory
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
npm install -g cns-mcp-server
```

#### Error: `cns-server: command not found`

**Solution**: Ensure npm bin directory is in PATH:
```bash
# Find npm bin directory
npm bin -g

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH=$(npm bin -g):$PATH
```

### Configuration Issues

#### Error: "MCP server 'cns' not found in Claude Code"

**Solution**: Verify configuration in Claude Code settings:
1. Open Claude Code settings
2. Check that the MCP server configuration matches:
```json
{
  "mcpServers": {
    "cns": {
      "command": "npx",
      "args": ["-y", "cns-mcp-server"]
    }
  }
}
```
3. Restart Claude Code

Note: The `npx -y` command ensures the package is available and automatically confirms if it needs to be downloaded.

#### Error: "Database initialization failed"

**Solution**: Check database permissions:
```bash
# Check if .cns directory exists and has permissions
ls -la ~/.cns/data/

# Fix permissions if needed
chmod 755 ~/.cns
chmod 755 ~/.cns/data
```

### Runtime Issues

#### Slash commands not appearing in Claude Code

**Possible causes and solutions**:

1. **MCP server not running**: Check server status
   ```bash
   ps aux | grep cns-mcp-server
   ```

2. **Server startup failed**: Check logs
   ```bash
   cat ~/.cns/logs/cns.log
   ```

3. **Claude Code needs restart**: Fully quit and restart Claude Code

#### Error: "Memory search returns no results"

**Solutions**:
1. **First run**: The embedding model loads on first use (may take 30 seconds)
2. **No memories stored**: Store some memories first
3. **Model download failed**: Check internet connection and retry

#### Error: "Workspace creation failed"

**Common causes**:
1. **Not in a git repository**: CNS requires a git repo for workspaces
2. **Insufficient permissions**: Check directory permissions
3. **Disk space**: Ensure adequate disk space for worktrees

### Performance Issues

#### Slow memory searches

**Solutions**:
1. **First search is slow**: Model loading is one-time, subsequent searches are fast
2. **Large memory database**: Consider pruning old memories
3. **CPU limitations**: Transformers.js uses CPU for embeddings

#### High memory usage

**Solutions**:
1. **Model in memory**: Normal for embedding model (~50MB)
2. **Memory leak**: Restart the MCP server
3. **Large workflows**: Clean up completed workflows

### Database Issues

#### Error: "Database locked"

**Solution**: Stop duplicate instances:
```bash
# Find CNS processes
ps aux | grep cns-mcp-server

# Kill duplicate processes
kill <PID>
```

#### Error: "Cannot open database"

**Solution**: Check file permissions and corruption:
```bash
# Backup existing database
cp ~/.cns/data/cns.db ~/.cns/data/cns.db.backup

# Check database integrity
sqlite3 ~/.cns/data/cns.db "PRAGMA integrity_check;"
```

### Hook Issues

#### Hooks not triggering

**Solutions**:
1. **Check hook files exist**:
   ```bash
   ls -la ~/.claude/hooks/
   ```

2. **Verify executable permissions**:
   ```bash
   chmod +x ~/.claude/hooks/*.sh
   ```

3. **Test hook manually**:
   ```bash
   ~/.claude/hooks/session_start.sh test-session
   ```

### Debugging

#### Enable debug logging

Set environment variable in Claude Code MCP configuration:
```json
{
  "mcpServers": {
    "cns": {
      "command": "npx",
      "args": ["-y", "cns-mcp-server"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

Then check logs:
```bash
tail -f ~/.cns/logs/cns.log
```

#### Check system health

Use the health command:
```
/cns:health
```

This shows:
- Database status
- Memory system status
- Orchestration engine health
- Workspace availability

#### View active processes

Check what CNS is doing:
```
/cns:status
/cns:workflows
```

### Getting Help

If these solutions don't resolve your issue:

1. **Check logs**: `~/.cns/logs/cns.log`
2. **Run validation**: `cns-server validate --verbose`
3. **Report issue**: [GitHub Issues](https://github.com/ari1110/cns-mcp-server/issues)

Include in your report:
- Error messages
- Log output
- Steps to reproduce
- System info (OS, Node version)

### Clean Reinstall

If all else fails, try a clean reinstall:

```bash
# 1. Uninstall
npm uninstall -g cns-mcp-server

# 2. Clean cache
npm cache clean --force

# 3. Remove data (optional - backs up first)
mv ~/.cns ~/.cns.backup

# 4. Reinstall
npm install -g cns-mcp-server

# 5. Initialize
cns-server init

# 6. Copy the configuration output to Claude Code settings

# 7. Restart Claude Code
```

### Verifying Installation

After installation, verify everything is working:

```bash
# Check installation
which cns-server
which cns-mcp-server

# Test initialization
cns-server validate

# Test MCP server (should stay running)
npx cns-mcp-server
# Press Ctrl+C to stop
```

### Common Configuration Mistakes

#### Wrong command in MCP configuration

❌ **Incorrect**:
```json
{
  "mcpServers": {
    "cns": {
      "command": "cns-server",
      "args": ["start"]
    }
  }
}
```

✅ **Correct**:
```json
{
  "mcpServers": {
    "cns": {
      "command": "npx",
      "args": ["-y", "cns-mcp-server"]
    }
  }
}
```

The `cns-server` command is for CLI operations (init, validate), while `cns-mcp-server` is the actual MCP server that Claude Code connects to.