/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS browser subprocess. */
const { mkdirSync } = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright-core");

const { findContrastFailures } = require("./generated-site-contrast.cjs");

const [
  origin,
  routesJson = '["/"]',
  executablePath = "",
  timeoutRaw = "10000",
  evidenceDir = "",
] = process.argv.slice(2);
const timeout = Number(timeoutRaw);
const routes = JSON.parse(routesJson);
const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
};

if (
  !origin ||
  !evidenceDir ||
  !Array.isArray(routes) ||
  routes.length > 6 ||
  !Number.isInteger(timeout)
) {
  process.stderr.write("Invalid generated-site browser arguments.\n");
  process.exit(2);
}
mkdirSync(evidenceDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    args: ["--disable-gpu", "--no-default-browser-check", "--no-first-run"],
    executablePath: executablePath || undefined,
    headless: true,
    timeout,
  });
  const reports = [];
  try {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({
        colorScheme: "light",
        locale: "id-ID",
        reducedMotion: "reduce",
        timezoneId: "Asia/Jakarta",
        viewport,
      });
      try {
        for (const [routeIndex, routePath] of routes.entries()) {
          const errors = [];
          const page = await context.newPage();
          page.setDefaultNavigationTimeout(timeout);
          page.setDefaultTimeout(timeout);
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          await page.route("**/*", async (route) => {
            const requestUrl = new URL(route.request().url());
            const sourceUrl = new URL(origin);
            if (
              requestUrl.origin === sourceUrl.origin ||
              requestUrl.protocol === "data:" ||
              requestUrl.protocol === "blob:"
            ) {
              await route.continue();
            } else {
              await route.abort("blockedbyclient");
            }
          });
          const target = new URL(origin);
          target.hash = routePath === "/" ? "#/" : `#${routePath}`;
          let loaded = true;
          try {
            await page.goto(target.href, { waitUntil: "domcontentloaded" });
            await page.evaluate(() => document.fonts.ready);
          } catch (error) {
            loaded = false;
            errors.push(error instanceof Error ? error.message : String(error));
          }
          const metrics = loaded
            ? await page.evaluate(() => {
                const visible = (element) => {
                  const style = getComputedStyle(element);
                  const rect = element.getBoundingClientRect();
                  return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    rect.width > 0 &&
                    rect.height > 0
                  );
                };
                const headings = [...document.querySelectorAll("h1,h2,h3")];
                const images = [...document.images];
                const targets = [
                  ...document.querySelectorAll("a,button"),
                ].filter(visible);
                const anchors = [...document.querySelectorAll("a[href]")];
                const brokenInternalLinks = anchors.filter((anchor) => {
                  const href = anchor.getAttribute("href") || "";
                  if (!href.startsWith("#") || href.startsWith("#/")) {
                    return false;
                  }
                  const id = href.slice(1);
                  return Boolean(id) && !document.getElementById(id);
                }).length;
                const ctaCandidates = anchors.filter((anchor) => {
                  if (!visible(anchor)) {
                    return false;
                  }
                  const href = anchor.getAttribute("href") || "";
                  return (
                    /^(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)|tel:|mailto:)/i.test(
                      href,
                    ) ||
                    /hubungi|pesan|lihat|mulai|daftar|janji|konsultasi|whatsapp|chat/i.test(
                      anchor.textContent || "",
                    )
                  );
                });
                // The primary CTA is the most prominent action — the largest
                // visible matching anchor by area. Picking the first match
                // would flag a compact nav "Chat" button (size="sm") instead of
                // the hero CTA it represents, producing a false touch-target
                // failure. Largest-area wins; ties fall back to DOM order.
                let primaryCta = ctaCandidates[0];
                if (ctaCandidates.length > 1) {
                  let bestArea = -1;
                  for (const anchor of ctaCandidates) {
                    const rect = anchor.getBoundingClientRect();
                    const area = rect.width * rect.height;
                    if (area > bestArea) {
                      bestArea = area;
                      primaryCta = anchor;
                    }
                  }
                }
                const ctaAnchorSet = new Set(ctaCandidates);
                const firstTarget = targets[0];
                if (firstTarget instanceof HTMLElement) {
                  firstTarget.focus();
                }
                const focusStyle = firstTarget
                  ? getComputedStyle(firstTarget)
                  : null;
                const bodyStyle = getComputedStyle(document.body);
                const bodyColor = bodyStyle.color;
                const bodyBackground = bodyStyle.backgroundColor;
                const textElements = [
                  ...document.querySelectorAll(
                    "h1,h2,h3,h4,h5,h6,p,a,button,label,li,span",
                  ),
                ].filter((element) => {
                  if (
                    !visible(element) ||
                    element.getAttribute("aria-hidden") === "true"
                  ) {
                    return false;
                  }
                  return [...element.childNodes].some(
                    (node) =>
                      node.nodeType === Node.TEXT_NODE &&
                      (node.textContent || "").trim().length > 0,
                  );
                });
                const contrastEntries = textElements.flatMap((element) => {
                  let background = element;
                  let backgroundColor = null;
                  while (background) {
                    const style = getComputedStyle(background);
                    if (style.backgroundImage !== "none") {
                      return [];
                    }
                    const candidate = style.backgroundColor;
                    if (
                      candidate !== "transparent" &&
                      !/^rgba\\([^)]*,\\s*0\\s*\\)$/i.test(candidate)
                    ) {
                      backgroundColor = candidate;
                      break;
                    }
                    background = background.parentElement;
                  }
                  if (!backgroundColor) {
                    backgroundColor = bodyBackground;
                  }
                  const style = getComputedStyle(element);
                  return [
                    {
                      background: backgroundColor,
                      foreground: style.color,
                      fontSize: style.fontSize,
                      fontWeight: style.fontWeight,
                      label: `${element.tagName.toLowerCase()}: ${(
                        element.textContent || ""
                      )
                        .trim()
                        .slice(0, 80)}`,
                    },
                  ];
                });
                return {
                  textLength: (document.body.innerText || "").trim().length,
                  overflow:
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
                  headingOverflow: headings.some(
                    (heading) => heading.scrollWidth > heading.clientWidth + 1,
                  ),
                  brokenImages: images.filter(
                    (image) => !image.complete || image.naturalWidth === 0,
                  ).length,
                  brokenInternalLinks,
                  primaryCta: Boolean(primaryCta),
                  touchTargetDetail: targets
                    .filter((target) => {
                      if (
                        target instanceof HTMLAnchorElement &&
                        !ctaAnchorSet.has(target)
                      ) {
                        return false;
                      }
                      const rect = target.getBoundingClientRect();
                      return rect.width < 44 || rect.height < 44;
                    })
                    .map(
                      (target) =>
                        target.tagName +
                        ":" +
                        (target.textContent || "").trim().slice(0, 30) +
                        " " +
                        Math.round(target.getBoundingClientRect().width) +
                        "x" +
                        Math.round(target.getBoundingClientRect().height),
                    ),
                  touchTargets: targets.filter((target) => {
                    if (
                      target instanceof HTMLAnchorElement &&
                      !ctaAnchorSet.has(target)
                    ) {
                      return false;
                    }
                    const rect = target.getBoundingClientRect();
                    return rect.width < 44 || rect.height < 44;
                  }).length,
                  focusVisible:
                    !firstTarget ||
                    Boolean(
                      focusStyle &&
                      (focusStyle.outlineStyle !== "none" ||
                        focusStyle.boxShadow !== "none"),
                    ),
                  computedContrastKnown:
                    bodyColor !== "rgba(0, 0, 0, 0)" &&
                    bodyBackground !== "rgba(0, 0, 0, 0)",
                  contrastEntries,
                };
              })
            : {
                textLength: 0,
                overflow: 0,
                headingOverflow: false,
                brokenImages: 0,
                brokenInternalLinks: 0,
                primaryCta: false,
                touchTargets: 0,
                focusVisible: false,
                computedContrastKnown: false,
                contrastEntries: [],
              };
          const contrastFailures = findContrastFailures(
            metrics.contrastEntries,
          );
          const assertions = [
            { name: "route-load", status: loaded ? "pass" : "fail" },
            {
              name: "console-clean",
              status: errors.length ? "fail" : "pass",
              detail: errors.slice(0, 3).join("; ") || undefined,
            },
            {
              name: "required-content-visible",
              status: metrics.textLength > 20 ? "pass" : "fail",
            },
            {
              name: "primary-cta",
              status: metrics.primaryCta ? "pass" : "fail",
            },
            {
              name: "internal-links",
              status: metrics.brokenInternalLinks ? "fail" : "pass",
              detail: String(metrics.brokenInternalLinks),
            },
            {
              name: "horizontal-overflow",
              status: metrics.overflow > 1 ? "fail" : "pass",
              detail: String(metrics.overflow),
            },
            {
              name: "heading-overflow",
              status: metrics.headingOverflow ? "fail" : "pass",
            },
            {
              name: "image-health",
              status: metrics.brokenImages ? "fail" : "pass",
              detail: String(metrics.brokenImages),
            },
            {
              name: "media-policy",
              status: metrics.brokenImages ? "fail" : "pass",
            },
            {
              name: "computed-contrast",
              status:
                metrics.computedContrastKnown && contrastFailures.length === 0
                  ? "pass"
                  : "fail",
              detail:
                contrastFailures.length > 0
                  ? contrastFailures
                      .slice(0, 5)
                      .map(
                        (failure) =>
                          `${failure.label} ${failure.ratio.toFixed(2)}<${failure.minimum}`,
                      )
                      .join(" | ")
                  : undefined,
            },
            {
              name: "focus-visible",
              status: metrics.focusVisible ? "pass" : "fail",
            },
            {
              name: "touch-target",
              status: metrics.touchTargets ? "fail" : "pass",
              detail:
                String(metrics.touchTargets) +
                (metrics.touchTargetDetail?.length
                  ? " " + metrics.touchTargetDetail.join(" | ")
                  : ""),
            },
          ];
          const screenshotPath = path.join(
            evidenceDir,
            `${routeIndex}-${viewportName}.jpg`,
          );
          if (loaded) {
            await page.screenshot({
              fullPage: true,
              path: screenshotPath,
              quality: 70,
              type: "jpeg",
            });
          }
          reports.push({
            route: routePath,
            viewport: viewportName,
            assertions,
            screenshotPath: loaded ? screenshotPath : undefined,
          });
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ routes: reports }));
})().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
