# Specification Validation Report

**Document**: `specs/feat-ccws-cli-workspace-generator.md`  
**Date**: August 26, 2025  
**Status**: **NOT READY** - Requires significant scope reduction

## Summary

The specification is technically complete but severely overengineered. While it contains sufficient detail for implementation, approximately 60% of the proposed features should be cut to focus on the core problem: quickly creating multi-repo workspaces for Claude Code.

## Critical Gaps

None - all essential sections are present and detailed.

## Overengineering Analysis

### 🔴 FEATURES TO CUT ENTIRELY

#### Phase 2 - Remove All (7 features)
These add complexity without solving the core problem:

1. **Smart branch suggestions** - Users know which branch they want
2. **Dependency conflict detection** - Not the tool's job
3. **Port conflict detection** - Rare, let users handle it
4. **Progress indicators with time estimates** - Over-optimization
5. **Workspace templates** - Premature abstraction
6. **Cleanup command** - Separate concern, use `rm -rf`
7. **Config file support** - YAGNI, filesystem discovery works

#### Phase 3 - Remove All (7 features)
These are "someday maybe" features that add no immediate value:

1. **Cross-platform support** - Massive complexity for unknown demand
2. **Advanced caching** - Current approach is fast enough
3. **Incremental updates** - Workspaces are disposable by design
4. **VS Code integration** - Separate project entirely
5. **Workspace sharing** - YAGNI
6. **Performance profiling** - Premature optimization
7. **80% test coverage** - Excessive for internal CLI tool

### 🟡 CURRENT SCOPE SIMPLIFICATIONS

1. **Remove @agent-io/stream dependency**
   - Current: Optional dependency with fallback logic
   - Simplify: Just pipe stdout, no special handling needed

2. **Simplify factpack generation**
   - Current: Complex ripgrep patterns for ports/env vars
   - Simplify: Just extract package.json scripts and name

3. **Remove `fd` dependency**
   - Current: Uses `fd` with `find` fallback
   - Simplify: Just use `find`, it's universal

4. **Reduce performance targets**
   - Current: Specific benchmarks (<2s, <5s, etc.)
   - Simplify: Just "completes quickly"

5. **Simplify testing strategy**
   - Current: Extensive unit/integration/E2E examples
   - Simplify: Focus on core git worktree and command generation

## Essential MVP Scope

The absolute minimum needed to solve the core problem:

### Core Features Only
1. **Repository selection** - Interactive prompts to choose repos
2. **Git worktrees** - Mount branches without full clones
3. **Basic priming** - Copy node_modules and .env files
4. **Unified commands** - Root package.json with npm scripts
5. **Simple CLAUDE.md** - Basic template with repo info

### Implementation (5 files, not 7)
```
src/
  index.ts     # Main flow
  git.ts       # Worktree operations
  pm.ts        # Package manager detection
  fsops.ts     # Copy operations
  types.ts     # Type definitions
```

Remove:
- `claude.ts` - Merge into index.ts (20 lines max)
- `pkggen.ts` - Merge into index.ts (15 lines)

### Simplified Claude Integration
```typescript
// Just write a simple template, no CLI invocation
const claudeMd = `
# Workspace: ${wsName}
## Repos
${repos.map(r => `- ${r.alias}: ${r.branch}`).join('\n')}
## Commands
Run from root: npm run <alias>:dev
`;
fs.writeFileSync('CLAUDE.md', claudeMd);
```

## Risk Areas

1. **Claude CLI variability** - Spec assumes specific CLI behavior
   - Mitigation: Don't invoke Claude CLI, just write template

2. **macOS-only commands** - Limits adoption
   - Accept for MVP, clearly document

3. **Worktree edge cases** - Dirty working directories
   - Add clear error messages

## Recommendations

### Immediate Actions

1. **Rewrite spec focusing on Phase 1 only**
   - Remove Phases 2 and 3 entirely
   - Cut Phase 1 to essential features

2. **Simplify architecture**
   - Merge 7 modules into 5
   - Remove streaming, factpacks, complex discovery

3. **Reduce testing scope**
   - Focus on worktree creation and command generation
   - Remove performance tests

4. **Update goals**
   - Remove specific performance targets
   - Focus on "working" over "optimized"

### Simplified Success Criteria

Instead of the current complex requirements, success means:
- Can create a workspace with 2+ repos
- Can run npm commands from root
- Has basic CLAUDE.md file
- Works on macOS

That's it. Everything else is unnecessary complexity.

## Conclusion

The specification demonstrates thorough thinking but falls into the classic trap of trying to solve every possible problem instead of focusing on the core user need. By cutting 60% of features and simplifying the remaining implementation, this tool could be built in 200 lines of code instead of 1000+, ship faster, and still solve the real problem effectively.

**Recommendation**: Aggressively cut scope to MVP essentials before implementation.