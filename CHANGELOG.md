# Changelog

All notable changes to the Claude Code Workspace Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive JSDoc documentation for all public APIs and key internal functions
- Parallel repository processing for significantly improved performance
- Enhanced security measures with path validation and command injection prevention
- Extensive test coverage for all core modules (116 tests total)
- CLI help and version flags (`--help`, `--version`)
- Comprehensive integration tests covering end-to-end workflows
- Support for multiple package managers (npm, yarn, pnpm) with proper command generation
- Fallback handling for missing dependencies and optional features
- Repository alias validation with format checking and uniqueness enforcement
- Branch name validation and current branch detection
- Graceful error handling with contextual user guidance
- Environment variable support (`CLAUDE_CLI_ARGS`)
- Optional dependency handling for `@agent-io/stream`

### Changed
- **BREAKING**: Repository processing now runs in parallel instead of sequential
- Improved UI messaging with clearer progress indicators and status updates
- Enhanced error messages with specific guidance and troubleshooting tips
- Updated dependencies to latest versions (concurrently v9.0.0)
- Refactored command injection vulnerabilities with secure implementations
- Improved package.json script generation with proper concurrently usage

### Fixed
- **SECURITY**: Fixed command injection vulnerabilities in git operations and file operations
- **SECURITY**: Added path traversal attack prevention
- **SECURITY**: Replaced shell command execution with secure Node.js API calls
- Fixed ESM import issues with fs-extra and other dependencies
- Fixed TypeScript strict mode compliance issues
- Fixed test coverage gaps and flaky test behaviors
- Fixed handling of non-Error objects in error handlers
- Fixed UI method call expectations in test environment
- Fixed package manager detection and command generation
- Fixed workspace cleanup logic for partial failures
- Fixed concurrent file operations and race conditions
- Fixed environment file copying with proper validation

### Security
- Implemented comprehensive input validation and sanitization
- Added protection against directory traversal attacks
- Replaced dangerous shell command patterns with safe Node.js APIs
- Enhanced error handling to prevent information disclosure
- Added file system permission checking and validation

## [1.0.0] - 2024-XX-XX

### Added
- Initial release of Claude Code Workspace Manager
- Interactive repository selection and configuration
- Git worktree-based workspace creation
- Automatic dependency priming via hardlinks or rsync
- Environment file copying for configuration consistency
- Package manager detection and script generation
- CLAUDE.md generation via Claude CLI integration
- Comprehensive workspace orchestration with unified package.json
- Cross-platform support (macOS focus with extensible architecture)

### Requirements
- macOS (uses cp -al, rsync)
- Git 2.20+ (worktree support)
- Node.js 18+ (ES modules)
- Claude CLI installed and configured

---

## Developer Notes

### Architecture Decisions
- **ES Modules**: Full ES module support for modern Node.js compatibility
- **TypeScript Strict Mode**: Enhanced type safety and development experience  
- **Modular Design**: Clear separation of concerns across functional modules
- **Security First**: Input validation and secure-by-default implementations
- **Performance Optimized**: Parallel processing and efficient file operations
- **Graceful Degradation**: Fallbacks for missing dependencies and failures

### Test Coverage
- **Unit Tests**: Comprehensive coverage of individual module functionality
- **Integration Tests**: End-to-end workflow validation and error scenarios
- **Security Tests**: Validation of security measures and attack prevention
- **Performance Tests**: Parallel processing and file operation efficiency

### Breaking Changes Policy
This project follows semantic versioning. Breaking changes will increment the major version number and be clearly documented in this changelog with migration guidance.