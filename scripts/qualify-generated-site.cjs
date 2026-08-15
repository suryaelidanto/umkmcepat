/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS browser subprocess. */
const { mkdirSync } = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright-core");

const {
  evaluateEmptyMediaFrame,
  evaluateFixedOverlaps,
  evaluateFirstViewContract,
  evaluateProfessionalTypography,
  evaluateSectionCoverage,
  evaluateSignaturePresence,
  findContrastFailures,
  TRANSPARENT_CSS_COLOR_PATTERN,
} = require("./generated-site-contrast.cjs");

const [
  origin,
  routesJson = '["/"]',
  executablePath = "",
  timeoutRaw = "10000",
  evidenceDir = "",
  professionalPolicyJson = "",
] = process.argv.slice(2);
const timeout = Number(timeoutRaw);
const routes = JSON.parse(routesJson);
const professionalPolicy = professionalPolicyJson
  ? JSON.parse(professionalPolicyJson)
  : null;
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
            ? await page.evaluate(
                (input) => {
                  const transparentColorPattern = new RegExp(
                    input.transparentCssColorPattern,
                    "i",
                  );
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
                  const textOf = (element) =>
                    (element?.textContent || "").replace(/\s+/g, " ").trim();
                  const firstViews = [
                    ...document.querySelectorAll("[data-first-view]"),
                  ];
                  const primaryActions = [
                    ...document.querySelectorAll("[data-primary-action]"),
                  ].filter(visible);
                  const sectionElements = [
                    ...document.querySelectorAll("[data-section-id]"),
                  ];
                  const signatureElements = [
                    ...document.querySelectorAll("[data-signature]"),
                  ];
                  const bodyFontSizePx =
                    Number.parseFloat(
                      getComputedStyle(document.body).fontSize,
                    ) || 16;
                  const bodyStyle = getComputedStyle(document.body);
                  const bodyLineHeightPx =
                    bodyStyle.lineHeight === "normal"
                      ? bodyFontSizePx * 1.4
                      : Number.parseFloat(bodyStyle.lineHeight) ||
                        bodyFontSizePx * 1.4;
                  const bodyProse = [
                    ...document.querySelectorAll("p,li"),
                  ].filter(visible);
                  const bodyMaxCh = bodyProse.reduce((maximum, element) => {
                    const style = getComputedStyle(element);
                    const fontSize = Number.parseFloat(style.fontSize) || 16;
                    return Math.max(
                      maximum,
                      element.getBoundingClientRect().width / (fontSize * 0.5),
                    );
                  }, 0);
                  const fixedRects = [...document.querySelectorAll("*")]
                    .filter((element) => {
                      const style = getComputedStyle(element);
                      return (
                        visible(element) &&
                        (style.position === "fixed" ||
                          style.position === "sticky")
                      );
                    })
                    .map((element) => {
                      const rect = element.getBoundingClientRect();
                      return {
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                        label: element.tagName.toLowerCase(),
                      };
                    });
                  const targetRects = [
                    ...document.querySelectorAll(
                      "[data-first-view],[data-section-id]",
                    ),
                  ]
                    .filter(visible)
                    .map((element) => {
                      const rect = element.getBoundingClientRect();
                      return {
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                        label:
                          element.getAttribute("data-section-id") ||
                          "first-view",
                      };
                    });
                  const mediaFrames = [
                    ...document.querySelectorAll(
                      '[aria-hidden="true"], [data-media]',
                    ),
                  ]
                    .filter(visible)
                    .map((element) => {
                      const rect = element.getBoundingClientRect();
                      const style = getComputedStyle(element);
                      return {
                        area: rect.width * rect.height,
                        borderedOrBackgrounded:
                          style.borderStyle !== "none" ||
                          (style.backgroundColor !== "transparent" &&
                            !transparentColorPattern.test(
                              style.backgroundColor,
                            )),
                        visibleText: textOf(element).length > 0,
                        hasImage: Boolean(element.querySelector("img")),
                        hasSvgPath: Boolean(
                          element.querySelector(
                            "svg path,svg circle,svg rect,svg line",
                          ),
                        ),
                      };
                    });
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
                        !transparentColorPattern.test(candidate)
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
                  const firstView = firstViews[0];
                  const firstViewRect = firstView?.getBoundingClientRect();
                  const firstViewText = textOf(firstView);
                  const firstViewAction = primaryActions.find((action) =>
                    firstView?.contains(action),
                  );
                  const professional = input.policy
                    ? {
                        firstView: {
                          count: firstViews.length,
                          visible: Boolean(firstView && visible(firstView)),
                          text: firstViewText,
                          actionCount: primaryActions.length,
                          primaryAction: firstViewAction
                            ? {
                                visible: visible(firstViewAction),
                                label: textOf(firstViewAction),
                                href:
                                  firstViewAction.getAttribute("href") || "",
                              }
                            : null,
                        },
                        sections: sectionElements.map((element) => ({
                          id: element.getAttribute("data-section-id") || "",
                          visible: visible(element),
                          text: textOf(element),
                        })),
                        typography: {
                          bodyFontSizePx,
                          bodyLineHeightRatio:
                            bodyLineHeightPx / bodyFontSizePx,
                          bodyMaxCh,
                          displayHeadings: headings.map((heading) => {
                            const style = getComputedStyle(heading);
                            const fontSize =
                              Number.parseFloat(style.fontSize) || 0;
                            const letterSpacing =
                              style.letterSpacing === "normal"
                                ? 0
                                : Number.parseFloat(style.letterSpacing) || 0;
                            return {
                              fontSizePx: fontSize,
                              letterSpacingEm: fontSize
                                ? letterSpacing / fontSize
                                : 0,
                            };
                          }),
                        },
                        fixedRects,
                        targetRects,
                        mediaFrames,
                        signatures: {
                          count: signatureElements.length,
                          visibleCount:
                            signatureElements.filter(visible).length,
                          hasVisibleText: signatureElements.some(
                            (element) =>
                              visible(element) && textOf(element).length > 0,
                          ),
                        },
                        signals: [
                          ...(document.querySelectorAll("article").length >= 3
                            ? [
                                {
                                  code: "card-repetition",
                                  detail: `${document.querySelectorAll("article").length} article elements`,
                                },
                              ]
                            : []),
                          ...(firstViewRect &&
                          firstViewRect.width * firstViewRect.height >=
                            input.viewport.width *
                              input.viewport.height *
                              0.5 &&
                          firstViewText.length < 40
                            ? [
                                {
                                  code: "first-view-empty-area",
                                  detail:
                                    "first view occupies substantial area with little visible text",
                                },
                              ]
                            : []),
                          ...(document.querySelectorAll('[class*="bg-accent"]')
                            .length > 2
                            ? [
                                {
                                  code: "accent-surface-share",
                                  detail: `${document.querySelectorAll('[class*="bg-accent"]').length} accent surface markers`,
                                },
                              ]
                            : []),
                        ],
                      }
                    : null;
                  return {
                    textLength: (document.body.innerText || "").trim().length,
                    overflow:
                      document.documentElement.scrollWidth -
                      document.documentElement.clientWidth,
                    headingOverflow: headings.some(
                      (heading) =>
                        heading.scrollWidth > heading.clientWidth + 1,
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
                    professional,
                  };
                },
                {
                  transparentCssColorPattern: TRANSPARENT_CSS_COLOR_PATTERN,
                  policy: professionalPolicy
                    ? professionalPolicy.routes.find(
                        (candidate) => candidate.path === routePath,
                      )
                    : null,
                  signatureRoute: professionalPolicy?.signatureRoute ?? null,
                  viewport,
                },
              )
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
          let professionalSignals = [];
          if (professionalPolicy) {
            const policy = professionalPolicy.routes.find(
              (candidate) => candidate.path === routePath,
            );
            const professional = metrics.professional;
            const firstViewResult =
              policy && professional
                ? evaluateFirstViewContract({
                    firstViewCount: professional.firstView.count,
                    firstViewVisible: professional.firstView.visible,
                    firstViewText: professional.firstView.text,
                    identityText: policy.firstView.identityText,
                    offerTexts: policy.firstView.offerTexts,
                    primaryCtaLabel: policy.firstView.primaryCtaLabel,
                    primaryCtaHref: policy.firstView.primaryCtaHref,
                    primaryActionCount: professional.firstView.actionCount,
                    primaryAction: professional.firstView.primaryAction,
                  })
                : { pass: false, failures: ["missing-policy-or-first-view"] };
            const sectionResult =
              policy && professional
                ? evaluateSectionCoverage({
                    expectedSections: policy.sections,
                    actualSections: professional.sections,
                  })
                : { pass: false, failures: ["missing-policy-or-sections"] };
            const typographyResult =
              policy && professional
                ? evaluateProfessionalTypography({
                    ...professional.typography,
                    ...policy.typography,
                  })
                : { pass: false, failures: ["missing-policy-or-typography"] };
            const overlapResult = professional
              ? evaluateFixedOverlaps({
                  fixedRects: professional.fixedRects,
                  targetRects: professional.targetRects,
                })
              : { pass: false, failures: ["missing-geometry"] };
            const mediaResult = professional
              ? professional.mediaFrames.every(
                  (frame) => evaluateEmptyMediaFrame(frame).pass,
                )
              : false;
            const signatureResult =
              policy && professional
                ? evaluateSignaturePresence({
                    route: routePath,
                    signatureRoute: professionalPolicy.signatureRoute,
                    ...professional.signatures,
                  })
                : { pass: false, failures: ["missing-policy-or-signature"] };
            assertions.push(
              {
                name: "first-view-contract",
                status: firstViewResult.pass ? "pass" : "fail",
                detail:
                  firstViewResult.failures.slice(0, 5).join(" | ") || undefined,
              },
              {
                name: "section-coverage",
                status:
                  sectionResult.failures.filter(
                    (failure) => failure !== "order",
                  ).length === 0
                    ? "pass"
                    : "fail",
                detail:
                  sectionResult.failures.slice(0, 5).join(" | ") || undefined,
              },
              {
                name: "section-order",
                status: sectionResult.failures.includes("order")
                  ? "fail"
                  : "pass",
                detail: sectionResult.failures.includes("order")
                  ? "section order differs from blueprint"
                  : undefined,
              },
              {
                name: "typography-bounds",
                status: typographyResult.pass ? "pass" : "fail",
                detail:
                  typographyResult.failures.slice(0, 5).join(" | ") ||
                  undefined,
              },
              {
                name: "content-hidden-by-navigation",
                status: overlapResult.pass ? "pass" : "fail",
                detail:
                  overlapResult.failures.slice(0, 5).join(" | ") || undefined,
              },
              {
                name: "empty-media-frame",
                status: mediaResult ? "pass" : "fail",
              },
              {
                name: "signature-presence",
                status: signatureResult.pass ? "pass" : "fail",
                detail:
                  signatureResult.failures.slice(0, 5).join(" | ") || undefined,
              },
            );
            professionalSignals = professional
              ? professional.signals.slice(0, 20).map((signal) => ({
                  code: String(signal.code).slice(0, 80),
                  route: routePath,
                  viewport: viewportName,
                  detail: String(signal.detail).slice(0, 240),
                }))
              : [];
          }
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
            ...(professionalPolicy ? { professionalSignals } : {}),
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
