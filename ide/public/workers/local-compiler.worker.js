/**
 * Local WASM Compiler Worker — Experimental
 *
 * Runs entirely in a background thread so the UI stays responsive even
 * during the heavyweight initialisation and compilation phases.
 *
 * Two modes:
 *   real   – a WASM module is available at STELLAR_RUSTC_WASM_URL and is
 *             loaded / invoked here (future integration point).
 *   demo   – no external compiler present; performs basic Rust structure
 *             validation and synthesises a minimal, valid WASM binary so
 *             that the full pipeline (worker → terminal → WASM store) can
 *             be exercised end-to-end without a backend.
 *
 * Inbound messages  (main → worker):
 *   { type: 'init' }
 *   { type: 'compile', id, files, contractName, network }
 *   { type: 'cancel',  id }
 *
 * Outbound messages (worker → main):
 *   { type: 'status',    phase, memoryMb }
 *   { type: 'chunk',     id, data }
 *   { type: 'done',      id, ok, output, wasmBase64 }
 *   { type: 'error',     id, message }
 *   { type: 'cancelled', id }
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function estimateMemoryMb() {
  if (typeof performance !== 'undefined' && performance.memory) {
    return Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
  }
  return null; // not available (Firefox, Safari)
}

function postStatus(phase, memoryMb) {
  self.postMessage({ type: 'status', phase, memoryMb: memoryMb ?? estimateMemoryMb() });
}

/**
 * Build a minimal but valid WASM module that:
 *   - has one exported function `init` returning i32 (the "compiled" artefact)
 *
 * The binary layout follows the WASM spec section-by-section so it can be
 * verified with WebAssembly.validate() in the worker itself.
 */
function buildDemoWasm() {
  // prettier-ignore
  const bytes = new Uint8Array([
    // ── Magic + version ──────────────────────────────────────────────────
    0x00, 0x61, 0x73, 0x6d,   // \0asm
    0x01, 0x00, 0x00, 0x00,   // version 1

    // ── Type section (id=1): one type: () -> [i32] ───────────────────────
    0x01, 0x05,               // section id, byte length
    0x01,                     // 1 type
    0x60, 0x00, 0x01, 0x7f,  // func () -> i32

    // ── Function section (id=3): one function of type 0 ─────────────────
    0x03, 0x02,
    0x01, 0x00,

    // ── Export section (id=7): export "init" as function 0 ──────────────
    0x07, 0x08,
    0x01,                                   // 1 export
    0x04, 0x69, 0x6e, 0x69, 0x74,          // name "init" (len=4)
    0x00, 0x00,                             // func index 0

    // ── Code section (id=10): body for function 0 ───────────────────────
    0x0a, 0x06,
    0x01,                     // 1 body
    0x04, 0x00,               // body size 4, 0 locals
    0x41, 0x2a,               // i32.const 42
    0x0b,                     // end
  ]);
  return bytes;
}

// ---------------------------------------------------------------------------
// Basic Rust / Soroban structure validator
// ---------------------------------------------------------------------------

/**
 * Returns an array of error strings found in the source files, or an empty
 * array if everything looks reasonable.
 */
function validateRustFiles(files) {
  const errors = [];

  // Find the main lib.rs / contract source
  const sources = files.filter(
    (f) => f.path.endsWith('.rs') && !f.path.includes('test'),
  );

  if (sources.length === 0) {
    errors.push('error[E0001]: no Rust source files found in project');
    return errors;
  }

  for (const file of sources) {
    const src = file.content ?? '';
    if (!src.trim()) continue;

    // Unmatched braces — simple heuristic
    let depth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; i++; }
        continue;
      }
      if (ch === '/' && next === '/') { inLineComment = true; continue; }
      if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth !== 0) {
      errors.push(
        `error[E0038]: unmatched braces in ${file.path} (depth ${depth > 0 ? '+' + depth : depth})`,
      );
    }

    // Contract files should use soroban-sdk or stellar-xdr
    const isContractFile =
      src.includes('#[contract]') ||
      src.includes('#[contractimpl]') ||
      src.includes('soroban_sdk') ||
      src.includes('soroban-sdk') ||
      src.includes('stellar_xdr');

    if (!isContractFile && file.path.endsWith('lib.rs')) {
      // Not fatal — just note it
    }

    // Unsafe code warning (not an error, just surfaced)
    if (src.includes('unsafe {')) {
      errors.push(
        `warning[W0001]: unsafe block detected in ${file.path}; ensure this is intentional`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Compilation simulation (demo mode)
// ---------------------------------------------------------------------------

const CRATE_CHAIN = [
  'proc-macro2 v1.0.89',
  'unicode-ident v1.0.13',
  'syn v2.0.89',
  'quote v1.0.37',
  'serde v1.0.215',
  'serde_derive v1.0.215',
  'stellar-xdr v0.0.21',
  'soroban-sdk-macros v22.0.1',
  'soroban-env-common v22.0.0',
  'soroban-sdk v22.0.1',
];

async function* simulateCompile(contractName, files) {
  // Phase: resolving dependencies
  postStatus('resolving', 120);
  yield `   Resolving dependencies for ${contractName}\n`;
  await sleep(180);

  // Phase: compiling dependency chain
  postStatus('compiling-deps', 200);
  for (let i = 0; i < CRATE_CHAIN.length; i++) {
    yield `   Compiling ${CRATE_CHAIN[i]}\n`;
    await sleep(60 + Math.random() * 80);
    postStatus('compiling-deps', 200 + i * 15);
  }

  // Validation
  postStatus('compiling-contract', 340);
  const validationErrors = validateRustFiles(files);
  const hardErrors = validationErrors.filter((e) => e.startsWith('error'));
  const warnings = validationErrors.filter((e) => e.startsWith('warning'));

  for (const w of warnings) {
    yield `${w}\n`;
    await sleep(20);
  }

  yield `   Compiling ${contractName} v0.1.0 (/workspace/${contractName})\n`;
  await sleep(200);

  if (hardErrors.length > 0) {
    for (const err of hardErrors) {
      yield `${err}\n`;
      await sleep(30);
    }
    yield `\nerror: could not compile \`${contractName}\` due to ${hardErrors.length} previous error${hardErrors.length > 1 ? 's' : ''}\n`;
    return { ok: false };
  }

  // Success
  const elapsed = (4.8 + Math.random() * 0.8).toFixed(1);
  yield `    Finished release [optimized] target(s) in ${elapsed}s\n`;
  postStatus('done', 210);
  return { ok: true };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Cancellation registry
// ---------------------------------------------------------------------------

/** @type {Map<string, { cancelled: boolean }>} */
const cancelTokens = new Map();

// ---------------------------------------------------------------------------
// Compiler state
// ---------------------------------------------------------------------------

/** @type {'idle' | 'loading' | 'ready' | 'error'} */
let compilerState = 'idle';
let realCompilerModule = null;

// --- SRI Verifier inside worker ---
let _workerManifest = null;
async function fetchWithWorkerSRI(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Fetch failed');
  const buf = await resp.arrayBuffer();
  
  if (!_workerManifest) {
    try {
      const mResp = await fetch('/sri-manifest.json');
      if (mResp.ok) _workerManifest = await mResp.json();
    } catch {
      // Ignore
    }
  }
  if (!_workerManifest) return buf;

  let urlKey;
  try { urlKey = new URL(url, "https://localhost").pathname; } catch { urlKey = url; }
  
  const expectedSRI = _workerManifest.assets[urlKey];
  if (!expectedSRI) return buf;

  const hashBuffer = await crypto.subtle.digest('SHA-384', buf);
  const bytes = new Uint8Array(hashBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const actualSRI = 'sha384-' + btoa(binary);

  if (actualSRI !== expectedSRI) {
    self.postMessage({ type: 'sri-error', url, expected: expectedSRI, actual: actualSRI });
    throw new Error('SRI check failed');
  }
  return buf;
}

async function initCompiler() {
  if (compilerState === 'ready') return true;
  if (compilerState === 'loading') return false;

  compilerState = 'loading';
  postStatus('loading', 80);

  // Try to load a real compiler if a URL was provided at page load
  const realUrl = (typeof globalThis !== 'undefined' && globalThis.STELLAR_RUSTC_WASM_URL) || null;
  if (realUrl) {
    try {
      const buf = await fetchWithWorkerSRI(realUrl);
      realCompilerModule = await WebAssembly.compile(buf);
      compilerState = 'ready';
      postStatus('ready', estimateMemoryMb() ?? 480);
      return true;
    } catch (e) {
      if (e && e.message === 'SRI check failed') {
        throw e; // Do not fall through on security error
      }
      // Fall through to demo mode
    }
  }

  // No real compiler — demo mode is always available
  compilerState = 'ready';
  postStatus('ready', estimateMemoryMb() ?? 85);
  return true;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener('message', async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    await initCompiler();
    return;
  }

  if (msg.type === 'compile') {
    const { id, payload } = msg;
    const files = msg.files ?? payload?.files;
    const contractName = msg.contractName ?? payload?.contractName;
    const token = { cancelled: false };
    cancelTokens.set(id, token);

    if (compilerState !== 'ready') {
      await initCompiler();
    }

    let fullOutput = '';

    try {
      if (realCompilerModule) {
        // ── Real compiler path (future) ──────────────────────────────────
        // When an actual rustc-wasm module is available the instance would
        // be created here and its compilation API called with the file set.
        // This branch is intentionally left as a documented hook point.
        //
        // const instance = await WebAssembly.instantiate(realCompilerModule, {});
        // const result = instance.exports.compile(serialisedFiles);
        // ...
        self.postMessage({ type: 'error', id, message: 'Real compiler module loaded but binding not yet implemented.' });
        return;
      }

      // ── Demo / simulation path ───────────────────────────────────────
      const gen = simulateCompile(contractName, files);
      let lastResult = null;

      for (;;) {
        if (token.cancelled) {
          self.postMessage({ type: 'cancelled', id });
          return;
        }

        const { value, done } = await gen.next();

        if (done) {
          lastResult = value;
          break;
        }

        // value is a string chunk
        fullOutput += value;
        self.postMessage({ type: 'chunk', id, data: value });
      }

      const ok = lastResult?.ok ?? false;

      if (ok) {
        // Synthesise a verifiable WASM binary
        const wasmBytes = buildDemoWasm();
        const isValid = WebAssembly.validate(wasmBytes);

        if (!isValid) {
          throw new Error('Generated WASM binary failed validation — this is a bug in the demo builder.');
        }

        const wasmBase64 = toBase64(wasmBytes);
        const sizeKb = (wasmBytes.length / 1024).toFixed(1);

        const successMsg =
          `\n[local] WASM binary verified (${sizeKb} KB)\n` +
          `[local] Mode: demo (no backend required)\n`;
        fullOutput += successMsg;
        self.postMessage({ type: 'chunk', id, data: successMsg });
        self.postMessage({ type: 'done', id, ok: true, output: fullOutput, wasmBase64 });
      } else {
        self.postMessage({ type: 'done', id, ok: false, output: fullOutput, wasmBase64: null });
      }
    } catch (err) {
      if (err && err.message === 'SRI check failed') {
        return; // Main thread will terminate the worker
      }
      const message = (err && err.message) || 'Local compiler error';
      fullOutput += `\nfatal error: ${message}\n`;
      self.postMessage({ type: 'chunk', id, data: `\nfatal error: ${message}\n` });
      self.postMessage({ type: 'done', id, ok: false, output: fullOutput, wasmBase64: null });
    } finally {
      cancelTokens.delete(id);
    }
  }

  if (msg.type === 'cancel') {
    const token = cancelTokens.get(msg.id);
    if (token) token.cancelled = true;
  }
});
