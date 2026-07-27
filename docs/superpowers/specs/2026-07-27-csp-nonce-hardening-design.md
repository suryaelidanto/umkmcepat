# Spec: CSP Nonce & Sandbox Hardening

## Context & Problem
Commit `29e7420` added `script-src 'self'` globally. 
1. **Control Plane Blank**: TanStack Start SSR relies on inline hydration/barrier scripts without nonces. Page loading hangs on spinner.
2. **Turnstile / Umami Broken**: Blocked by missing external domains in script-src.
3. **Previews / Generated Sites Blank**: Sandboxed iframe without `allow-same-origin` acts as opaque origin. `'self'` never matches opaque origin, blocking the bundle itself. JSON-LD scripts blocked.
4. **Alarms Unwired**: `/api/csp-violation` exists but is never targeted by a report header, and would be blocked by CSRF check if it was.

## Proposed Changes

### 1. Per-request Nonce
* Store random 128-bit base64 nonce in `AsyncLocalStorage` via `src/lib/csp-nonce.ts` on server request.
* Inject via `securityMiddleware` in `src/start.ts` wrapping `next()`.
* Retrieve via `getRouter()` in `src/router.tsx` to set `ssr: { nonce }`.
* Manually apply to raw JSX scripts (JSON-LD, Umami) in `src/routes/__root.tsx`.

### 2. CSP Policy Restructuring
* **Control Plane**: `script-src 'nonce-<value>' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation`
* **Private Preview / Assets**: Drop `script-src` to support opaque sandboxed origin. Keep `sandbox allow-scripts`. Add `Content-Security-Policy-Report-Only` reporting to `/api/csp-violation` with strict settings for visibility.
* **Generated Origin**: Drop `script-src`. Keep host isolation. Add `Content-Security-Policy-Report-Only`.

### 3. Edge-Case Fixes
* **CSRF Exemption**: Add `/api/csp-violation` to `isCrossSiteMutation` exemptions.
* **Cache Control**: Ensure `Cache-Control: no-store, no-cache, must-revalidate` on control-plane HTML to prevent nonce cache.
* **Report Body Protection**: Cap POST payload size on `/api/csp-violation`.

## Verification Plan
1. Home page loads, hydrates, console clean.
2. Login consent loads Cloudflare Turnstile correctly.
3. Project editor preview iframe loads successfully with annotation bridge working.
4. Generated site loads successfully.
5. `/api/csp-violation` accepts payload without CSRF block.
