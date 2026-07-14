import { devLog } from "@/lib/dev-log";
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

type ProxyDeploymentRequestInput = {
  assetRewrite?: {
    projectId: string;
  };
  deploymentId: string;
  deploymentStatus: string;
  noindex?: boolean;
  pathSegments: string[];
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
    input.assetRewrite &&
    runtimeResponse.status === 200 &&
    headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    headers.delete("content-length");

    return new Response(
      injectPreviewAnnotationBridge(
        rewritePreviewAssetUrls(await runtimeResponse.text(), {
          deploymentId: input.deploymentId,
          projectId: input.assetRewrite.projectId,
        }),
      ),
      {
        headers,
        status: runtimeResponse.status,
        statusText: runtimeResponse.statusText,
      },
    );
  }

  return new Response(runtimeResponse.body, {
    headers,
    status: runtimeResponse.status,
    statusText: runtimeResponse.statusText,
  });
}

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
  const script = `<script data-umkm-annotation-bridge>${PREVIEW_ANNOTATION_BRIDGE}</script>`;

  if (html.includes("data-umkm-annotation-bridge")) {
    return html;
  }

  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
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

const PREVIEW_ANNOTATION_BRIDGE = String.raw`
(() => {
  if (window.__umkmAnnotationBridge) return;
  window.__umkmAnnotationBridge = true;

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

  function elementAt(x, y) {
    const elements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)];

    for (let element of elements) {
      while (element && element.shadowRoot) {
        const deeper = element.shadowRoot.elementFromPoint(x, y);
        if (!deeper || deeper === element) break;
        element = deeper;
      }

      if (!(element instanceof HTMLElement) || shouldIgnore(element)) continue;
      const target = meaningfulElement(element);
      if (target) return target;
    }

    return null;
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
    const target =
      element instanceof HTMLElement && (isLeafTarget(element) || isAtomicBlock(element))
        ? meaningfulElement(element)
        : pointed;

    return target ? { rect, target, text: text.slice(0, 500) } : null;
  }

  function shouldIgnore(element) {
    if (element.closest('.umkm-annotation-marker,.umkm-annotation-hover')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;

    const className = typeof element.className === 'string' ? element.className : '';
    const isDecoration = /(backdrop|decoration|gradient|glow|overlay|veil)/i.test(className);
    const hasText = Boolean(clean(element.innerText || element.textContent || ''));
    const isInteractive = element.matches('a,button,input,select,textarea,[role="button"]');

    return isDecoration && !hasText && !isInteractive;
  }

  function meaningfulElement(element) {
    if (shouldIgnore(element)) return null;

    const interactive = element.closest('button,a,input,select,textarea,[role="button"]');
    if (interactive instanceof HTMLElement) return interactive;

    const atomic = closestAtomicBlock(element);
    if (atomic && atomic !== element && isInlineAtomicBlock(atomic)) return atomic;

    let current = element;
    while (current && current !== document.body) {
      if (isLeafTarget(current)) return current;
      if (isAtomicBlock(current)) return current;
      current = current.parentElement;
    }

    const container = element.closest('article,[role="listitem"],section,nav,header,footer,main,aside,[aria-label]');
    return container instanceof HTMLElement ? container : element;
  }

  function isLeafTarget(element) {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) || /^(p|label|li|blockquote|figcaption|caption|img|picture|video|svg)$/.test(tag)) return true;
    if (tag === 'span') {
      const parent = element.parentElement;
      return Boolean(clean(element.innerText || element.textContent || '')) &&
        !(parent && parent.matches('a,button,h1,h2,h3,h4,h5,h6,p,label,li,blockquote,figcaption'));
    }

    return tag === 'div' && isTextOnlyElement(element);
  }

  function isTextOnlyElement(element) {
    const text = clean(element.innerText || element.textContent || '');
    if (!text) return false;

    return !element.querySelector('a,article,button,h1,h2,h3,h4,h5,h6,img,input,li,p,section,textarea,video');
  }

  function closestAtomicBlock(element) {
    let current = element;
    while (current && current !== document.body) {
      if (isAtomicBlock(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isAtomicBlock(element) {
    if (element.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;

    const className = typeof element.className === 'string' ? element.className : '';
    return /(^|[-_\\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\\s]|$)/i.test(className);
  }

  function isInlineAtomicBlock(element) {
    const className = typeof element.className === 'string' ? element.className : '';
    return /(^|[-_\\s])(badge|capsule|chip|pill|tag)([-_\\s]|$)/i.test(className);
  }

  function targetData(element, selection) {
    const rect = selection ? selection.rect : element.getBoundingClientRect();
    const text = clean(element.innerText || element.textContent || '');
    const selected = selection ? selection.text : '';
    return {
      label: labelFor(element, selected || text),
      selectedText: selected || undefined,
      target: {
        boundingBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        classes: typeof element.className === 'string' ? clean(element.className).slice(0, 300) : '',
        nearbyText: nearbyText(element),
        selectorPath: selectorPath(element),
        tag: element.tagName.toLowerCase(),
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
    setHoverBox(selection ? selection.rect : element.getBoundingClientRect());
    window.parent.postMessage({ type: 'umkmcepat-annotation-hover', payload: targetData(element, selection) }, '*');
  }

  function handleClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = selectionAt(event.clientX, event.clientY);
    const element = selection ? selection.target : elementAt(event.clientX, event.clientY);
    if (!element) return;
    window.parent.postMessage({ type: 'umkmcepat-annotation-target', payload: targetData(element, selection) }, '*');
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
