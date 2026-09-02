import { devLog } from "@/lib/dev-log";
import { escapeHtml } from "@/lib/escape-html";
import { pickPlaceholderDataUri } from "@/lib/projects/placeholders";
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
      ? injectPreviewHead(
          injectPreviewAnnotationBridge(
            rewritePreviewAssetUrls(originalHtml, {
              deploymentId: input.deploymentId,
              projectId: input.assetRewrite.projectId,
            }),
          ),
          { businessName: input.businessName },
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

// The preview iframe is sandboxed WITHOUT allow-same-origin (opaque origin),
export function applyPreviewSandboxHeaders(
  headers: Headers,
  { noindex = true }: { noindex?: boolean } = {},
) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
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

export type PreviewDocumentMetadata = {
  description: string;
  title: string;
  viewport: string;
};

export function getPreviewDocumentMetadata(
  businessName?: string | null,
): PreviewDocumentMetadata {
  const name = businessName?.trim() || "UMKM Cepat";
  return {
    description: `Website usaha ${name}.`,
    title: name,
    viewport: "width=device-width, initial-scale=1",
  };
}

export function injectPreviewHead(
  html: string,
  { businessName }: { businessName?: string | null } = {},
) {
  const metadata = getPreviewDocumentMetadata(businessName);
  const tags = [
    !/<title(?:\s|>)/i.test(html)
      ? `<title>${escapeHtml(metadata.title)}</title>`
      : "",
    !/<meta\s+name=["']description["']/i.test(html)
      ? `<meta name="description" content="${escapeHtml(metadata.description)}" />`
      : "",
    !/<meta\s+name=["']viewport["']/i.test(html)
      ? `<meta name="viewport" content="${metadata.viewport}" />`
      : "",
  ].filter(Boolean);

  if (!tags.length) {
    return html;
  }

  const injection = tags.join("\n    ");
  return /<head>/i.test(html)
    ? html.replace(/<head>/i, `<head>\n    ${injection}`)
    : `<head>\n    ${injection}\n  </head>\n${html}`;
}

export function injectPreviewAnnotationBridge(html: string) {
  const origin = "*";
  const script = `<script data-umkm-inspector-bridge data-umkm-origin="${origin}">${UNIFIED_INSPECTOR_BRIDGE}</script>`;
  const fallback = buildImageFallbackScript();

  if (
    html.includes("data-umkm-inspector-bridge") ||
    html.includes("data-umkm-annotation-bridge")
  ) {
    return html;
  }

  return html.includes("</body>")
    ? html.replace("</body>", `${script}${fallback}</body>`)
    : `${html}${script}${fallback}`;
}

export function buildImageFallbackScript(): string {
  return `<script data-umkm-image-fallback>(() => {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    t.style.display = 'none';
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
  const tokenParam = `${PREVIEW_ASSET_TOKEN_PARAM}=${encodeURIComponent(token)}`;

  return html
    .replace(
      /\b(src|href)="\.\/assets\/([^"]+)"/g,
      (_match, attribute: string, assetPath: string) => {
        const encodedPath = assetPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return `${attribute}="/api/projects/${encodeURIComponent(projectId)}/assets/${encodedPath}?${tokenParam}"`;
      },
    )
    .replace(
      /\b(src|href)="(?:(?:\.\/)?images\/([^"]+))"/g,
      (_match, attribute: string, assetPath: string) => {
        const encodedPath = assetPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return `${attribute}="/api/projects/${encodeURIComponent(projectId)}/assets/images/${encodedPath}?${tokenParam}"`;
      },
    );
}

export function rewritePublicAssetUrls(html: string, slug: string) {
  return html
    .replace(
      /\b(src|href)="\.\/assets\/([^"]+)"/g,
      (_match, attribute: string, assetPath: string) => {
        const encodedPath = assetPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return `${attribute}="/p/${encodeURIComponent(slug)}/assets/${encodedPath}"`;
      },
    )
    .replace(
      /\b(src|href)="(?:(?:\.\/)?images\/([^"]+))"/g,
      (_match, attribute: string, assetPath: string) => {
        const encodedPath = assetPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return `${attribute}="/p/${encodeURIComponent(slug)}/images/${encodedPath}"`;
      },
    );
}

export type PublishedDocumentMetadata = {
  description: string;
  name: string;
  title: string;
  viewport: string;
};

export function getPublishedDocumentMetadata(
  businessName?: string | null,
): PublishedDocumentMetadata {
  const name = businessName?.trim() || "UMKM Cepat";
  return {
    description: `Website usaha ${name}. Dibuat dengan UMKM Cepat.`,
    name,
    title: `${name} — Website UMKM Cepat`,
    viewport: "width=device-width, initial-scale=1",
  };
}

// Inject a per-page title, metadata, canonical, and LocalBusiness JSON-LD.
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
  const metadata = getPublishedDocumentMetadata(businessName);
  const url = `${origin}/p/${encodeURIComponent(slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: metadata.name,
    url,
  };
  const headInjection = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="viewport" content="${metadata.viewport}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    noindex ? `<meta name="robots" content="noindex" />` : "",
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\/script>/gi, "<\\/script>")}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");
  // The image-fallback script must always be present. Real Vite build output
  return html.match(/<head>/i)
    ? html.replace(
        /<head>/i,
        `<head>\n    ${buildImageFallbackScript()}\n    ${headInjection}`,
      )
    : `${html}\n    ${buildImageFallbackScript()}\n    ${headInjection}`;
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

const UNIFIED_INSPECTOR_BRIDGE = String.raw`
(() => {
  if (window.__umkmInspectorBridge) return;
  window.__umkmInspectorBridge = true;

  try {
    window.parent?.postMessage({ type: "umkmcepat-preview-ready" }, "*");
  } catch {}

  document.addEventListener('click', (e) => {
    const anchor = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#')) {
      e.preventDefault();
      const id = href.slice(1);
      const targetEl = id ? document.getElementById(id) : null;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (anchor.target === '_blank' || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    e.preventDefault();
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', href);
    }
  }, { capture: true });

  const bridgeScript = document.currentScript || document.querySelector('script[data-umkm-inspector-bridge]');
  const PARENT_ORIGIN = bridgeScript ? bridgeScript.getAttribute('data-umkm-origin') || '*' : '*';

  let active = false;
  let hoverBox = null;
  let selectedBox = null;
  let hoverBadge = null;
  let currentSelectedElement = null;
  let selectedId = null;
  let idCounter = 0;
  const blocks = new Map();
  const removedIds = new Set();

  const style = document.createElement('style');
  style.textContent = '.umkm-inspector-hover{position:absolute;z-index:2147483646;pointer-events:none;border:2px solid #38bdf8;border-radius:8px;background:rgba(56,189,248,0.08);box-shadow:0 0 0 1px rgba(255,255,255,0.2) inset;transition:all 0.04s ease-out;}.umkm-inspector-badge{position:absolute;z-index:2147483647;pointer-events:none;background:#0f172a;color:#f8fafc;padding:3px 8px;border-radius:6px;font:600 11px/1.2 ui-sans-serif,system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid rgba(56,189,248,0.4);white-space:nowrap;display:flex;align-items:center;gap:4px;transform:translateY(-100%);margin-top:-4px;}.umkm-inspector-badge .badge-component{color:#38bdf8;font-weight:700;}.umkm-inspector-selected{position:absolute;z-index:2147483647;pointer-events:none;border:2.5px solid #0284c7;border-radius:8px;box-shadow:0 0 0 4px rgba(2,132,199,0.25);}.umkm-inspector-active *{cursor:crosshair!important}';
  document.head.appendChild(style);

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getReactComponentAncestry(element) {
    if (!element) return [];
    const fiberKey = Object.keys(element).find((k) =>
      k.startsWith('__reactFiber' + String.fromCharCode(36)) || k.startsWith('__reactInternalInstance' + String.fromCharCode(36))
    );
    if (!fiberKey) return [];

    let fiber = element[fiberKey];
    const hierarchy = [];

    while (fiber) {
      if (fiber.type && typeof fiber.type !== 'string') {
        const name =
          fiber.type.displayName ||
          fiber.type.name ||
          fiber.type.render?.name;

        if (
          name &&
          !name.startsWith('_') &&
          !['Anonymous', 'Fragment', 'Provider', 'Context', 'Route', 'InnerLayout', 'Root'].includes(name)
        ) {
          hierarchy.unshift(name);
        }
      }
      fiber = fiber.return;
    }
    return Array.from(new Set(hierarchy));
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

  function closestElement(element, selector) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && current.matches(selector) && !isBridgeUi(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isBridgeUi(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    return Boolean(element.closest('.umkm-inspector-hover,.umkm-inspector-badge,.umkm-inspector-selected,.umkm-annotation-marker'));
  }

  function isIgnorableDecoration(element) {
    if (!element || !(element instanceof HTMLElement)) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    const className = typeof element.className === 'string' ? element.className : '';
    const isDecoration = /(backdrop|decoration|gradient|glow|overlay|veil)/i.test(className);
    const hasText = Boolean(clean(element.innerText || element.textContent || ''));
    const isInteractive = element.matches('a,button,input,select,textarea,[role="button"],[onclick]');
    return isDecoration && !hasText && !isInteractive;
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some((node) =>
      node.nodeType === Node.TEXT_NODE && clean(node.textContent || ''),
    );
  }

  function makeId() {
    idCounter += 1;
    return 'eb_' + Date.now().toString(36) + '_' + idCounter;
  }

  function isAtomicBlock(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (element.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;
    const className = typeof element.className === 'string' ? element.className : '';
    if (/(^|[\s_-])(body|container|content|inner|padding|wrapper)([\s_-]|$)/i.test(className)) return false;
    return /(^|[-_\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\s]|$)/i.test(className);
  }

  function closestAtomicBlock(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && !isIgnorableDecoration(current) && isAtomicBlock(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function pickElement(element) {
    if (!element || isBridgeUi(element) || element === document.body || element === document.documentElement) return null;

    if (element.tagName === 'IMG' || element.tagName === 'PICTURE') return element;

    // SVG Icon leaf detection
    if (element.tagName === 'svg' || element.tagName === 'path' || element.closest('svg')) {
      const svg = element.tagName === 'svg' ? element : element.closest('svg');
      if (svg && !isIgnorableDecoration(svg)) return svg;
    }

    const interactive = closestElement(element, 'button,a,input,select,textarea,[role="button"],[onclick]');
    if (interactive) return interactive;

    const childMedia = element.querySelector ? element.querySelector('img,picture,video,svg') : null;
    if (childMedia && !isIgnorableDecoration(childMedia) && !element.matches('section,main,article,body')) {
      const imgRect = childMedia.getBoundingClientRect();
      if (imgRect.width > 20 && imgRect.height > 20) {
        return childMedia;
      }
    }

    const text = closestElement(
      element,
      'h1,h2,h3,h4,h5,h6,p,label,li,blockquote,figcaption,caption,span,strong,em,b,i,small,code,pre,button,a',
    );
    if (text && !isIgnorableDecoration(text) && clean(text.innerText || text.textContent || '')) {
      return text;
    }

    const atomicCard = closestAtomicBlock(element);
    if (atomicCard) return atomicCard;

    if (!isIgnorableDecoration(element) && hasDirectText(element)) return element;

    return closestElement(element, 'article,header,footer,nav,section,[aria-label],[data-umkm-annotatable]') || element;
  }

  function structuralElement(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && (current.matches('section,article,header,footer,nav,[data-umkm-annotatable]') || isAtomicBlock(current))) return current;
      current = current.parentElement;
    }
    return element;
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

  function labelFor(element, text) {
    const tag = element.tagName.toLowerCase();
    const snippet = text ? ' — "' + text.slice(0, 60) + (text.length > 60 ? '…' : '') + '"' : '';
    if (tag === 'svg' || tag === 'path') return 'Ikon' + snippet;
    if (tag === 'h1') return 'Judul utama' + snippet;
    if (/^h[2-6]$/.test(tag)) return 'Judul bagian' + snippet;
    if (tag === 'button' || tag === 'a' || element.getAttribute('role') === 'button') return 'Tombol' + snippet;
    if (/^(img|picture|video)$/.test(tag)) return 'Gambar' + snippet;
    if (/^(p|span|label|li|blockquote|figcaption|caption)$/.test(tag)) return 'Teks' + snippet;
    if (tag === 'article' || element.getAttribute('role') === 'listitem') return 'Kartu' + snippet;
    if (tag === 'section') return 'Bagian' + snippet;
    return 'Bagian website' + snippet;
  }

  function getDirectText(element) {
    if (!element) return '';
    // 1. If element is a pure text leaf or button/heading/span, get its direct text or clean innerText
    if (element.children.length === 0) {
      return clean(element.textContent || '');
    }
    // 2. Direct text child nodes only
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE && clean(node.textContent || ''))
      .map((node) => clean(node.textContent || ''));

    if (directTextNodes.length > 0) {
      return directTextNodes.join(' ');
    }

    // 3. If it is an inline typography leaf (h1-h6, p, span, button, a) with small number of inline children (b, strong, span)
    if (/^(h[1-6]|p|span|button|a|label|li|b|strong|em|small)$/i.test(element.tagName) && element.children.length <= 3) {
      return clean(element.innerText || element.textContent || '');
    }

    // 4. Fallback: first text node or empty so it doesn't grab entire card/section content
    return '';
  }

  function targetData(element, selection) {
    const rect = selection ? selection.rect : element.getBoundingClientRect();
    const rawText = clean(element.innerText || element.textContent || '');
    const directText = getDirectText(element) || (selection ? selection.text : '') || rawText.slice(0, 120);
    const selected = selection ? selection.text : '';
    const tag = element.tagName.toLowerCase();
    const src = /^(img|picture|svg)$/.test(tag)
      ? (element.currentSrc || element.getAttribute('src') || element.src || '')
      : '';
    const componentHierarchy = getReactComponentAncestry(element);
    const primaryComponent = componentHierarchy.at(-1) || null;

    return {
      componentHierarchy,
      label: labelFor(element, selected || directText),
      primaryComponent,
      selectedText: selected || undefined,
      target: {
        boundingBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        classes: typeof element.className === 'string' ? clean(element.className).slice(0, 300) : '',
        componentHierarchy,
        nearbyText: nearbyText(element),
        primaryComponent,
        selectorPath: selectorPath(element),
        ...(src ? { src } : {}),
        tag,
        text: directText.slice(0, 300),
      },
    };
  }

  function parentIdOf(element) {
    const parent = element.parentElement;
    if (!parent) return 'body';
    return parent.id || parent.tagName.toLowerCase();
  }

  function ensureIds() {
    document.querySelectorAll('section,article,header,footer,nav,[data-umkm-annotatable]').forEach((element) => {
      if (!element.hasAttribute('data-umkm-id')) element.setAttribute('data-umkm-id', makeId());
    });
  }

  function scan() {
    blocks.clear();
    document.querySelectorAll('[data-umkm-id]').forEach((element) => {
      const id = element.getAttribute('data-umkm-id');
      blocks.set(id, { element, label: labelFor(element, clean(element.innerText || element.textContent || '')), selectorPath: selectorPath(element), tag: element.tagName.toLowerCase() });
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

  function deepElementsFromPoint(x, y) {
    if (typeof document.elementsFromPoint === 'function') {
      return Array.from(document.elementsFromPoint(x, y)).filter(
        (el) => el instanceof HTMLElement && !isBridgeUi(el),
      );
    }
    const single = deepElementFromPoint(x, y);
    return single ? [single] : [];
  }

  function pickTargetCandidates(x, y) {
    const elements = deepElementsFromPoint(x, y);
    if (!elements.length) return null;

    let primaryElement = null;
    let nearbyImageElement = null;

    for (const el of elements) {
      if (isIgnorableDecoration(el)) continue;

      if (!primaryElement) {
        primaryElement = pickElement(el);
      }

      if (!nearbyImageElement) {
        if (el.tagName === 'IMG' || el.tagName === 'PICTURE') {
          nearbyImageElement = el;
        } else {
          const img = el.querySelector ? el.querySelector('img,picture') : null;
          if (img && !isIgnorableDecoration(img)) {
            nearbyImageElement = img;
          }
        }
      }

      if (primaryElement && nearbyImageElement) break;
    }

    if (!primaryElement && !nearbyImageElement) return null;

    const chosen = primaryElement || nearbyImageElement;
    const baseData = targetData(chosen);
    baseData._element = chosen;

    if (nearbyImageElement && nearbyImageElement !== chosen) {
      const imgData = targetData(nearbyImageElement);
      baseData.underlyingImage = {
        label: imgData.label,
        selectorPath: imgData.target.selectorPath,
        src: imgData.target.src || '',
      };
    }

    return baseData;
  }

  function targetAt(x, y) {
    return pickTargetCandidates(x, y);
  }

  function post(type, payload) {
    window.parent.postMessage({ type, payload }, PARENT_ORIGIN);
  }

  function postState() {
    post('umkmcepat-edit-state', layout());
  }

  function ensureHoverBox() {
    if (hoverBox) return hoverBox;
    hoverBox = document.createElement('div');
    hoverBox.className = 'umkm-inspector-hover';
    hoverBox.hidden = true;
    document.body.appendChild(hoverBox);
    return hoverBox;
  }

  function ensureHoverBadge() {
    if (hoverBadge) return hoverBadge;
    hoverBadge = document.createElement('div');
    hoverBadge.className = 'umkm-inspector-badge';
    hoverBadge.hidden = true;
    document.body.appendChild(hoverBadge);
    return hoverBadge;
  }

  function setHoverBox(rect, target) {
    const box = ensureHoverBox();
    const badge = ensureHoverBadge();
    box.hidden = false;
    box.style.left = String(rect.left + window.scrollX) + 'px';
    box.style.top = String(rect.top + window.scrollY) + 'px';
    box.style.width = String(rect.width) + 'px';
    box.style.height = String(rect.height) + 'px';

    if (target) {
      badge.hidden = false;
      const comp = target.primaryComponent ? '<span class="badge-component">[' + target.primaryComponent + ']</span> ' : '';
      badge.innerHTML = comp + target.label.split(' — ')[0];
      badge.style.left = String(rect.left + window.scrollX) + 'px';
      badge.style.top = String(Math.max(24, rect.top + window.scrollY)) + 'px';
    } else {
      badge.hidden = true;
    }
  }

  function hideHoverBox() {
    if (hoverBox) hoverBox.hidden = true;
    if (hoverBadge) hoverBadge.hidden = true;
  }

  function ensureSelectedBox() {
    if (selectedBox) return selectedBox;
    selectedBox = document.createElement('div');
    selectedBox.className = 'umkm-inspector-selected';
    selectedBox.hidden = true;
    document.body.appendChild(selectedBox);
    return selectedBox;
  }

  function updateSelectedBoxPosition() {
    if (!currentSelectedElement || !selectedBox || selectedBox.hidden) return;
    const rect = currentSelectedElement.getBoundingClientRect();
    selectedBox.style.left = String(rect.left + window.scrollX) + 'px';
    selectedBox.style.top = String(rect.top + window.scrollY) + 'px';
    selectedBox.style.width = String(rect.width) + 'px';
    selectedBox.style.height = String(rect.height) + 'px';
  }

  function setSelectedBox(rect) {
    const box = ensureSelectedBox();
    box.hidden = false;
    box.style.left = String(rect.left + window.scrollX) + 'px';
    box.style.top = String(rect.top + window.scrollY) + 'px';
    box.style.width = String(rect.width) + 'px';
    box.style.height = String(rect.height) + 'px';
  }

  function hideSelectedBox() {
    currentSelectedElement = null;
    if (selectedBox) selectedBox.hidden = true;
  }

  function handleMove(event) {
    if (!active) return;
    const target = targetAt(event.clientX, event.clientY);
    if (target) setHoverBox(target.target.boundingBox, target);
    else hideHoverBox();
    post('umkmcepat-edit-hover', target);
    post('umkmcepat-annotation-hover', target);
  }

  function handleClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const data = pickTargetCandidates(event.clientX, event.clientY);
    const chosen = data ? data._element : deepElementFromPoint(event.clientX, event.clientY);
    currentSelectedElement = chosen;
    if (data && chosen) {
      setSelectedBox(chosen.getBoundingClientRect());
    } else if (data) {
      setSelectedBox(data.target.boundingBox);
    } else {
      hideSelectedBox();
    }
    const structural = chosen ? structuralElement(chosen) : null;
    if (structural && !structural.hasAttribute('data-umkm-id')) structural.setAttribute('data-umkm-id', makeId());
    scan();
    selectedId = structural?.getAttribute('data-umkm-id') || null;
    if (data) {
      const cleanPayload = { ...data };
      delete cleanPayload._element;
      post('umkmcepat-edit-target', cleanPayload);
      post('umkmcepat-annotation-target', cleanPayload);
    }
  }

  function moveSelected(direction) {
    if (!selectedId) return;
    const element = blocks.get(selectedId)?.element;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const siblings = Array.from(parent.children).filter((item) => item.hasAttribute('data-umkm-id') && item.style.display !== 'none');
    const index = siblings.indexOf(element);
    const other = siblings[index + direction];
    if (!other) return;
    if (direction < 0) parent.insertBefore(element, other);
    else parent.insertBefore(other, element);
    scan();
    postState();
  }

  function removeSelected() {
    if (!selectedId) return;
    const element = blocks.get(selectedId)?.element;
    if (!element) return;
    element.style.display = 'none';
    removedIds.add(selectedId);
    postState();
  }

  function updateElementText(selector, newText) {
    if (currentSelectedElement) {
      currentSelectedElement.innerText = newText;
      updateSelectedBoxPosition();
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      el.innerText = newText;
    }
  }

  function updateElementSrc(selector, newSrc) {
    if (currentSelectedElement && (currentSelectedElement.tagName === 'IMG' || currentSelectedElement.tagName === 'PICTURE')) {
      currentSelectedElement.src = newSrc;
      if (currentSelectedElement.currentSrc) currentSelectedElement.currentSrc = newSrc;
      updateSelectedBoxPosition();
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      el.src = newSrc;
    }
  }

  function moveElement(selector, direction) {
    let targetEl = currentSelectedElement || (selector ? document.querySelector(selector) : null);
    if (!targetEl || !targetEl.parentElement) return;

    // Climb up to nearest reorderable block when element has no siblings.
    while (targetEl && targetEl.parentElement && targetEl.parentElement !== document.body) {
      const siblings = Array.from(targetEl.parentElement.children).filter(
        (item) => !isBridgeUi(item) && item.style.display !== 'none',
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(targetEl);
        const targetIndex = index + direction;
        if (targetIndex >= 0 && targetIndex < siblings.length) {
          const other = siblings[targetIndex];
          if (direction < 0) {
            targetEl.parentElement.insertBefore(targetEl, other);
          } else {
            targetEl.parentElement.insertBefore(other, targetEl);
          }
          currentSelectedElement = targetEl;
          setSelectedBox(targetEl.getBoundingClientRect());
          return;
        }
      }
      targetEl = targetEl.parentElement;
    }
  }

  function removeElement(selector) {
    let targetEl = currentSelectedElement || (selector ? document.querySelector(selector) : null);
    if (!targetEl) return;
    targetEl.style.display = 'none';
    hideSelectedBox();
    hideHoverBox();
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'umkmcepat-edit-mode' || data.type === 'umkmcepat-annotation-mode' || data.type === 'umkmcepat-inspector-mode') {
      active = Boolean(data.active);
      if (active) {
        ensureIds();
        scan();
        post('umkmcepat-edit-ready', layout());
      }
      document.documentElement.classList.toggle('umkm-inspector-active', active);
      document.documentElement.style.cursor = active ? 'crosshair' : '';
      if (!active) {
        hideHoverBox();
        hideSelectedBox();
      }
    }
    if (data.type === 'umkmcepat-edit-hit-test' && typeof data.x === 'number' && typeof data.y === 'number') {
      post(data.intent === 'hover' ? 'umkmcepat-edit-hover' : 'umkmcepat-edit-target', targetAt(data.x, data.y));
    }
    if (data.type === 'umkmcepat-edit-action') {
      if (data.action === 'move-up') moveElement(data.selectorPath, -1);
      if (data.action === 'move-down') moveElement(data.selectorPath, 1);
      if (data.action === 'remove') removeElement(data.selectorPath);
      if (data.action === 'restore') {
        const el = document.querySelector(data.selectorPath);
        if (el) {
          el.style.display = '';
          updateSelectedBoxPosition();
        }
      }
      if (data.action === 'update-text' && typeof data.newText === 'string') {
        updateElementText(data.selectorPath, data.newText);
      }
      if (data.action === 'replace-image' && typeof data.newSrc === 'string') {
        updateElementSrc(data.selectorPath, data.newSrc);
      }
    }
  });

  function handleDblClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const element = deepElementFromPoint(event.clientX, event.clientY);
    const picked = element ? pickElement(element) : null;
    if (!picked) return;
    const target = targetData(picked);
    if (picked.tagName === 'IMG' || picked.tagName === 'PICTURE') {
      post('umkmcepat-edit-double-click-image', target);
    } else {
      post('umkmcepat-edit-target', target);
    }
  }

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('dblclick', handleDblClick, true);

  window.addEventListener('scroll', () => {
    updateSelectedBoxPosition();
    if (active && currentSelectedElement) {
      post('umkmcepat-edit-scroll', targetData(currentSelectedElement));
    }
  }, { passive: true });

  window.addEventListener('resize', updateSelectedBoxPosition, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) {
      hideSelectedBox();
      post('umkmcepat-edit-target', null);
    }
  });
})();
`;
