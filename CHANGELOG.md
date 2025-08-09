# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-08-08

### Added
- Initial release of CNS MCP Server
- Autonomous multi-agent orchestration system for Claude Code
- Free local semantic memory with Transformers.js embeddings
- Git worktree-based workspace isolation for parallel agents
- MCP tools for hook handling, memory operations, and orchestration
- Slash commands (`/cns:status`, `/cns:health`, `/cns:search`, etc.)
- Event-driven workflow management with automatic agent handoffs
- SQLite database for metadata and workflow tracking
- LanceDB vector storage for semantic search
- Health monitoring and system status reporting
- Automatic workspace cleanup with 5-minute scheduling
- CLI tools for initialization and validation (`cns-server`)
- Comprehensive test suite with 51 tests
- GitHub Actions CI/CD pipeline
- NPM package distribution

### Features
- **Free Embeddings**: No API keys required - uses Transformers.js locally
- **Workspace Isolation**: Each agent gets isolated Git worktree
- **Semantic Memory**: Hybrid search combining semantic and text matching
- **Auto-Orchestration**: Detects completion markers and launches agents
- **Hook Integration**: Works with Claude Code hooks for seamless automation
- **Zero Configuration**: Works out of the box with sensible defaults

### Technical Details
- ES modules with TypeScript
- Node.js 18+ support
- Cross-platform compatibility (Windows, macOS, Linux)
- Comprehensive error handling and logging
- Production-ready with health checks and monitoring

[1.0.0]: https://github.com/ari1110/cns-mcp-server/releases/tag/v1.0.0