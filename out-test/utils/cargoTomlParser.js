"use strict";
// ============================================================
// src/utils/cargoTomlParser.ts
// Lightweight parser for extracting contract metadata from
// Cargo.toml files. Supports single-package and workspace
// Cargo.toml structures without any external TOML library
// dependency — keeping the file importable in plain Node.js
// for unit-testing purposes.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCargoToml = parseCargoToml;
exports.extractContractDependencies = extractContractDependencies;
exports.getContractName = getContractName;
exports.parseTomlStringArray = parseTomlStringArray;
// ── Public API ────────────────────────────────────────────────
/**
 * Parse the raw text content of a Cargo.toml file and return a
 * `ParsedCargoToml` object.  The `filePath` is stored as-is for
 * caller convenience; this function itself never reads the file-system.
 *
 * Gracefully handles:
 * - Missing or empty content (returns empty result with a warning)
 * - Malformed key–value lines (skipped with a warning)
 * - Unknown sections (silently ignored)
 * - Both `"double-quote"` and `'single-quote'` string literals
 * - Inline `{ key = value }` tables for dependency specifications
 * - Array values for `authors`, `features`, `members`, etc.
 *
 * @param content  Raw UTF-8 string content of the Cargo.toml
 * @param filePath Absolute path used to populate `ParsedCargoToml.filePath`
 */
function parseCargoToml(content, filePath) {
    const result = {
        filePath,
        dependencies: {},
        devDependencies: {},
        buildDependencies: {},
        isWorkspaceRoot: false,
        parseWarnings: [],
    };
    if (!content || !content.trim()) {
        result.parseWarnings.push('Cargo.toml content is empty or whitespace-only.');
        return result;
    }
    const lines = content.split(/\r?\n/);
    let currentSection = 'other';
    // Accumulate raw fields while in a section so we can run post-processing.
    const rawPackage = {};
    const rawWsPackage = {};
    // Workspace-level arrays
    let wsMembers = [];
    let wsDefaultMembers = [];
    let wsExclude = [];
    const wsDependencies = {};
    // Dependency buckets
    const deps = {};
    const devDeps = {};
    const buildDeps = {};
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.replace(/#.*$/, '').trim(); // strip inline comments
        if (!line) {
            continue;
        }
        // ── Section header ────────────────────────────────────
        const sectionMatch = /^\[([^\]]+)\]/.exec(line);
        if (sectionMatch) {
            currentSection = normaliseSectionName(sectionMatch[1].trim());
            continue;
        }
        // ── Key–value pair ────────────────────────────────────
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) {
            continue;
        } // not a key=value line
        const key = line.slice(0, eqIdx).trim();
        const valuePart = line.slice(eqIdx + 1).trim();
        if (!key) {
            continue;
        }
        switch (currentSection) {
            case 'package':
                rawPackage[key] = valuePart;
                break;
            case 'workspace.package':
                rawWsPackage[key] = valuePart;
                break;
            case 'workspace': {
                if (key === 'members') {
                    wsMembers = parseTomlStringArray(valuePart);
                }
                else if (key === 'default-members' || key === 'default_members') {
                    wsDefaultMembers = parseTomlStringArray(valuePart);
                }
                else if (key === 'exclude') {
                    wsExclude = parseTomlStringArray(valuePart);
                }
                break;
            }
            case 'workspace.dependencies':
                wsDependencies[key] = parseDependencyValue(key, valuePart);
                break;
            case 'dependencies':
                deps[key] = parseDependencyValue(key, valuePart);
                break;
            case 'dev-dependencies':
                devDeps[key] = parseDependencyValue(key, valuePart);
                break;
            case 'build-dependencies':
                buildDeps[key] = parseDependencyValue(key, valuePart);
                break;
            default:
                // Other sections (e.g. [lib], [profile.*], [features]) are ignored.
                break;
        }
    }
    // ── Assemble the [package] result ─────────────────────────
    if (Object.keys(rawPackage).length > 0) {
        const pkg = buildCargoPackage(rawPackage);
        if (pkg) {
            result.package = pkg;
        }
        else {
            result.parseWarnings.push('[package] section found but missing required "name" or "version" field.');
        }
    }
    // ── Assemble workspace result ─────────────────────────────
    if (result.isWorkspaceRoot || wsMembers.length > 0) {
        result.isWorkspaceRoot = true;
        const wsPackageDefaults = Object.keys(rawWsPackage).length > 0
            ? buildPartialCargoPackage(rawWsPackage) ?? undefined
            : undefined;
        result.workspace = {
            members: wsMembers,
            defaultMembers: wsDefaultMembers.length > 0 ? wsDefaultMembers : undefined,
            exclude: wsExclude.length > 0 ? wsExclude : undefined,
            packageDefaults: wsPackageDefaults,
            dependencies: Object.keys(wsDependencies).length > 0 ? wsDependencies : undefined,
        };
    }
    result.dependencies = deps;
    result.devDependencies = devDeps;
    result.buildDependencies = buildDeps;
    return result;
}
/**
 * Extract a plain list of direct contract-relevant dependencies from
 * the parsed result. This filters out Rust toolchain / SDK crates that
 * the caller decides are "infrastructure" rather than "contract deps".
 *
 * @param parsed    A `ParsedCargoToml` result.
 * @param skipNames Crate names to exclude (defaults to common Stellar SDK crates).
 */
function extractContractDependencies(parsed, skipNames = DEFAULT_SKIP_CRATES) {
    const skip = new Set(skipNames.map(s => s.toLowerCase()));
    const all = {
        ...parsed.dependencies,
        ...parsed.buildDependencies,
    };
    return Object.values(all).filter(d => !skip.has(d.name.toLowerCase()));
}
/**
 * Retrieve the package name from a `ParsedCargoToml`, falling back to
 * the last component of the file path when no `[package]` section exists.
 */
function getContractName(parsed) {
    if (parsed.package?.name) {
        return parsed.package.name;
    }
    // Derive from directory name: …/contracts/my-contract/Cargo.toml → my-contract
    const parts = parsed.filePath.replace(/\\/g, '/').split('/');
    const tomlIndex = parts.lastIndexOf('Cargo.toml');
    if (tomlIndex > 0) {
        return parts[tomlIndex - 1];
    }
    return 'unknown-contract';
}
// ── Internal helpers ──────────────────────────────────────────
/** Crate names typically present in every Stellar/Soroban contract. */
const DEFAULT_SKIP_CRATES = [
    'soroban-sdk',
    'stellar-xdr',
    'soroban-env-host',
    'soroban-env-common',
    'soroban-env-guest',
    'soroban-env-macros',
];
function normaliseSectionName(raw) {
    const lower = raw.toLowerCase().replace(/\s+/g, '');
    switch (lower) {
        case 'package': return 'package';
        case 'workspace': return 'workspace';
        case 'workspace.package': return 'workspace.package';
        case 'workspace.dependencies': return 'workspace.dependencies';
        case 'dependencies': return 'dependencies';
        case 'dev-dependencies':
        case 'dev_dependencies': return 'dev-dependencies';
        case 'build-dependencies':
        case 'build_dependencies': return 'build-dependencies';
        default: return 'other';
    }
}
/**
 * Attempt to build a `CargoPackage` from a raw key→valuePart map.
 * Returns `undefined` when the minimum required fields (name + version) aren't present.
 */
function buildCargoPackage(raw) {
    const name = extractString(raw['name']);
    const version = extractString(raw['version']);
    if (!name || !version) {
        return undefined;
    }
    return applyOptionalPackageFields({ name, version, authors: [] }, raw);
}
/**
 * Build a partial package from a raw key→valuePart map where name and version
 * are optional (used for `[workspace.package]` defaults).
 * Returns `undefined` when no recognisable fields are present at all.
 */
function buildPartialCargoPackage(raw) {
    if (Object.keys(raw).length === 0) {
        return undefined;
    }
    const name = extractString(raw['name']);
    const version = extractString(raw['version']);
    const partial = {};
    if (name) {
        partial.name = name;
    }
    if (version) {
        partial.version = version;
    }
    return applyOptionalPackageFields(partial, raw);
}
/** Fill optional string/array fields into a (potentially partial) package object. */
function applyOptionalPackageFields(pkg, raw) {
    const description = extractString(raw['description']);
    if (description) {
        pkg.description = description;
    }
    const edition = extractString(raw['edition']);
    if (edition) {
        pkg.edition = edition;
    }
    const license = extractString(raw['license']);
    if (license) {
        pkg.license = license;
    }
    const repository = extractString(raw['repository']);
    if (repository) {
        pkg.repository = repository;
    }
    const homepage = extractString(raw['homepage']);
    if (homepage) {
        pkg.homepage = homepage;
    }
    const readme = extractString(raw['readme']);
    if (readme) {
        pkg.readme = readme;
    }
    if (raw['authors']) {
        pkg.authors = parseTomlStringArray(raw['authors']);
    }
    if (raw['keywords']) {
        pkg.keywords = parseTomlStringArray(raw['keywords']);
    }
    if (raw['categories']) {
        pkg.categories = parseTomlStringArray(raw['categories']);
    }
    return pkg;
}
/**
 * Parse a dependency value which may be:
 *   `"1.0.0"`                       → version string
 *   `{ version = "1.0", ... }`       → inline table
 *   `{ workspace = true }`           → workspace inherit
 */
function parseDependencyValue(name, valuePart) {
    const dep = { name };
    const trimmed = valuePart.trim();
    // Inline table: { ... }
    if (trimmed.startsWith('{')) {
        parseInlineTable(trimmed, dep);
        return dep;
    }
    // Plain version string: "1.0" or '1.0'
    const ver = extractString(trimmed);
    if (ver !== undefined) {
        dep.version = ver;
    }
    return dep;
}
/**
 * Parse an inline TOML table (`{ key = value, ... }`) into a `CargoDependency`.
 * Handles string values, boolean values, and arrays for `features`.
 */
function parseInlineTable(tableStr, dep) {
    // Strip surrounding braces
    const inner = tableStr.replace(/^\{/, '').replace(/\}$/, '').trim();
    if (!inner) {
        return;
    }
    // Split on commas that are not inside quotes or brackets.
    const pairs = splitInlineTablePairs(inner);
    for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
            continue;
        }
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        switch (k) {
            case 'version':
                dep.version = extractString(v) ?? v;
                break;
            case 'features':
                dep.features = parseTomlStringArray(v);
                break;
            case 'optional':
                dep.optional = v.trim() === 'true';
                break;
            case 'workspace':
                dep.workspace = v.trim() === 'true';
                break;
            case 'git':
                dep.git = extractString(v) ?? v;
                break;
            case 'branch':
                dep.branch = extractString(v) ?? v;
                break;
            case 'tag':
                dep.tag = extractString(v) ?? v;
                break;
            case 'rev':
                dep.rev = extractString(v) ?? v;
                break;
            case 'path':
                dep.path = extractString(v) ?? v;
                break;
            // package renames and other fields are intentionally ignored
        }
    }
}
/**
 * Split the inner content of an inline table on `,` delimiters,
 * but only when the comma is outside of strings and brackets.
 */
function splitInlineTablePairs(inner) {
    const results = [];
    let depth = 0;
    let inString = false;
    let quote = '';
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (inString) {
            if (ch === '\\') {
                i++;
                continue;
            } // escape
            if (ch === quote) {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            continue;
        }
        if (ch === '[' || ch === '{') {
            depth++;
            continue;
        }
        if (ch === ']' || ch === '}') {
            depth--;
            continue;
        }
        if (ch === ',' && depth === 0) {
            const segment = inner.slice(start, i).trim();
            if (segment) {
                results.push(segment);
            }
            start = i + 1;
        }
    }
    const last = inner.slice(start).trim();
    if (last) {
        results.push(last);
    }
    return results;
}
/**
 * Extract the string value from a TOML string literal (double or single
 * quoted, or bare).  Returns `undefined` for non-string-looking values.
 */
function extractString(raw) {
    if (raw === undefined) {
        return undefined;
    }
    const t = raw.trim();
    // Double-quoted
    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
        return t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
    // Single-quoted (no escape sequences in TOML literal strings)
    if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
        return t.slice(1, -1);
    }
    return undefined;
}
/**
 * Parse a TOML inline array of strings into a `string[]`.
 * Handles `["a", "b"]` and `['a', 'b']` forms.
 * Non-string elements are skipped.
 */
function parseTomlStringArray(raw) {
    const t = raw.trim();
    if (!t.startsWith('[')) {
        return [];
    }
    const inner = t.slice(1, t.lastIndexOf(']'));
    const result = [];
    // Scan character-by-character to honour nested brackets / quoted commas.
    let inStr = false;
    let quote = '';
    let buf = '';
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (inStr) {
            if (ch === '\\' && quote === '"') {
                buf += ch + (inner[++i] ?? '');
                continue;
            }
            if (ch === quote) {
                inStr = false;
            }
            buf += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inStr = true;
            quote = ch;
            buf += ch;
            continue;
        }
        if (ch === '[' || ch === '{') {
            depth++;
            buf += ch;
            continue;
        }
        if (ch === ']' || ch === '}') {
            depth--;
            buf += ch;
            continue;
        }
        if (ch === ',' && depth === 0) {
            const s = extractString(buf.trim());
            if (s !== undefined) {
                result.push(s);
            }
            buf = '';
            continue;
        }
        buf += ch;
    }
    const tail = extractString(buf.trim());
    if (tail !== undefined) {
        result.push(tail);
    }
    return result;
}
