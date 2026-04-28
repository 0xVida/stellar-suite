/**
 * Compilation Web Worker
 *
 * Runs the compile API fetch + streaming in a background thread so the main
 * UI thread remains responsive during long builds.
 *
 * Inbound messages  (main → worker):
 *   { type: 'compile', id: string, url: string, payload: object }
 *   { type: 'cancel',  id: string }
 *
 * Outbound messages (worker → main):
 *   { type: 'chunk',     id, data: string }
 *   { type: 'done',      id, ok: boolean, status: number, output: string }
 *   { type: 'error',     id, message: string }
 *   { type: 'cancelled', id }
 */

const decoder = new TextDecoder();

/** @type {Map<string, AbortController>} */
const controllers = new Map();

/**
 * Decode a JSON compile response payload into a plain string.
 * @param {unknown} parsed
 * @returns {string}
 */
function payloadToString(parsed) {
  if (parsed && typeof parsed === 'object') {
    const p = /** @type {Record<string, unknown>} */ (parsed);
    const parts = [p['stdout'], p['stderr'], p['output'], p['logs']].filter(
      (v) => typeof v === 'string' && v.length > 0,
    );
    if (parts.length > 0) return parts.join('');
    if (typeof p['error'] === 'string' && p['error']) return p['error'];
    if (typeof p['message'] === 'string' && p['message']) return p['message'];
  }
  return JSON.stringify(parsed, null, 2);
}

self.addEventListener('message', async (e) => {
  const msg = e.data;

  // ── Compile ────────────────────────────────────────────────────────────────
  if (msg.type === 'compile') {
    const { id, url, payload } = msg;
    const controller = new AbortController();
    controllers.set(id, controller);

    let output = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const text = await response.text();
        let decoded = text;
        try {
          decoded = payloadToString(JSON.parse(text));
        } catch {
          // leave as raw text
        }
        output = decoded;
        self.postMessage({ type: 'chunk', id, data: decoded });
      } else if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          output += chunk;
          self.postMessage({ type: 'chunk', id, data: chunk });
        }
        // Flush the decoder
        const tail = decoder.decode();
        if (tail) {
          output += tail;
          self.postMessage({ type: 'chunk', id, data: tail });
        }
      } else {
        const text = await response.text();
        output = text;
        self.postMessage({ type: 'chunk', id, data: text });
      }

      self.postMessage({
        type: 'done',
        id,
        ok: response.ok,
        status: response.status,
        output,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        self.postMessage({ type: 'cancelled', id });
      } else {
        self.postMessage({
          type: 'error',
          id,
          message: (err && err.message) || 'Worker fetch failed',
        });
      }
    } finally {
      controllers.delete(id);
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (msg.type === 'cancel') {
    const ctrl = controllers.get(msg.id);
    if (ctrl) ctrl.abort();
  }
});
