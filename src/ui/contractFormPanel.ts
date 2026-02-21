// src/ui/contractFormPanel.ts
// WebView panel for dynamic contract function form generation.
// Follows the same structural pattern as simulationPanel.ts.

import * as vscode from 'vscode';
import { GeneratedForm } from '../services/abiFormGeneratorService';

// Message types received from the webview
interface FormSubmitMessage {
    type: 'formSubmit';
    args: Record<string, string>;
}

interface FormCancelMessage {
    type: 'formCancel';
}

type WebviewMessage = FormSubmitMessage | FormCancelMessage;

/**
 * Manages the WebView panel that displays a dynamically generated contract
 * function form and collects user input before simulation.
 *
 * Usage pattern from simulateTransaction.ts:
 *
 *   const panel = ContractFormPanel.createOrShow(context, generatedForm);
 *   const formData = await panel.waitForSubmit(); // null if cancelled/closed
 *   if (formData === null) { return; }
 *   // validate, show errors if needed...
 *   panel.showErrors(validationResult.errors);
 *   // loop until valid
 */
export class ContractFormPanel {
    private static currentPanel: ContractFormPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _resolveSubmit?: (args: Record<string, string> | null) => void;
    private readonly _form: GeneratedForm;

    private constructor(
        panel: vscode.WebviewPanel,
        form: GeneratedForm
    ) {
        this._panel = panel;
        this._form = form;
        this._panel.webview.html = this._getHtml();

        // Unblock any awaiting caller when the panel is closed by the user
        this._panel.onDidDispose(() => {
            if (this._resolveSubmit) {
                this._resolveSubmit(null);
                this._resolveSubmit = undefined;
            }
            this.dispose();
        }, null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                switch (message.type) {
                    case 'formSubmit':
                        if (this._resolveSubmit) {
                            this._resolveSubmit(message.args);
                            this._resolveSubmit = undefined;
                        }
                        return;
                    case 'formCancel':
                        if (this._resolveSubmit) {
                            this._resolveSubmit(null);
                            this._resolveSubmit = undefined;
                        }
                        this.dispose();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    // ── Static Factory ────────────────────────────────────────

    /**
     * Create or reveal the contract form panel.
     * If an existing panel is open, its content is replaced with the new form.
     */
    public static createOrShow(
        context: vscode.ExtensionContext,
        form: GeneratedForm
    ): ContractFormPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (ContractFormPanel.currentPanel) {
            ContractFormPanel.currentPanel._panel.reveal(column);
            // Refresh content for the new function
            ContractFormPanel.currentPanel._panel.webview.html =
                ContractFormPanel.currentPanel._getHtml();
            return ContractFormPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'contractFormPanel',
            `Contract Form: ${form.functionName}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        ContractFormPanel.currentPanel = new ContractFormPanel(panel, form);
        return ContractFormPanel.currentPanel;
    }

    // ── Public Methods ────────────────────────────────────────

    /**
     * Returns a Promise that resolves when the user submits the form
     * (with the raw FormData Record<string,string>) or when they cancel
     * or close the panel (with null).
     *
     * Call this once per submission attempt. On validation failure, call
     * showErrors() and then await waitForSubmit() again on the same panel.
     */
    public waitForSubmit(): Promise<Record<string, string> | null> {
        return new Promise<Record<string, string> | null>(resolve => {
            this._resolveSubmit = resolve;
        });
    }

    /**
     * Post per-field validation errors to the webview for inline display.
     * @param errors - map of paramName → error message string
     */
    public showErrors(errors: Record<string, string>): void {
        this._panel.webview.postMessage({ type: 'validationErrors', errors });
    }

    /**
     * Post per-field validation warnings to the webview for inline display.
     * @param warnings - map of paramName → warning message string
     */
    public showWarnings(warnings: Record<string, string>): void {
        this._panel.webview.postMessage({ type: 'validationWarnings', warnings });
    }

    public dispose(): void {
        ContractFormPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    // ── HTML Generation ───────────────────────────────────────

    private _getHtml(): string {
        const { formHtml, functionName, contractId } = this._form;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Contract Form: ${escHtml(functionName)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            max-width: 680px;
        }
        h2 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
            margin-top: 0;
            font-size: 1.2em;
        }
        .contract-meta {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
            word-break: break-all;
        }
        .no-params {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-bottom: 16px;
        }
        .form-field-wrapper {
            margin-bottom: 18px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 0.93em;
        }
        .required-mark {
            color: var(--vscode-inputValidation-errorBorder, #f44);
            margin-left: 2px;
        }
        input[type="text"],
        input[type="number"],
        select,
        textarea {
            width: 100%;
            box-sizing: border-box;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, #ccc);
            border-radius: 3px;
            padding: 6px 8px;
            font-family: var(--vscode-font-family);
            font-size: 0.95em;
        }
        input:focus, select:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        input.field-invalid,
        select.field-invalid,
        textarea.field-invalid {
            border-color: var(--vscode-inputValidation-errorBorder, #f44);
        }
        input:disabled,
        select:disabled,
        textarea:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .field-error {
            display: block;
            color: var(--vscode-inputValidation-errorForeground, #fff);
            background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
            border: 1px solid var(--vscode-inputValidation-errorBorder, #f44);
            border-radius: 3px;
            padding: 4px 8px;
            margin-top: 4px;
            font-size: 0.88em;
        }
        .field-error:empty { display: none; }
        .field-help {
            display: block;
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-top: 3px;
        }
        .option-wrapper {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
        }
        .none-label {
            font-weight: normal;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            cursor: pointer;
        }
        .none-label input[type="checkbox"] {
            width: auto;
        }
        .form-actions {
            margin-top: 24px;
            display: flex;
            gap: 10px;
        }
        .btn {
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 7px 16px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.95em;
            font-family: var(--vscode-font-family);
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        textarea.json-input {
            font-family: var(--vscode-editor-font-family, monospace);
            resize: vertical;
        }
    </style>
</head>
<body>
    <h2>${escHtml(functionName)}</h2>
    <p class="contract-meta">Contract: <code>${escHtml(contractId)}</code></p>

    ${formHtml}

    <script>
        const vscode = acquireVsCodeApi();

        // ── Form submission ───────────────────────────────────
        const form = document.getElementById('contract-form');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                clearAllErrors();
                const raw = new FormData(e.target);
                const args = {};
                raw.forEach(function(value, key) {
                    args[key] = value;
                });
                vscode.postMessage({ type: 'formSubmit', args: args });
            });
        }

        // ── Cancel button ─────────────────────────────────────
        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'formCancel' });
            });
        }

        // ── None checkbox toggling for Option<T> fields ───────
        document.querySelectorAll('.none-toggle').forEach(function(checkbox) {
            checkbox.addEventListener('change', function() {
                const paramId = checkbox.getAttribute('data-target');
                // Strip "param-" prefix to get the param name
                const paramName = paramId ? paramId.replace('param-', '') : '';
                const innerWrapper = document.getElementById('inner-' + paramName);
                if (innerWrapper) {
                    const inputs = innerWrapper.querySelectorAll('input, select, textarea');
                    inputs.forEach(function(input) {
                        input.disabled = checkbox.checked;
                        if (checkbox.checked) {
                            input.value = '';
                        }
                    });
                }
            });
        });

        // ── Extension → Webview: validation feedback ──────────
        window.addEventListener('message', function(event) {
            const data = event.data;
            if (data.type === 'validationErrors') {
                showErrors(data.errors);
            }
            if (data.type === 'validationWarnings') {
                showWarnings(data.warnings);
            }
        });

        function showErrors(errors) {
            Object.keys(errors).forEach(function(paramName) {
                const errSpan = document.getElementById('err-' + paramName);
                const input = document.querySelector('[name="' + paramName + '"]');
                if (errSpan) {
                    errSpan.textContent = errors[paramName];
                }
                if (input) {
                    input.classList.add('field-invalid');
                }
            });
        }

        function showWarnings(warnings) {
            Object.keys(warnings).forEach(function(paramName) {
                const wrapper = document.querySelector('[data-param="' + paramName + '"]');
                if (wrapper) {
                    const helpSpan = wrapper.querySelector('.field-help');
                    if (helpSpan && warnings[paramName]) {
                        helpSpan.textContent += ' (' + warnings[paramName] + ')';
                    }
                }
            });
        }

        function clearAllErrors() {
            document.querySelectorAll('.field-error').forEach(function(el) {
                el.textContent = '';
            });
            document.querySelectorAll('.field-invalid').forEach(function(el) {
                el.classList.remove('field-invalid');
            });
        }
    </script>
</body>
</html>`;
    }
}

// ── HTML Escape Helper ────────────────────────────────────────
// Mirrors the escapeHtml() in simulationPanel.ts exactly.
function escHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
