# Security Audit Report: Allowed Origins and Content Security Policy (CSP)

This report details the rationale for the Content Security Policy implemented in the Stellar Web IDE. The CSP adheres to OWASP guidelines to mitigate Cross-Site Scripting (XSS), clickjacking, and unauthorized data injection, while safely enabling necessary capabilities for the IDE environment (such as the Monaco Editor and WASM compiler workers).

## CSP Directives Breakdown

### 1. `default-src 'self'`
- **Rationale:** The strict foundation of the policy. By default, all resources (scripts, images, stylesheets, connections, etc.) are restricted to the same origin (`self`). Any deviation from this must be explicitly authorized by another directive.

### 2. `script-src 'self' 'unsafe-eval' 'unsafe-inline'`
- **`self`**: Core application logic loads securely from the same origin.
- **`unsafe-eval`**: 
  - **Why it is strictly necessary:** The IDE runs a local Rust compiler powered by WebAssembly. Initializing and instantiating a WebAssembly module (`WebAssembly.compile()`) natively evaluates code. Without `unsafe-eval`, WASM initialization is blocked by the browser engine. Additionally, Next.js utilizes some evaluation during dev mode module replacement.
- **`unsafe-inline`**:
  - **Why it is strictly necessary:** Monaco Editor (which powers the code editing experience) uses dynamically injected `<script>` tags for web worker bootstrapping. Next.js router also requires some inline script handling.

### 3. `style-src 'self' 'unsafe-inline'`
- **Why it is strictly necessary:** The Monaco Editor dynamically creates CSS rules and injects `<style>` blocks into the DOM to power syntax highlighting, hover popups, and diff views. Tailwind CSS also heavily relies on inline style generation for dynamic components and theme switching.

### 4. `img-src 'self' blob: data:`
- **Rationale:** Allows standard image assets from the origin (`self`).
- **`blob:` and `data:`**: Required for dynamically rendered local images, SVGs generated at runtime, and in-memory assets (e.g. previewing user-uploaded assets in the IDE without a roundtrip to a server).

### 5. `font-src 'self' data:`
- **Rationale:** Limits custom web fonts (like Inter or JetBrains Mono) to be served from the application origin or natively embedded via base64 encoded data URIs.

### 6. `worker-src 'self' blob:`
- **Rationale:** Restricts background Web Workers to the origin.
- **`blob:`**: Required by Monaco Editor, which creates Web Workers for language services (TypeScript, JSON, CSS, HTML, etc.) dynamically via `URL.createObjectURL(blob)`. If blocked, the editor's autocomplete and syntax validation would permanently crash.

### 7. `connect-src 'self' https: wss:`
- **Rationale:** Restricts XHR, Fetch, and WebSocket connections to the origin and explicitly secure channels (`https:` and `wss:`). This guarantees that any RPC interactions, Live Share, or external backend requests happen securely.

### 8. `object-src 'none'`
- **Rationale:** Prevents the browser from executing legacy plugins (such as Flash or Java applets) embedded in `<object>` or `<embed>` tags. OWASP strongly recommends disabling these.

### 9. `base-uri 'self'`
- **Rationale:** Protects against `<base>` tag injection attacks, preventing attackers from hijacking relative URLs by changing the document's base URL.

### 10. `form-action 'self'`
- **Rationale:** Prevents forms from being hijacked to POST sensitive data to malicious third-party endpoints.

### 11. `frame-ancestors 'none'`
- **Rationale:** Protects against clickjacking. This tells the browser that the IDE application should *never* be embedded inside an `<iframe>` on any other site.

### 12. `upgrade-insecure-requests`
- **Rationale:** Instructs the browser to transparently upgrade any insecure `http://` requests to `https://`, preventing mixed content vulnerabilities in the IDE payload.

---

## Conclusion
The implemented CSP strikes a necessary balance for a powerful Web IDE. While `'unsafe-eval'` and `'unsafe-inline'` are utilized, they are explicitly sandboxed by the rest of the policy (e.g. disallowing external scripts) to ensure the surface area for injection attacks is effectively closed off.