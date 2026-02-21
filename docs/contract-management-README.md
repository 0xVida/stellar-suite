# Contract Management Documentation - README

## Overview

This directory contains comprehensive documentation for Stellar Suite's contract management features. The documentation is organized into focused guides covering different aspects of contract management.

## Documentation Structure

### Core Documentation

1. **[Contract Management](./contract-management.md)** - Main guide covering all contract management features
   - Contract detection and discovery
   - Version tracking overview
   - Metadata extraction basics
   - Workspace organization
   - Search and filtering
   - Best practices
   - Troubleshooting

### Specialized Guides

2. **[Contract Version Tracking](./contract-version-tracking.md)** - Detailed version management guide
   - Local and deployed version tracking
   - Version history management
   - Mismatch detection
   - Version comparison
   - API reference
   - Advanced workflows

3. **[Contract Metadata Extraction](./contract-metadata-extraction.md)** - Metadata system guide
   - Metadata structure
   - Workspace scanning
   - Querying metadata
   - Dependency information
   - Caching strategy
   - File watching
   - Performance optimization

4. **[Workspace Organization](./workspace-organization.md)** - Organization features guide
   - Contract groups
   - Hierarchical organization
   - Group management operations
   - Persistence
   - Organization patterns
   - Best practices

5. **[Contract Management Examples](./contract-management-examples.md)** - Practical examples
   - Basic workflows
   - Advanced scenarios
   - Integration examples
   - Automation examples
   - Real-world use cases

## Quick Start

### For Users

1. Start with [Contract Management](./contract-management.md) for an overview
2. Read specific sections based on your needs:
   - Version tracking → [Contract Version Tracking](./contract-version-tracking.md)
   - Organizing contracts → [Workspace Organization](./workspace-organization.md)
   - Understanding metadata → [Contract Metadata Extraction](./contract-metadata-extraction.md)
3. Check [Examples](./contract-management-examples.md) for code samples

### For Developers

1. Review [Contract Metadata Extraction](./contract-metadata-extraction.md) for the metadata system
2. Study [Contract Version Tracking](./contract-version-tracking.md) for version APIs
3. Examine [Examples](./contract-management-examples.md) for integration patterns
4. Reference API documentation in each guide

## Key Features Documented

### Contract Detection
- Automatic workspace scanning
- Cargo.toml parsing
- Contract identification
- Metadata extraction

### Version Tracking
- Local version reading
- Deployed version recording
- Version history
- Mismatch detection
- Semantic version comparison

### Metadata Extraction
- Package information
- Dependency parsing
- Workspace detection
- Caching system
- File watching

### Workspace Organization
- Contract grouping
- Hierarchical structures
- Group operations
- Persistence
- Statistics

### Search & Filtering
- Find by name
- Find by dependency
- Filter by criteria
- Dependency graph queries

## Documentation Conventions

### Code Examples

All code examples use TypeScript and follow these conventions:

```typescript
// Import statements at top
import { Service } from './services/service';

// Type definitions where relevant
interface Example {
  property: string;
}

// Practical, runnable examples
async function example() {
  const service = new Service();
  const result = await service.method();
  return result;
}
```

### API References

API documentation follows this structure:

```typescript
/**
 * Method description
 * 
 * @param paramName - Parameter description
 * @returns Return value description
 */
methodName(paramName: Type): ReturnType
```

### File Paths

- Use absolute paths: `/Users/mac/Documents/project/Cargo.toml`
- Or workspace-relative: `contracts/my-contract/Cargo.toml`

### Commands

Command Palette commands are shown as:
- **Command Name** (with bold formatting)

Terminal commands are shown as:
```bash
command --flag value
```

## Related Documentation

### In This Repository
- [Dependency Detection](./dependency-detection.md) - Dependency graph building
- [Deployment Workflows](./deployment-workflow-integration-testing.md) - Deployment integration
- [Status Badges](./status-badges.md) - Status indicators

### External Resources
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Cargo Documentation](https://doc.rust-lang.org/cargo/)
- [Stellar Documentation](https://developers.stellar.org/)

## Troubleshooting

### Common Issues

**Contract not detected:**
- Verify Cargo.toml exists and is valid
- Check workspace folders include contract directory
- Run manual refresh command

**Version mismatch warnings:**
- Review version history
- Verify workspace is up to date
- Check deployment records

**Metadata not updating:**
- Ensure file is saved
- Check file watcher is active
- Manually invalidate cache if needed

**Groups not persisting:**
- Verify workspace state is writable
- Check for errors in output channel
- Force save groups manually

### Getting Help

1. Check relevant documentation section
2. Review troubleshooting sections in each guide
3. Check VS Code output channel: View → Output → "Stellar Suite"
4. File issue on GitHub repository

## Contributing

When contributing to documentation:

1. **Maintain Consistency**: Follow existing formatting and structure
2. **Add Examples**: Include practical code examples
3. **Update Cross-References**: Link related sections
4. **Test Code**: Verify all code examples work
5. **Update TOC**: Keep table of contents current

### Documentation Standards

- Use clear, concise language
- Include code examples for all features
- Add troubleshooting tips
- Cross-reference related topics
- Keep examples practical and runnable

## Version History

### Version 1.0.0 (February 21, 2026)
- Initial comprehensive documentation release
- All core features documented
- Examples and best practices included
- Troubleshooting guides added

## Feedback

We welcome feedback on documentation:
- Unclear sections
- Missing examples
- Inaccurate information
- Suggested improvements

File issues or submit pull requests on GitHub.

---

**Last Updated:** February 21, 2026  
**Maintainer:** Stellar Suite Team
