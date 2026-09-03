---
target: src/components/home/HowItWorksSection.tsx
total_score: 10
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 0
p1_count: 3
timestamp: 2026-09-01T08-37-31Z
slug: src-components-home-howitworkssection-tsx
---

# How It Works critique

## Design Specificity Verdict

The current result is functional but reads as a generic AI-generated UI demo rather than an authored UMKM Cepat explanation. It uses familiar dashboard/card chrome (browser dots, URL pills, chat bubbles, WhatsApp CTA) as decoration instead of letting the provided product screenshots carry the story.

## Overall Impression

The main problem is not that the section lacks decoration; it has too many small decorative UI decisions and not enough clear visual authorship. The large panel is mostly empty dark space, the website screenshot becomes too small to read, and the synthetic scenes do not feel like one coherent product story.

## What's Working

- The three-step order is easy to understand at a glance.
- The active step is visible and the steps are keyboard-focusable buttons.
- The supplied website screenshot is rendered with `object-contain`, avoiding destructive cropping.

## Priority Issues

### [P1] Generic UI-kit composition

The split list + large panel is a recognizable SaaS pattern, but the implementation adds several generic shells around the content. It could belong to any AI builder. Replace the nested app chrome with a single editorial timeline and visual treatment specific to the three supplied assets.

### [P1] The visual proof is too small and surrounded by dead space

The landscape website image is contained inside a tall panel, so it shrinks to an unreadable thumbnail and leaves a large empty area below. `object-contain` is correct; the container aspect ratio is wrong. Give each visual its natural aspect ratio and let the active panel size to the asset rather than forcing all three into one fixed height.

### [P1] Decorative fake scenes undermine trust

The native chat and share scenes invent interface content, controls, and a WhatsApp action that are not the supplied product evidence. The user asked to show the given images. Use the real screenshots as the hero evidence; use only a restrained frame or label around them.

### [P2] Too much inactive opacity and automatic movement

Inactive steps are nearly invisible, while auto-advance can change the visual while someone is reading. This feels like motion added to make the section seem alive. Keep all step labels legible, make selection explicit, and prefer click-to-change; if auto-advance remains, add a clear pause and progress indication.

### [P2] Visual language clashes with the surrounding surface

The warm-neutral page is interrupted by large black mockups, bright orange controls, traffic-light dots, and a saturated WhatsApp green button. These accents have no shared hierarchy and make the section look assembled from different kits.

## Cognitive Load

4 failures: visual hierarchy, grouping, one-thing-at-a-time, and visual noise. The visitor must decode the step list, active state, browser chrome, chat metaphor, URL, and invented CTA simultaneously.

## Heuristic Scores

| #         | Heuristic                       |     Score | Key Issue                                                                                             |
| --------- | ------------------------------- | --------: | ----------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     |         2 | Active step is visible, but auto-advance changes context without a clear progress cue.                |
| 2         | Match System / Real World       |         2 | “Ceritakan usaha” is represented by a synthetic chat scene that starts mid-conversation.              |
| 3         | User Control and Freedom        |         2 | Clickable steps exist, but automatic switching takes control away.                                    |
| 4         | Consistency and Standards       |         1 | Dark mockup chrome, warm page, orange controls, and green WhatsApp CTA do not form one visual system. |
| 5         | Error Prevention                |       n/a | No meaningful error-prevention task in this marketing section.                                        |
| 6         | Recognition Rather Than Recall  |         2 | The labels are visible, but users must interpret several decorative metaphors.                        |
| 7         | Flexibility and Efficiency      |       n/a | Not applicable to this landing-page explanation.                                                      |
| 8         | Aesthetic and Minimalist Design |         1 | Too many UI details around too little readable evidence.                                              |
| 9         | Error Recovery                  |       n/a | No meaningful error-recovery task in this section.                                                    |
| 10        | Help and Documentation          |       n/a | FAQ is separate; this visual section is not documentation.                                            |
| **Total** |                                 | **10/24** | **Poor; major visual overhaul needed**                                                                |

## Persona Red Flags

- **Jordan, first-timer:** sees “AI bikin websitenya” but must decipher a URL bar, browser frame, chat metaphor, and changing active state before understanding the benefit.
- **Casey, mobile user:** the vertical list plus tall visual panel creates a long scroll; the auto-change can happen while reading, and the tiny image evidence is difficult to inspect.
- **Riley, stress tester:** the synthetic chat/share content looks like a product promise rather than a clearly marked illustration, creating uncertainty about what UMKM Cepat actually does.

## Minor Observations

- Detector found two advisory off-ramp type sizes in `HowItWorksSection.tsx`: 10px at line 63 and 8px at line 89. They are not the main problem, but they reinforce the tiny-chrome feeling.
- The current active panel defaults to the chat visual on SSR, so the first impression depends on a decorative reconstruction rather than the strongest supplied website screenshot.

## Recommended Direction

Replace the current card-like demo with a quiet editorial process block: a visible 01–03 rail on the left, one real supplied screenshot on the right, no invented WhatsApp/Instagram/Google Maps controls, no forced fixed-height panel, and click-based switching. Use the real chat and URL screenshots in natural aspect-ratio frames; use the website screenshot large enough to read. Keep animation to a short crossfade only, with reduced-motion support.

## Questions

1. Which direction should lead: **A)** editorial timeline with real screenshots (recommended), **B)** three large image panels in a horizontal scroll, or **C)** keep the split layout but remove all mockup chrome?
2. Should step changes be **click-only** (recommended) or keep **auto-advance with pause/progress**?
3. Should the visual tone stay **quiet warm-neutral**, or become **more expressive/editorial** while keeping the same palette?
