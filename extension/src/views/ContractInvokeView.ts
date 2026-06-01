import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

interface ContractMethod {
    name: string;
    inputs: Array<{ name: string; type: string }>;
}

/**
 * ContractInvokeViewProvider — sidebar webview for invoking Soroban contracts.
 *
 * Features
 * ────────
 * • Contract ID input + "Fetch Spec" button that calls `stellar contract info`
 *   to discover available methods and their parameters.
 * • Dynamic form generation: each parameter becomes a labelled input field.
 * • Network + source identity selectors (reads VS Code settings as defaults).
 * • Invocation result displayed in a scrollable output pane with syntax
 *   highlighting for JSON responses and coloured error messages.
 * • "Copy Result" button once a result is available.
 */
export class ContractInvokeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractInvokeView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'fetchSpec':
                    await this._handleFetchSpec(message.contractId, message.network);
                    break;
                case 'invokeContract':
                    await this._handleInvoke(message);
                    break;
            }
        });
    }

    // ─── Message handlers ──────────────────────────────────────────────────────

    private async _handleFetchSpec(contractId: string, network: string): Promise<void> {
        if (!contractId?.trim()) {
            this._post({ type: 'specError', error: 'Contract ID is required.' });
            return;
        }

        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get<string>('cliPath', 'stellar');

        this._post({ type: 'specLoading' });

        try {
            const env = this._getEnvWithPath();
            const cmd = `${cliPath} contract info --id ${contractId.trim()} --network ${network}`;
            const { stdout, stderr } = await execAsync(cmd, { env, timeout: 20000 });

            const methods = this._parseSpec(stdout || stderr);
            if (methods.length === 0) {
                this._post({
                    type: 'specError',
                    error:
                        'No callable methods found in contract spec. ' +
                        'Ensure the contract is deployed and the ID is correct.\n\nRaw output:\n' +
                        (stdout || stderr),
                });
                return;
            }

            this._post({ type: 'specLoaded', methods });
        } catch (err: any) {
            this._post({
                type: 'specError',
                error: `Failed to fetch contract spec: ${err?.message ?? String(err)}`,
            });
        }
    }

    private async _handleInvoke(message: {
        contractId: string;
        method: string;
        args: Record<string, string>;
        network: string;
        source: string;
    }): Promise<void> {
        const { contractId, method, args, network, source } = message;

        if (!contractId?.trim() || !method?.trim()) {
            this._post({ type: 'invokeError', error: 'Contract ID and method are required.' });
            return;
        }

        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get<string>('cliPath', 'stellar');

        // Build the arg string: --param value …
        const argParts = Object.entries(args)
            .filter(([, v]) => v.trim() !== '')
            .map(([k, v]) => `--${k} ${this._shellEscape(v)}`)
            .join(' ');

        const cmd =
            `${cliPath} contract invoke` +
            ` --id ${contractId.trim()}` +
            ` --network ${network}` +
            ` --source ${source || 'dev'}` +
            ` -- ${method.trim()}` +
            (argParts ? ` ${argParts}` : '');

        this._post({ type: 'invokeLoading', cmd });

        try {
            const env = this._getEnvWithPath();
            const { stdout, stderr } = await execAsync(cmd, {
                env,
                timeout: 30000,
                maxBuffer: 5 * 1024 * 1024,
            });

            const output = stdout.trim() || stderr.trim();
            this._post({ type: 'invokeResult', result: output, cmd });
        } catch (err: any) {
            const raw = err?.stderr || err?.stdout || err?.message || String(err);
            this._post({ type: 'invokeError', error: raw, cmd });
        }
    }

    // ─── Spec parsing ──────────────────────────────────────────────────────────

    private _parseSpec(raw: string): ContractMethod[] {
        const methods: ContractMethod[] = [];

        // Try JSON first (stellar CLI may emit JSON with --output json flag or in newer versions).
        try {
            const json = JSON.parse(raw);
            const fns: any[] =
                json?.functions ?? json?.contract_spec ?? json?.spec?.functions ?? [];
            for (const fn of fns) {
                if (fn?.name) {
                    methods.push({
                        name: fn.name,
                        inputs: (fn.inputs ?? fn.params ?? []).map((p: any) => ({
                            name: p.name ?? p.param_name ?? '',
                            type: p.type ?? p.value_type ?? 'string',
                        })),
                    });
                }
            }
            if (methods.length > 0) { return methods; }
        } catch {
            // not JSON — fall through to text parsing
        }

        // Text-based parsing: look for lines like `fn method_name(param: type, …)`
        const fnRegex = /fn\s+(\w+)\s*\(([^)]*)\)/g;
        let match: RegExpExecArray | null;
        while ((match = fnRegex.exec(raw)) !== null) {
            const name = match[1];
            const paramStr = match[2].trim();
            const inputs: Array<{ name: string; type: string }> = [];

            if (paramStr && paramStr !== 'env: Env' && paramStr !== '') {
                for (const part of paramStr.split(',')) {
                    const [pName, pType] = part.split(':').map((s) => s.trim());
                    if (pName && pName !== 'env') {
                        inputs.push({ name: pName, type: pType ?? 'string' });
                    }
                }
            }

            // Skip internal Soroban env/constructor functions.
            if (!['__constructor', 'upgrade'].includes(name)) {
                methods.push({ name, inputs });
            }
        }

        return methods;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private _post(message: Record<string, unknown>): void {
        this._view?.webview.postMessage(message);
    }

    private _shellEscape(value: string): string {
        // Wrap in double-quotes, escape internal double-quotes.
        return `"${value.replace(/"/g, '\\"')}"`;
    }

    private _getEnvWithPath(): NodeJS.ProcessEnv {
        const env = { ...process.env };
        const homeDir = os.homedir();
        const extra = [
            path.join(homeDir, '.cargo', 'bin'),
            path.join(homeDir, '.local', 'bin'),
            '/usr/local/bin',
            '/opt/homebrew/bin',
        ];
        env.PATH = [...extra, env.PATH ?? ''].filter(Boolean).join(path.delimiter);
        return env;
    }

    // ─── Webview HTML ──────────────────────────────────────────────────────────

    private _getHtml(webview: vscode.Webview): string {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const defaultNetwork = config.get<string>('network', 'testnet');
        const defaultSource = config.get<string>('source', 'dev');

        // Content-security-policy nonce would be ideal for production extensions;
        // for this extension using inline scripts is acceptable.
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contract Invoke</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 10px 12px;
    margin: 0;
  }
  h2 { font-size: 1em; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
  label { display: block; margin-bottom: 2px; font-size: 0.85em; opacity: 0.8; }
  input, select {
    width: 100%; padding: 5px 7px; margin-bottom: 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
    font-family: inherit; font-size: inherit;
  }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
  .row { display: flex; gap: 6px; }
  .row > * { flex: 1; }
  button {
    width: 100%; padding: 6px 10px; margin-bottom: 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 2px; cursor: pointer;
    font-family: inherit; font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, #3a3a3a);
    color: var(--vscode-button-secondaryForeground, #ccc);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #4a4a4a); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  #methodSection { display: none; }
  #dynamicArgs { margin-bottom: 8px; }
  #output {
    margin-top: 4px; padding: 8px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 2px;
    white-space: pre-wrap; word-break: break-all;
    min-height: 80px; max-height: 280px; overflow-y: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    line-height: 1.5;
  }
  #output.error { color: var(--vscode-errorForeground, #f44); }
  #output.loading { opacity: 0.6; font-style: italic; }
  #cmdLine {
    font-size: 0.75em; opacity: 0.6; margin-bottom: 4px;
    word-break: break-all; white-space: pre-wrap;
  }
  .divider { border: none; border-top: 1px solid var(--vscode-panel-border, #444); margin: 10px 0; }
  #copyBtn { display: none; }
  #specStatus { font-size: 0.8em; margin-bottom: 6px; }
  #specStatus.error { color: var(--vscode-errorForeground, #f44); }
  #specStatus.ok { color: var(--vscode-terminal-ansiGreen, #4c4); }
</style>
</head>
<body>

<h2>Invoke Contract</h2>

<!-- Contract ID + Fetch Spec -->
<label for="contractId">Contract ID</label>
<input type="text" id="contractId" placeholder="C…" spellcheck="false">

<div class="row">
  <div>
    <label for="networkSel">Network</label>
    <select id="networkSel">
      <option value="testnet"${defaultNetwork === 'testnet' ? ' selected' : ''}>testnet</option>
      <option value="futurenet"${defaultNetwork === 'futurenet' ? ' selected' : ''}>futurenet</option>
      <option value="mainnet"${defaultNetwork === 'mainnet' ? ' selected' : ''}>mainnet</option>
    </select>
  </div>
  <div>
    <label for="sourceId">Source Identity</label>
    <input type="text" id="sourceId" value="${defaultSource}" placeholder="dev">
  </div>
</div>

<button id="fetchSpecBtn">Fetch Contract Spec</button>
<div id="specStatus"></div>

<hr class="divider">

<!-- Method + dynamic args (hidden until spec loaded) -->
<div id="methodSection">
  <label for="methodSel">Method</label>
  <select id="methodSel"></select>

  <div id="dynamicArgs"></div>

  <button id="invokeBtn">Invoke</button>
</div>

<!-- Output -->
<div id="cmdLine"></div>
<div id="output">Results will appear here…</div>
<button id="copyBtn" class="secondary">Copy Result</button>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const contractIdEl = document.getElementById('contractId');
  const networkEl    = document.getElementById('networkSel');
  const sourceEl     = document.getElementById('sourceId');
  const fetchBtn     = document.getElementById('fetchSpecBtn');
  const specStatus   = document.getElementById('specStatus');
  const methodSec    = document.getElementById('methodSection');
  const methodSel    = document.getElementById('methodSel');
  const dynamicArgs  = document.getElementById('dynamicArgs');
  const invokeBtn    = document.getElementById('invokeBtn');
  const outputEl     = document.getElementById('output');
  const cmdLineEl    = document.getElementById('cmdLine');
  const copyBtn      = document.getElementById('copyBtn');

  // ── State ───────────────────────────────────────────────────────────────────
  /** @type {Array<{name: string, inputs: Array<{name:string, type:string}>}>} */
  let methods = [];
  let lastResult = '';

  // ── Fetch spec ──────────────────────────────────────────────────────────────
  fetchBtn.addEventListener('click', () => {
    const id = contractIdEl.value.trim();
    specStatus.textContent = '';
    specStatus.className = '';
    if (!id) { specStatus.textContent = 'Enter a Contract ID first.'; specStatus.className = 'error'; return; }
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching…';
    vscode.postMessage({ type: 'fetchSpec', contractId: id, network: networkEl.value });
  });

  // ── Method selection → rebuild arg fields ───────────────────────────────────
  methodSel.addEventListener('change', () => buildArgFields());

  function buildArgFields() {
    const idx = methodSel.selectedIndex;
    const m = methods[idx];
    dynamicArgs.innerHTML = '';
    if (!m) { return; }
    for (const input of m.inputs) {
      const lbl = document.createElement('label');
      lbl.textContent = input.name + (input.type ? '  (' + input.type + ')' : '');
      lbl.htmlFor = 'arg_' + input.name;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'arg_' + input.name;
      inp.dataset.param = input.name;
      inp.placeholder = input.type || 'value';
      dynamicArgs.appendChild(lbl);
      dynamicArgs.appendChild(inp);
    }
  }

  // ── Invoke ───────────────────────────────────────────────────────────────────
  invokeBtn.addEventListener('click', () => {
    const contractId = contractIdEl.value.trim();
    const method = methodSel.value;
    if (!contractId || !method) {
      setOutput('Contract ID and method are required.', true);
      return;
    }

    const args = {};
    dynamicArgs.querySelectorAll('input[data-param]').forEach(el => {
      args[el.dataset.param] = el.value;
    });

    setOutput('Invoking…', false, true);
    cmdLineEl.textContent = '';
    copyBtn.style.display = 'none';
    lastResult = '';
    invokeBtn.disabled = true;

    vscode.postMessage({
      type: 'invokeContract',
      contractId,
      method,
      args,
      network: networkEl.value,
      source: sourceEl.value.trim() || 'dev',
    });
  });

  // ── Copy button ──────────────────────────────────────────────────────────────
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(lastResult).catch(() => {});
  });

  // ── Messages from extension host ─────────────────────────────────────────────
  window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
      case 'specLoading':
        specStatus.textContent = 'Loading contract spec…';
        specStatus.className = '';
        break;

      case 'specLoaded':
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Contract Spec';
        methods = msg.methods;
        specStatus.textContent = '✔ ' + methods.length + ' method(s) found.';
        specStatus.className = 'ok';
        methodSel.innerHTML = '';
        for (const m of methods) {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          methodSel.appendChild(opt);
        }
        methodSec.style.display = 'block';
        buildArgFields();
        break;

      case 'specError':
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Contract Spec';
        specStatus.textContent = msg.error;
        specStatus.className = 'error';
        break;

      case 'invokeLoading':
        if (msg.cmd) { cmdLineEl.textContent = '$ ' + msg.cmd; }
        break;

      case 'invokeResult':
        invokeBtn.disabled = false;
        if (msg.cmd) { cmdLineEl.textContent = '$ ' + msg.cmd; }
        lastResult = msg.result;
        setOutput(formatResult(msg.result), false);
        copyBtn.style.display = 'block';
        break;

      case 'invokeError':
        invokeBtn.disabled = false;
        if (msg.cmd) { cmdLineEl.textContent = '$ ' + msg.cmd; }
        setOutput(msg.error, true);
        break;
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function setOutput(text, isError, isLoading) {
    outputEl.textContent = text;
    outputEl.className = isError ? 'error' : isLoading ? 'loading' : '';
  }

  function formatResult(raw) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
})();
</script>
</body>
</html>`;
    }
}
