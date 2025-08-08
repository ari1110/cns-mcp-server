# CNS MCP Server: Production Configuration Guide

## ⚠️ Critical: What Tests Mock vs Production Reality

### **MOCKED IN TESTS → REAL REQUIREMENTS IN PRODUCTION**

## 1. Embedding Provider Configuration ✅ **RESOLVED**

### Test Environment (Mocked)
```bash
# Tests use MockEmbeddingProvider - no real API calls
EMBEDDING_PROVIDER=mock  # or undefined (defaults to 'transformers')
```

### Production Requirements (FREE!)
```bash
# Default: Free local embeddings (RECOMMENDED)
EMBEDDING_PROVIDER=transformers  # FREE, default
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2  # FREE, 384 dimensions
EMBEDDING_DIMENSION=384  # FREE, no API limits

# Alternative: OpenAI (OPTIONAL, PAID)
# EMBEDDING_PROVIDER=openai
# OPENAI_API_KEY=sk-proj-...  # YOUR REAL OPENAI API KEY (if you want OpenAI)
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSION=1536
```

**Production Benefits (Transformers.js):**
- **💰 Cost**: $0.00 (completely free)
- **🚦 Rate Limits**: None (runs locally)
- **🌐 Network**: Works offline after model download
- **⏱️ Latency**: ~50ms after warmup (faster than OpenAI)
- **🛡️ Error Handling**: No API failures possible
- **📦 Setup**: Zero configuration needed

## 2. LanceDB Vector Storage 🟡 **IMPORTANT**

### Test Environment (Temporary)
```
- Creates temporary vector databases in /tmp
- Data deleted after each test
- No persistence required
```

### Production Requirements
```bash
# Directory structure
/your/app/directory/
├── data/
│   └── lancedb/        # Persistent vector storage
├── cns.db             # Main SQLite database
└── cns.log           # Application logs
```

**Production Considerations:**
- **💾 Storage**: Vector databases can be large (GB+)
- **🔄 Persistence**: Data survives restarts
- **📊 Backup**: Include vector data in backup strategy
- **⚡ Performance**: SSD recommended for vector operations

## 3. Git Worktree Management 🟡 **IMPORTANT**

### Test Environment (Controlled)
```
- Creates temporary git repos in /tmp
- Uses predictable branch names
- Automatic cleanup
```

### Production Requirements
```bash
# Must be run from within a git repository
cd /path/to/your/git/repo
node /path/to/cns-mcp-server/dist/index.js

# Required git configuration
git config user.name "CNS System"
git config user.email "cns@yourcompany.com"
```

**Production Considerations:**
- **📁 Repository**: Must be run from actual git repository
- **🌿 Branches**: Real branch conflicts possible
- **🔒 Permissions**: Git worktree creation permissions needed
- **💽 Disk Space**: Each worktree copies entire working directory
- **🧹 Cleanup**: Failed workspaces may need manual cleanup

## 4. Complete Production Environment Setup

### Required Environment Variables
```bash
# Core Configuration
DATABASE_PATH=./cns.db
WORKSPACES_DIR=./workspaces
LOG_LEVEL=info
LOG_FILE=./cns.log

# Embedding Provider (CRITICAL)
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-actual-api-key-here
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# Optional Redis (for distributed setups)
REDIS_URL=redis://localhost:6379

# Orchestration Settings
MAX_WORKFLOWS=10
CLEANUP_INTERVAL_MINUTES=5
```

### Directory Structure
```
production-deployment/
├── .env                    # Environment variables
├── cns.db                 # SQLite database (auto-created)
├── cns.log               # Application logs (auto-created)
├── data/
│   └── lancedb/          # Vector database (auto-created)
├── workspaces/           # Git worktrees (auto-created)
└── dist/                 # Compiled application
    └── index.js
```

## 5. Production Deployment Checklist

### Pre-Deployment ✅
- [ ] **OpenAI API Key**: Valid API key with sufficient credits
- [ ] **Git Repository**: Deploy within a proper git repository
- [ ] **Disk Space**: At least 10GB free for databases/worktrees
- [ ] **Node.js**: v18+ installed
- [ ] **Git**: Git CLI available and configured
- [ ] **Permissions**: Write access to deployment directory

### Post-Deployment Testing 🧪
```bash
# Test embedding generation
curl -X POST http://localhost:3000/mcp/store_memory \
  -d '{"content":"Test embedding generation","type":"test"}'

# Check if vector search works
curl -X POST http://localhost:3000/mcp/retrieve_memory \
  -d '{"query":"test","search_mode":"semantic"}'

# Verify worktree creation
curl -X POST http://localhost:3000/mcp/create_workspace \
  -d '{"agent_id":"test-agent","base_ref":"main"}'
```

### Monitoring & Alerts 📊
- **Database Size**: Monitor `cns.db` and `data/lancedb/` growth
- **OpenAI Usage**: Track API usage and costs
- **Disk Space**: Monitor workspace directory growth
- **Error Rates**: Watch for embedding API failures
- **Memory Usage**: Vector operations can be memory-intensive

## 6. Common Production Issues & Solutions

### Issue: "No embedding provider configured"
**Cause**: Missing `OPENAI_API_KEY` environment variable
**Solution**: Set valid OpenAI API key in environment

### Issue: "Failed to initialize LanceDB" 
**Cause**: Insufficient disk space or permissions
**Solution**: Ensure 10GB+ free space and write permissions

### Issue: "Git worktree creation failed"
**Cause**: Not running from git repository or branch conflicts  
**Solution**: Deploy in git repo, ensure unique branch names

### Issue: High OpenAI costs ✅ **RESOLVED**
**OLD Cause**: Large content being embedded frequently  
**NEW Solution**: Use Transformers.js (completely free)

## 7. Development vs Production Feature Matrix (UPDATED)

| Feature | Tests/Development | Production |
|---------|-------------------|------------|
| **Embeddings** | Mock (free, instant) | Transformers.js (free, local) |
| **Vector Storage** | Temporary files | Persistent LanceDB |
| **Git Operations** | Temporary repos | Real repository |
| **Database** | Temporary SQLite | Persistent SQLite |
| **Cleanup** | Automatic | Manual monitoring needed |
| **Error Handling** | Simplified | Full production errors |
| **Performance** | Optimized for speed | Real-world constraints |

## 🚨 CRITICAL GOTCHAS (UPDATED)

✅ ~~**Silent Degradation**: Without OpenAI API key, system falls back to text-only search~~ - **FIXED**: Transformers.js works out of the box  
✅ ~~**Cost Surprise**: OpenAI embedding costs can add up quickly~~ - **FIXED**: Transformers.js is completely free  
3. **Disk Space**: Vector databases and git worktrees consume significant space
4. **Git Repository**: Must be deployed within a git repository for workspace features
✅ ~~**Rate Limits**: OpenAI API has strict rate limits that can cause failures~~ - **FIXED**: No rate limits with local Transformers.js