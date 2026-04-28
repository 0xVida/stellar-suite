import * as vscode from 'vscode';

interface LintRule {
    id: string;
    severity: vscode.DiagnosticSeverity;
    pattern: RegExp;
    message: string;
    explanation: string;
    quickFix?: (match: RegExpMatchArray, line: string) => { title: string; replacement: string } | undefined;
}

const SOROBAN_LINTER_SOURCE = 'soroban-linter';

const RULES: LintRule[] = [
    {
        id: 'no-floating-point',
        severity: vscode.DiagnosticSeverity.Error,
        pattern: /\b(?:f32|f64)\b/g,
        message: 'Floating-point types are not supported in Soroban contracts',
        explanation:
            'Soroban WASM execution does not support floating-point arithmetic. Use fixed-point integer math (i128 / u128) or the soroban_sdk numeric helpers instead.',
        quickFix: () => ({
            title: 'Replace with i128',
            replacement: 'i128',
        }),
    },
    {
        id: 'no-std-println',
        severity: vscode.DiagnosticSeverity.Error,
        pattern: /\b(?:println!|print!|eprintln!|eprint!|dbg!)\s*\(/g,
        message: 'Standard I/O macros are not available in Soroban contracts',
        explanation:
            'Soroban runs in a no_std WASM sandbox. Use `env.events().publish(...)` or the soroban_sdk `log!` macro for diagnostics.',
        quickFix: () => ({
            title: 'Replace with log! macro',
            replacement: 'log!(',
        }),
    },
    {
        id: 'no-unwrap',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\.unwrap\s*\(\s*\)/g,
        message: 'Avoid `.unwrap()` in contract code — panics burn fees and break user transactions',
        explanation:
            'Returning a `Result` or using `.unwrap_or(...)` / `.ok_or(MyError::...)` gives callers a structured failure they can handle, instead of a runtime panic.',
        quickFix: () => ({
            title: 'Replace with `.unwrap_or_else(|_| panic_with_error!(env, /* TODO: error */))`',
            replacement: '.unwrap_or_else(|_| panic_with_error!(env, /* TODO: error */))',
        }),
    },
    {
        id: 'no-expect',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\.expect\s*\(\s*"[^"]*"\s*\)/g,
        message: 'Avoid `.expect()` in contract code — prefer typed contract errors',
        explanation:
            'Like `.unwrap()`, `.expect()` panics on error. Define a `#[contracterror]` enum and convert errors with `?` so callers see a typed failure.',
    },
    {
        id: 'no-panic-macro',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /(?<!_with_error!)\bpanic!\s*\(/g,
        message: 'Use `panic_with_error!` instead of bare `panic!` so callers see a typed error',
        explanation:
            '`panic!` produces an opaque host error. `panic_with_error!(env, MyError::Variant)` lets clients decode the failure cleanly.',
        quickFix: () => ({
            title: 'Replace with `panic_with_error!`',
            replacement: 'panic_with_error!(env, /* TODO: error */',
        }),
    },
    {
        id: 'no-std-vec',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\bstd::vec::Vec\b|\buse\s+std::vec::Vec\b/g,
        message: 'Use `soroban_sdk::Vec` rather than `std::vec::Vec` inside contracts',
        explanation:
            'Contract storage and host functions only accept Soroban host types. `std::vec::Vec` cannot cross the host boundary.',
    },
    {
        id: 'no-std-string',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\bstd::string::String\b|\buse\s+std::string::String\b/g,
        message: 'Use `soroban_sdk::String` rather than `std::string::String` inside contracts',
        explanation:
            'Soroban host types must cross the WASM boundary. Replace with `soroban_sdk::String` (and `Symbol` for short identifiers).',
    },
    {
        id: 'no-std-hashmap',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\bstd::collections::HashMap\b|\bHashMap::new\s*\(/g,
        message: 'Use `soroban_sdk::Map` instead of `HashMap` in contracts',
        explanation:
            '`HashMap` is not available in the Soroban host environment. `soroban_sdk::Map<K, V>` is the host-compatible equivalent.',
    },
    {
        id: 'no-system-time',
        severity: vscode.DiagnosticSeverity.Error,
        pattern: /std::time::SystemTime|Instant::now\s*\(/g,
        message: 'System time is not available inside Soroban contracts',
        explanation:
            'Use `env.ledger().timestamp()` for ledger-deterministic time. System clocks would break determinism across validators.',
        quickFix: () => ({
            title: 'Replace with `env.ledger().timestamp()`',
            replacement: 'env.ledger().timestamp()',
        }),
    },
    {
        id: 'no-rand',
        severity: vscode.DiagnosticSeverity.Error,
        pattern: /\brand::|\brand_chacha::|\bThreadRng\b/g,
        message: 'Pseudo-random sources are non-deterministic and must not run inside contracts',
        explanation:
            'Validators must agree on contract output. Source entropy from on-chain commitments (e.g. ledger sequence) or off-chain VRFs.',
    },
    {
        id: 'storage-without-ttl',
        severity: vscode.DiagnosticSeverity.Information,
        pattern: /env\.storage\(\)\.(persistent|temporary|instance)\(\)\.set\(/g,
        message: 'Consider extending TTL after writing to storage',
        explanation:
            'Soroban storage entries expire. Pair `set(...)` with `extend_ttl(...)` (or call it on read) so your data outlives the next archival pass.',
    },
    {
        id: 'env-not-first-arg',
        severity: vscode.DiagnosticSeverity.Warning,
        // matches `pub fn foo(<not env>:` inside a #[contractimpl] file when first arg isn't `env: Env`
        pattern: /pub\s+fn\s+\w+\s*\(\s*(?!env\s*:\s*Env|_env\s*:\s*Env|&self|&mut\s+self|self)([a-zA-Z_]\w*)\s*:/g,
        message: 'Public contract functions usually take `env: Env` as the first parameter',
        explanation:
            'The `Env` handle is the only way to access storage, events, and the ledger. Convention is to make it the first parameter so callers and bindings stay consistent.',
    },
    {
        id: 'mut-static',
        severity: vscode.DiagnosticSeverity.Error,
        pattern: /\bstatic\s+mut\s+\w+/g,
        message: 'Mutable statics are not allowed in Soroban contracts',
        explanation:
            'Contract instances must be deterministic and stateless across invocations. Persist data via `env.storage()` instead of `static mut`.',
    },
    {
        id: 'unsafe-block',
        severity: vscode.DiagnosticSeverity.Warning,
        pattern: /\bunsafe\s*\{/g,
        message: '`unsafe` blocks bypass Soroban\'s safety guarantees',
        explanation:
            'The Soroban host already wraps the dangerous bits. Reach for safe abstractions before introducing `unsafe`.',
    },
    {
        id: 'todo-marker',
        severity: vscode.DiagnosticSeverity.Information,
        pattern: /\b(?:todo!\s*\(|unimplemented!\s*\()/g,
        message: 'Unimplemented placeholder will panic at runtime',
        explanation:
            'Replace `todo!()` / `unimplemented!()` with a real implementation or a typed contract error before deploying.',
    },
];

interface QuickFixCandidate {
    diagnosticIndex: number;
    range: vscode.Range;
    title: string;
    replacement: string;
}

const RANGE_QUICK_FIXES = new WeakMap<vscode.Diagnostic, QuickFixCandidate>();

export class SorobanLinterService implements vscode.Disposable, vscode.CodeActionProvider {
    public static readonly DIAGNOSTIC_SOURCE = SOROBAN_LINTER_SOURCE;

    private collection: vscode.DiagnosticCollection;
    private timers = new Map<string, NodeJS.Timeout>();
    private subscriptions: vscode.Disposable[] = [];
    private readonly debounceMs = 250;

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('soroban');
    }

    register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            this.collection,
            vscode.languages.registerCodeActionsProvider({ language: 'rust' }, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
            }),
        );

        this.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(doc => this.lintDocument(doc)),
            vscode.workspace.onDidChangeTextDocument(e => this.scheduleLint(e.document)),
            vscode.workspace.onDidSaveTextDocument(doc => this.lintDocument(doc)),
            vscode.workspace.onDidCloseTextDocument(doc => this.collection.delete(doc.uri)),
        );

        for (const sub of this.subscriptions) {
            context.subscriptions.push(sub);
        }

        for (const doc of vscode.workspace.textDocuments) {
            this.lintDocument(doc);
        }
    }

    dispose(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        for (const sub of this.subscriptions) {
            sub.dispose();
        }
        this.subscriptions = [];
        this.collection.dispose();
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== SOROBAN_LINTER_SOURCE) {
                continue;
            }
            const fix = RANGE_QUICK_FIXES.get(diagnostic);
            if (!fix) {
                continue;
            }
            if (!diagnostic.range.intersection(range)) {
                continue;
            }
            const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, fix.range, fix.replacement);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            actions.push(action);
        }
        return actions;
    }

    private scheduleLint(document: vscode.TextDocument): void {
        if (!this.shouldLint(document)) {
            return;
        }
        const key = document.uri.toString();
        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                this.lintDocument(document);
            }, this.debounceMs),
        );
    }

    private lintDocument(document: vscode.TextDocument): void {
        if (!this.shouldLint(document)) {
            this.collection.delete(document.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        for (const rule of RULES) {
            for (const match of matchAll(text, rule.pattern)) {
                if (isInCommentOrString(text, match.index ?? 0)) {
                    continue;
                }
                const start = document.positionAt(match.index ?? 0);
                const end = document.positionAt((match.index ?? 0) + match[0].length);
                const range = new vscode.Range(start, end);

                const diagnostic = new vscode.Diagnostic(range, rule.message, rule.severity);
                diagnostic.code = rule.id;
                diagnostic.source = SOROBAN_LINTER_SOURCE;

                if (rule.explanation) {
                    diagnostic.relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, range),
                            rule.explanation,
                        ),
                    ];
                }

                if (rule.quickFix) {
                    const lineText = document.lineAt(start.line).text;
                    const fix = rule.quickFix(match, lineText);
                    if (fix) {
                        RANGE_QUICK_FIXES.set(diagnostic, {
                            diagnosticIndex: diagnostics.length,
                            range,
                            title: fix.title,
                            replacement: fix.replacement,
                        });
                    }
                }

                diagnostics.push(diagnostic);
            }
        }

        this.collection.set(document.uri, diagnostics);
    }

    private shouldLint(document: vscode.TextDocument): boolean {
        if (document.isUntitled) {
            return false;
        }
        if (document.languageId !== 'rust') {
            return false;
        }
        const cfg = vscode.workspace.getConfiguration('stellarSuite.linter');
        if (!cfg.get<boolean>('enabled', true)) {
            return false;
        }
        return true;
    }
}

function* matchAll(text: string, pattern: RegExp): IterableIterator<RegExpMatchArray> {
    if (!pattern.global) {
        const m = text.match(pattern);
        if (m) {
            yield m;
        }
        return;
    }
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        yield match;
        if (match.index === re.lastIndex) {
            re.lastIndex += 1;
        }
    }
}

function isInCommentOrString(text: string, index: number): boolean {
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let stringChar: '"' | "'" | null = null;

    for (let i = 0; i < index; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            if (ch === '\n') {
                inLineComment = false;
            }
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === stringChar) {
                inString = false;
                stringChar = null;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
        }
    }

    return inLineComment || inBlockComment || inString;
}
