// Tier-1 mobile heuristics: objective checks a Playwright DOM-audit (tier-2)

const MIN_TOUCH_PX = 44;
const MIN_INPUT_FONT_PX = 16;

type TouchFinding = { selector: string; size: number };
type FontFinding = { px: number; selector: string };

function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "a" || tag === "button") {
    return true;
  }
  return el.getAttribute("role") === "button";
}

export function auditTouchTargets(doc: Document): TouchFinding[] {
  const interactive = Array.from(
    doc.querySelectorAll("a, button, [role='button']"),
  );
  return interactive
    .filter((el) => isInteractive(el))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      return { el, size };
    })
    .filter(({ size }) => size > 0 && size < MIN_TOUCH_PX)
    .map(({ el, size }) => ({ selector: el.tagName.toLowerCase(), size }));
}

export function auditInputFontSizes(
  doc: Document,
  getComputedStyle: (el: Element) => { fontSize: string },
): FontFinding[] {
  const inputs = Array.from(doc.querySelectorAll("input, textarea, select"));
  return inputs
    .map((el) => {
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      return { el, px };
    })
    .filter(({ px }) => Number.isFinite(px) && px < MIN_INPUT_FONT_PX)
    .map(({ el, px }) => ({ px, selector: el.tagName.toLowerCase() }));
}

export function auditHorizontalOverflow(win: Window): boolean {
  return win.document.documentElement.scrollWidth > win.innerWidth;
}
