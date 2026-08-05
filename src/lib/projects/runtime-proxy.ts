import { devLog } from "@/lib/dev-log";
import { escapeHtml } from "@/lib/escape-html";
import {
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
} from "@/lib/projects/placeholders";
import {
  createPreviewAssetToken,
  PREVIEW_ASSET_TOKEN_PARAM,
} from "@/lib/projects/preview-asset-token";
import { fetchRuntime } from "@/lib/projects/runtime-network";
import {
  getRuntimeSupervisor,
  type RuntimeSupervisor,
} from "@/lib/projects/runtime-supervisor";
import { assertRuntimeTargetAllowed } from "@/lib/projects/runtime-target-policy";

export { pickPlaceholderDataUri };

type ProxyDeploymentRequestInput = {
  assetRewrite?: {
    projectId: string;
  };
  businessName?: string | null;
  deploymentId: string;
  deploymentStatus: string;
  noindex?: boolean;
  pathSegments: string[];
  publicAssetRewrite?: {
    slug: string;
  };
  request: Request;
  supervisor?: RuntimeSupervisor;
};

export async function proxyDeploymentRequest(
  input: ProxyDeploymentRequestInput,
) {
  const supervisor = input.supervisor ?? getRuntimeSupervisor();
  devLog("runtime-proxy", "request", {
    deploymentId: input.deploymentId,
    path: input.pathSegments.join("/") || "index.html",
    status: input.deploymentStatus,
  });
  const checkedStatus =
    input.deploymentStatus === "running"
      ? await supervisor.getDeploymentStatus(input.deploymentId)
      : input.deploymentStatus;
  const status =
    checkedStatus === "running"
      ? checkedStatus
      : await supervisor.startDeployment(input.deploymentId);

  if (status !== "running") {
    devLog("runtime-proxy", "not-running", {
      deploymentId: input.deploymentId,
      status,
    });
    return null;
  }

  const target = await supervisor.resolveDeploymentTarget(input.deploymentId);

  if (!target) {
    devLog("runtime-proxy", "missing-target", {
      deploymentId: input.deploymentId,
    });
    return null;
  }

  let targetUrl: URL;

  try {
    targetUrl = assertRuntimeTargetAllowed(target);
  } catch (error) {
    devLog("runtime-proxy", "target-rejected", {
      deploymentId: input.deploymentId,
      error: error instanceof Error ? error.message : "invalid target",
    });
    return null;
  }

  const requestUrl = new URL(input.request.url);
  const runtimeUrl = new URL(encodeRuntimePath(input.pathSegments), targetUrl);

  runtimeUrl.search = requestUrl.search;

  let runtimeResponse: Response;

  try {
    runtimeResponse = await fetchRuntime(runtimeUrl, {
      kind: "proxy",
      signal: input.request.signal,
    });
  } catch (error) {
    devLog("runtime-proxy", "network-failed", {
      deploymentId: input.deploymentId,
      error: error instanceof Error ? error.name : "unknown",
      path: runtimeUrl.pathname,
    });
    return null;
  }

  devLog("runtime-proxy", "response", {
    deploymentId: input.deploymentId,
    path: runtimeUrl.pathname,
    status: runtimeResponse.status,
  });
  const headers = new Headers(runtimeResponse.headers);

  applyPreviewSandboxHeaders(headers, { noindex: input.noindex ?? true });

  if (
    (input.assetRewrite || input.publicAssetRewrite) &&
    runtimeResponse.status === 200 &&
    headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    headers.delete("content-length");
    const originalHtml = await runtimeResponse.text();

    const rewrittenHtml = input.assetRewrite
      ? injectPreviewAnnotationBridge(
          rewritePreviewAssetUrls(originalHtml, {
            deploymentId: input.deploymentId,
            projectId: input.assetRewrite.projectId,
          }),
        )
      : input.publicAssetRewrite
        ? injectPublishedHead(
            rewritePublicAssetUrls(originalHtml, input.publicAssetRewrite.slug),
            {
              businessName: input.businessName,
              noindex: input.noindex ?? false,
              slug: input.publicAssetRewrite.slug,
            },
          )
        : originalHtml;

    return new Response(rewrittenHtml, {
      headers,
      status: runtimeResponse.status,
      statusText: runtimeResponse.statusText,
    });
  }

  return new Response(runtimeResponse.body, {
    headers,
    status: runtimeResponse.status,
    statusText: runtimeResponse.statusText,
  });
}

// Content-Security-Policy set here is overwritten later by applySecurityHeaders in the global securityMiddleware.
export function applyPreviewSandboxHeaders(
  headers: Headers,
  { noindex = true }: { noindex?: boolean } = {},
) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Security-Policy", "sandbox allow-scripts");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  if (noindex) {
    headers.set("X-Robots-Tag", "noindex");
  } else {
    headers.delete("X-Robots-Tag");
  }

  return headers;
}

function encodeRuntimePath(pathSegments: string[]) {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

export function injectPreviewAnnotationBridge(html: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const script = `<script data-umkm-annotation-bridge data-umkm-origin="${origin}">${PREVIEW_ANNOTATION_BRIDGE}</script>`;
  const editBridge = `<script data-umkm-edit-bridge data-umkm-origin="${origin}">${EDIT_MODE_BRIDGE}</script>`;
  const fallback = buildImageFallbackScript();

  if (html.includes("data-umkm-annotation-bridge")) {
    return html;
  }

  return html.includes("</body>")
    ? html.replace("</body>", `${script}${editBridge}${fallback}</body>`)
    : `${html}${script}${editBridge}${fallback}`;
}

export function buildImageFallbackScript(): string {
  return `<script data-umkm-image-fallback>(() => {
  const LANDSCAPE = ${JSON.stringify(PLACEHOLDER_DATA_URIS.landscape)};
  const PORTRAIT = ${JSON.stringify(PLACEHOLDER_DATA_URIS.portrait)};
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || t.dataset.umkmPlaceholder) return;
    t.dataset.umkmPlaceholder = '1';
    t.src = t.clientHeight > t.clientWidth ? PORTRAIT : LANDSCAPE;
  }, true);
})();</script>`;
}

export function rewritePreviewAssetUrls(
  html: string,
  {
    deploymentId,
    projectId,
  }: {
    deploymentId: string;
    projectId: string;
  },
) {
  const token = createPreviewAssetToken({ deploymentId, projectId });

  return html.replace(
    /\b(src|href)="\.\/assets\/([^"]+)"/g,
    (_match, attribute: string, assetPath: string) => {
      const encodedPath = assetPath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      return `${attribute}="/api/projects/${encodeURIComponent(projectId)}/assets/${encodedPath}?${PREVIEW_ASSET_TOKEN_PARAM}=${encodeURIComponent(token)}"`;
    },
  );
}

/**
 * Rewrite generated HTML's relative `./assets/...` URLs to absolute public
 * paths (`/p/<slug>/assets/...`). The public route's splat handler proxies
 * each asset back to the same runtime, so the site renders end-to-end on the
 * published URL.
 */
export function rewritePublicAssetUrls(html: string, slug: string) {
  return html.replace(
    /\b(src|href)="\.\/assets\/([^"]+)"/g,
    (_match, attribute: string, assetPath: string) => {
      const encodedPath = assetPath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      return `${attribute}="/p/${encodeURIComponent(slug)}/assets/${encodedPath}"`;
    },
  );
}

// Inject a per-page <title>/meta/og/canonical/LocalBusiness JSON-LD into the
// published site's <head> so each published UMKM site is an indexable landing
// page (long-tail organic surface). No-op if <head> is absent.
export function injectPublishedHead(
  html: string,
  {
    businessName,
    noindex,
    slug,
  }: { businessName?: string | null; noindex: boolean; slug: string },
) {
  const origin =
    process.env.GENERATED_PUBLIC_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  const name = businessName || "UMKM Cepat";
  const title = `${name} — Website UMKM Cepat`;
  const description = `Website usaha ${name}. Dibuat dengan UMKM Cepat.`;
  const url = `${origin}/p/${encodeURIComponent(slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url,
  };
  const headInjection = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    noindex ? `<meta name="robots" content="noindex" />` : "",
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\/script>/gi, "<\\/script>")}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");
  return html.replace(
    /<head>/i,
    `<head>\n    ${buildImageFallbackScript()}\n    ${headInjection}`,
  );
}

export type PreviewAnnotationCandidate = {
  annotatable?: boolean;
  className?: string;
  directText?: string;
  hasClickHandler?: boolean;
  ignored?: boolean;
  role?: string | null;
  tag: string;
  text?: string;
};

export function pickPreviewAnnotationCandidateIndex(
  candidates: PreviewAnnotationCandidate[],
) {
  const usable = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((item) => !item.candidate.ignored);

  return (
    findCandidateIndex(usable, isPreviewInteractiveCandidate) ??
    findCandidateIndex(usable, isPreviewMediaCandidate) ??
    usable[0]?.index ??
    -1
  );
}

function findCandidateIndex(
  candidates: Array<{ candidate: PreviewAnnotationCandidate; index: number }>,
  predicate: (candidate: PreviewAnnotationCandidate) => boolean,
) {
  return candidates.find((item) => predicate(item.candidate))?.index;
}

function isPreviewInteractiveCandidate(candidate: PreviewAnnotationCandidate) {
  return (
    /^(button|a|input|select|textarea)$/.test(candidate.tag) ||
    candidate.role === "button" ||
    Boolean(candidate.hasClickHandler)
  );
}

function isPreviewMediaCandidate(candidate: PreviewAnnotationCandidate) {
  return /^(img|picture|video|svg)$/.test(candidate.tag);
}

const PREVIEW_ANNOTATION_BRIDGE = String.raw`
(() => {
  if (window.__umkmAnnotationBridge) return;
  window.__umkmAnnotationBridge = true;

  // The control-plane origin (set by the parent via data-umkm-origin).
  // postMessage targets this instead of '*' so annotation payloads stay
  // scoped to the UMKM Cepat parent, not any listener.
  const bridgeScript = document.currentScript || document.querySelector('script[data-umkm-annotation-bridge]');
  const PARENT_ORIGIN = bridgeScript ? bridgeScript.getAttribute('data-umkm-origin') || '*' : '*';

  let active = false;
  let hoverBox = null;
  const markers = new Map();

  const style = document.createElement('style');
  style.textContent = '.umkm-annotation-hover{position:absolute;z-index:2147483646;pointer-events:none;border:2px solid #8fd3ff;border-radius:10px;background:rgba(143,211,255,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.02)}.umkm-annotation-marker{position:absolute;z-index:2147483645;display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#fcfbf8;color:#10100f;font:700 12px ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);border:1px solid rgba(0,0,0,.14)}.umkm-annotation-active *{cursor:crosshair!important}';
  document.head.appendChild(style);

  function ensureHoverBox() {
    if (hoverBox) return hoverBox;
    hoverBox = document.createElement('div');
    hoverBox.className = 'umkm-annotation-hover';
    hoverBox.hidden = true;
    document.body.appendChild(hoverBox);
    return hoverBox;
  }

  function setHoverBox(rect) {
    const box = ensureHoverBox();
    box.hidden = false;
    box.style.left = String(rect.left + window.scrollX) + 'px';
    box.style.top = String(rect.top + window.scrollY) + 'px';
    box.style.width = String(rect.width) + 'px';
    box.style.height = String(rect.height) + 'px';
  }

  function hideHoverBox() {
    if (hoverBox) hoverBox.hidden = true;
  }

  function deepElementFromPoint(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element instanceof HTMLElement && element.shadowRoot) {
      const deeper = element.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === element) break;
      element = deeper;
    }
    return element instanceof HTMLElement ? element : null;
  }

  function elementAt(x, y) {
    const element = deepElementFromPoint(x, y);
    return element ? pickElement(element) : null;
  }

  function selectionAt(x, y) {
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const text = clean(selection.toString());
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const containsPoint = rects.some((rect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    );
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;

    const node = range.commonAncestorContainer;
    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (!containsPoint) return null;

    const pointed = elementAt(x, y);
    const target = element instanceof HTMLElement ? pickElement(element) || pointed : pointed;

    return target ? { rect, target, text: text.slice(0, 500) } : null;
  }

  function pickElement(element) {
    if (isBridgeUi(element)) return null;

    const interactive = closestElement(element, 'button,a,input,select,textarea,[role="button"],[onclick]');
    if (interactive) return interactive;

    const media = closestElement(element, 'img,picture,video,svg');
    if (media && !isIgnorableDecoration(media)) return media;

    if (!isIgnorableDecoration(element)) return element;

    const atomic = closestAtomicBlock(element);
    if (atomic) return atomic;

    const container = closestElement(element, 'section,nav,header,footer,main,aside,[aria-label]');
    return container || element;
  }

  function closestElement(element, selector) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && current.matches(selector) && !isBridgeUi(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isBridgeUi(element) {
    if (element.closest('.umkm-annotation-marker,.umkm-annotation-hover')) return true;
    return false;
  }

  function isIgnorableDecoration(element) {
    if (element.getAttribute('aria-hidden') === 'true') return true;

    const className = typeof element.className === 'string' ? element.className : '';
    const isDecoration = /(backdrop|decoration|gradient|glow|overlay|veil)/i.test(className);
    const hasText = Boolean(clean(element.innerText || element.textContent || ''));
    const isInteractive = element.matches('a,button,input,select,textarea,[role="button"],[onclick]');

    return isDecoration && !hasText && !isInteractive;
  }

  function closestAtomicBlock(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && !isIgnorableDecoration(current) && isAtomicBlock(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isAtomicBlock(element) {
    if (element.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;

    const className = typeof element.className === 'string' ? element.className : '';
    if (/(^|[\s_-])(body|container|content|inner|padding|wrapper)([\s_-]|$)/i.test(className)) return false;
    return /(^|[\s_-])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([\s_-]|$)/i.test(className);
  }

  function targetData(element, selection) {
    const rect = selection ? selection.rect : element.getBoundingClientRect();
    const text = clean(element.innerText || element.textContent || '');
    const selected = selection ? selection.text : '';
    const tag = element.tagName.toLowerCase();
    const src = /^(img|picture|svg)$/.test(tag)
      ? (element.currentSrc || element.getAttribute('src') || element.src || '')
      : '';
    return {
      label: labelFor(element, selected || text),
      selectedText: selected || undefined,
      target: {
        boundingBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        classes: typeof element.className === 'string' ? clean(element.className).slice(0, 300) : '',
        nearbyText: nearbyText(element),
        selectorPath: selectorPath(element),
        ...(src ? { src } : {}),
        tag,
        text: text.slice(0, 300),
      },
    };
  }

  function labelFor(element, text) {
    const tag = element.tagName.toLowerCase();
    const snippet = text ? ' — "' + text.slice(0, 60) + (text.length > 60 ? '…' : '') + '"' : '';
    if (tag === 'h1') return 'Judul utama' + snippet;
    if (/^h[2-6]$/.test(tag)) return 'Judul bagian' + snippet;
    if (tag === 'button' || tag === 'a' || element.getAttribute('role') === 'button') return 'Tombol' + snippet;
    if (/^(img|picture|video|svg)$/.test(tag)) return 'Gambar' + snippet;
    if (/^(p|span|label|li|blockquote|figcaption|caption)$/.test(tag)) return 'Teks' + snippet;
    if (tag === 'article' || element.getAttribute('role') === 'listitem') return 'Kartu' + snippet;
    if (tag === 'section') return 'Bagian' + snippet;
    return 'Bagian website' + snippet;
  }

  function selectorPath(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += '#' + current.id.replace(/[^a-zA-Z0-9_-]/g, '');
      } else {
        const classes = typeof current.className === 'string' ? current.className.split(/\s+/) : [];
        const cls = classes.find((name) =>
          /^[a-z][a-z0-9_-]{2,}$/i.test(name) &&
          !/(^css-|__[a-z0-9_-]{5,}$)/i.test(name),
        );
        if (cls) part += '.' + cls;

        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName)
          : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function nearbyText(element) {
    const texts = [];
    for (const item of [element.previousElementSibling, element, element.nextElementSibling]) {
      if (!item) continue;
      const value = clean(item.innerText || item.textContent || '');
      if (value) texts.push(value.slice(0, 160));
    }
    return texts.join(' | ').slice(0, 500);
  }

  function clean(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function handleMove(event) {
    if (!active) return;
    const selection = selectionAt(event.clientX, event.clientY);
    const element = selection ? selection.target : elementAt(event.clientX, event.clientY);
    if (!element) {
      hideHoverBox();
      return;
    }

    const rect = selection ? selection.rect : element.getBoundingClientRect();
    setHoverBox(rect);
    window.parent.postMessage({ type: 'umkmcepat-annotation-hover', payload: targetData(element, selection) }, PARENT_ORIGIN);
  }

  function handleClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = selectionAt(event.clientX, event.clientY);
    const element = selection ? selection.target : elementAt(event.clientX, event.clientY);
    if (!element) return;
    window.parent.postMessage({ type: 'umkmcepat-annotation-target', payload: targetData(element, selection) }, PARENT_ORIGIN);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'umkmcepat-annotation-mode') {
      active = Boolean(data.active);
      document.documentElement.classList.toggle('umkm-annotation-active', active);
      if (!active) hideHoverBox();
    }
    if (data.type === 'umkmcepat-annotation-markers') {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      for (const item of data.annotations || []) {
        const rect = item.target && item.target.boundingBox;
        if (!rect) continue;
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'umkm-annotation-marker';
        marker.textContent = String(item.index);
        marker.style.left = String(rect.x + window.scrollX) + 'px';
        marker.style.top = String(rect.y + window.scrollY) + 'px';
        marker.setAttribute('aria-label', 'Komentar ' + item.index);
        document.body.appendChild(marker);
        markers.set(item.id, marker);
      }
    }
  });

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('click', handleClick, true);
})();
`;

const EDIT_MODE_BRIDGE = String.raw`(() => {
  const PARENT_ORIGIN = document.currentScript?.getAttribute('data-umkm-origin') || '*';
  let active = false;
  let removedIds = new Set();
  const blocks = new Map();
  let idCounter = 0;

  const ATOMIC_RE = /(^|[-_\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\s]|$)/i;
  function isAtomicBlock(el) {
    if (el.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;
    if (el.tagName === 'SECTION') return true;
    const className = typeof el.className === 'string' ? el.className : '';
    if (/(^|[\s_-])(body|container|content|inner|padding|wrapper)([\s_-]|$)/i.test(className)) return false;
    return ATOMIC_RE.test(className);
  }

  function parentIdOf(el) {
    const parent = el.parentElement;
    if (!parent) return 'body';
    return parent.id || parent.tagName.toLowerCase();
  }

  function selectorPath(el) {
    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += '#' + current.id.replace(/[^a-zA-Z0-9_-]/g, '');
      } else {
        const classes = typeof current.className === 'string' ? current.className.split(/\s+/) : [];
        const cls = classes.find((n) => /^[a-z][a-z0-9_-]{2,}$/i.test(n) && !/(^css-|__[a-z0-9_-]{5,}$)/i.test(n));
        if (cls) part += '.' + cls;
        const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((i) => i.tagName === current.tagName) : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const snippet = text ? ' — "' + text + '"' : '';
    if (tag === 'section') return 'Bagian' + snippet;
    return 'Blok' + snippet;
  }

  function scan() {
    blocks.clear();
    document.querySelectorAll('[data-umkm-id]').forEach((el) => {
      const id = el.getAttribute('data-umkm-id');
      blocks.set(id, { element: el, label: labelFor(el), selectorPath: selectorPath(el), tag: el.tagName.toLowerCase() });
    });
  }

  function layout() {
    const parents = {};
    const parentRefs = {};
    const blockRefs = {};
    const byParent = new Map();
    blocks.forEach((info, id) => {
      const pid = parentIdOf(info.element);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(id);
      blockRefs[id] = { id, label: info.label, selectorPath: info.selectorPath, tag: info.tag };
      parentRefs[pid] = selectorPath(info.element.parentElement);
    });
    byParent.forEach((ids, pid) => { parents[pid] = ids; });
    return { parentRefs, parents, removed: Array.from(removedIds), blocks: blockRefs };
  }

  function post(type) {
    window.parent.postMessage({ type, payload: layout() }, PARENT_ORIGIN);
  }

  function applyLayout(next) {
    removedIds = new Set(next.removed || []);
    if (next.parents) {
      for (const pid of Object.keys(next.parents)) {
        const container = blocks.get(pid)?.element?.parentElement || document.body;
        const ordered = (next.parents[pid] || []).map((id) => blocks.get(id)?.element).filter(Boolean);
        ordered.forEach((el) => container.appendChild(el));
      }
    }
    blocks.forEach((info, id) => {
      const removed = removedIds.has(id);
      info.element.style.display = removed ? 'none' : '';
      info.element.setAttribute('data-umkm-removed', removed ? 'true' : 'false');
    });
  }

  function makeId() { idCounter += 1; return 'eb_' + Date.now().toString(36) + '_' + idCounter; }

  function findBlock(node) {
    let current = node;
    while (current && current.nodeType === 1 && current !== document.body) {
      const id = current.getAttribute && current.getAttribute('data-umkm-id');
      if (id && blocks.has(id)) return blocks.get(id);
      current = current.parentElement;
    }
    return null;
  }

  function ensureOverlays() {
    if (document.querySelector('[data-umkm-edit-overlay]')) return;
    const overlay = document.createElement('div');
    overlay.setAttribute('data-umkm-edit-overlay', 'true');
    overlay.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(overlay);

    document.addEventListener('mouseover', (e) => {
      if (!active) return;
      const block = findBlock(e.target);
      overlay.textContent = '';
      if (!block) return;
      const r = block.element.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;left:' + (r.left + window.scrollX) + 'px;top:' + (r.top + window.scrollY) + 'px;background:#0d9488;color:#fff;padding:2px 6px;font:12px system-ui;border-radius:4px;pointer-events:auto;cursor:grab;';
      badge.textContent = '⣿ ' + block.label;
      badge.draggable = true;
      badge.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', block.id); });
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'margin-left:6px;background:#b91c1c;border:0;color:#fff;cursor:pointer;border-radius:3px;padding:0 5px;pointer-events:auto;';
      closeBtn.addEventListener('click', () => {
        block.element.setAttribute('data-umkm-removed', 'true');
        block.element.style.display = 'none';
        removedIds.add(block.id);
        post('umkmcepat-edit-state');
      });
      badge.appendChild(closeBtn);
      overlay.appendChild(badge);
    });

    document.addEventListener('dragover', (e) => { if (active && e.target.closest && e.target.closest('[data-umkm-id]')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!active) return;
      const target = findBlock(e.target);
      const dragId = e.dataTransfer.getData('text/plain');
      if (!target || !dragId) return;
      e.preventDefault();
      const src = blocks.get(dragId)?.element;
      const dst = target.element;
      if (!src || src === dst) return;
      src.parentElement.insertBefore(src, dst.nextSibling);
      scan();
      post('umkmcepat-edit-state');
    });
  }

  function activate() {
    active = true;
    document.querySelectorAll('article, section, [data-umkm-annotatable]').forEach((el) => {
      if (!el.hasAttribute('data-umkm-id')) el.setAttribute('data-umkm-id', makeId());
    });
    scan();
    ensureOverlays();
    post('umkmcepat-edit-ready');
  }

  function deactivate() {
    active = false;
    const overlay = document.querySelector('[data-umkm-edit-overlay]');
    if (overlay) overlay.remove();
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'umkmcepat-edit-mode') {
      data.active ? activate() : deactivate();
    }
    if (data.type === 'umkmcepat-edit-layout' && data.layout) {
      scan();
      applyLayout(data.layout);
      post('umkmcepat-edit-state');
    }
  });
})();`;
