# VS Code Marketplace Description Guidelines

This document outlines the strategy and guidelines for maintaining the **Stellar Suite** marketplace presence.

## 🌟 Value Proposition
The core value of Stellar Suite is **reducing developer friction** by integrating complex Stellar CLI workflows directly into the VS Code environment.

## 📝 Description Best Practices
- **BADGES**: Always include badges for version, license, and community status at the top.
- **EMOJIS**: Use emojis in headers to make sections visually distinct and less "text-heavy."
- **PUNCHY HEADERS**: Use action-oriented headers (e.g., "One-Click Build" instead of "Build system").
- **BENEFITS FIRST**: Always list *why* a feature matters before explaining *how* it works.

## 🔍 SEO Optimization (package.json)
- **Keywords**: Keep keywords relevant to the ecosystem (`stellar`, `soroban`, `blockchain`, `rust`).
- **Categories**: Ensure the extension is listed under `Programming Languages` and `Other` for maximum visibility.

## 📸 Screenshots
- Maintain a high-quality `screenshot.png` in the `assets/` directory.
- Use raw GitHub URLs in `README.md` to ensure images render correctly on the marketplace.

## 🔄 Update Process
1. **Changelog**: Always update `CHANGELOG.md` with new features, fixes, and breaking changes.
2. **Version Bump**: Increment the version in `package.json` following semantic versioning.
3. **Marketplace Sync**: The description in `README.md` is automatically used by the marketplace upon publishing via `vsce publish`.

---
*Created as part of Issue #198 implementation.*
