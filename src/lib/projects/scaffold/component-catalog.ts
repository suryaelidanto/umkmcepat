import { SHADCN_COMPONENT_BY_NAME } from "./shadcn-components";

export interface ComponentDocumentation {
  name: string;
  module: string;
  description: string;
  importExample: string;
}

const COMPONENT_DESCRIPTIONS: Record<string, string> = {
  accordion: "Collapsible content with AccordionItem, Trigger, and Content.",
  alert: "Inline status and error surface.",
  "alert-dialog": "Destructive confirmation dialog with an accessible title.",
  "aspect-ratio": "Media or content wrapper with a fixed aspect ratio.",
  avatar: "Image or initials identity surface.",
  badge: "Small semantic status or category label.",
  breadcrumb: "Hierarchical navigation trail.",
  button: "Action control with semantic variants and Slot composition.",
  calendar: "Date selection primitive when the brief supports a real date.",
  card: "Surface composition with header, title, content, and footer parts.",
  carousel: "Keyboard-accessible slide collection for real grouped content.",
  checkbox: "A binary choice control with a visible label.",
  collapsible: "Disclosure surface for optional content.",
  command: "Searchable command list with grouped items.",
  "context-menu": "Pointer and keyboard context menu.",
  dialog: "Modal surface with labelled content and focus management.",
  drawer: "Mobile-friendly side or bottom surface.",
  "dropdown-menu": "Grouped action menu anchored to a control.",
  form: "Field primitives for labelled validation and descriptions.",
  "hover-card":
    "Supplemental pointer content that is not the only access path.",
  input: "Text input with a visible label and accepted type.",
  "input-otp": "Short code input only when the accepted flow needs it.",
  label: "Accessible label primitive.",
  menubar: "Grouped top-level menu controls.",
  "navigation-menu": "Structured site navigation.",
  pagination: "Bounded navigation for an actual multi-page collection.",
  popover: "Anchored supplemental content with keyboard access.",
  progress: "Honest progress for a real bounded operation.",
  "radio-group": "One choice from a labelled set.",
  resizable: "User-resizable panels when the job requires it.",
  "scroll-area": "Contained scrolling for content that cannot naturally wrap.",
  select: "Native-like selection from a bounded set.",
  separator: "Semantic or visual content division.",
  sheet: "Accessible side panel for navigation or a focused task.",
  skeleton: "Loading placeholder for a real pending state only.",
  slider: "Continuous value control only when the brief supports real state.",
  sonner: "Toast surface for an actual transient result.",
  spinner: "Loading indicator for an actual pending operation.",
  switch: "A labelled on/off preference.",
  table: "Structured rows and columns for real comparison data.",
  tabs: "Peer content panels with a labelled tab list.",
  textarea: "Multi-line text input with a visible label.",
  toggle: "A labelled pressed/unpressed action.",
  "toggle-group": "A grouped set of related toggles.",
  tooltip: "Supplemental pointer or keyboard hint, never essential content.",
};

export const COMPLETE_COMPONENT_REGISTRY: ComponentDocumentation[] = Array.from(
  SHADCN_COMPONENT_BY_NAME.keys(),
)
  .sort()
  .map((name) => ({
    description:
      COMPONENT_DESCRIPTIONS[name] ??
      "Bundled shadcn source component; inspect it before composing.",
    importExample: `import { ${toPascalCase(name)} } from "@/components/ui/${name}";`,
    module: `@/components/ui/${name}`,
    name,
  }));

export function getFormattedShadcnRegistryPrompt(): string {
  const entries = COMPLETE_COMPONENT_REGISTRY.slice(0, 18)
    .map(
      (component) =>
        `- src/components/ui/${component.name}.tsx (${component.module}): ${component.description}`,
    )
    .join("\n");

  return `LOCAL SHADCN/UI SOURCE REGISTRY:
The generated scaffold pre-seeds src/components/ui/button.tsx and src/components/ui/card.tsx. The remaining entries below are bundled source files, not installed runtime modules. In the agentic tool loop, use read_file for a source and write_file to copy a needed component before importing it. In a batched response, use only the components present in the supplied manifest or emit the required source through the existing response contract.

components.json and src/index.css define the local aliases and semantic Tailwind v4 tokens. Use cn() from src/lib/utils. Use the existing source before writing a new primitive. Never run a CLI, call MCP, fetch a registry, add a dependency, or assume a component exists without reading its source or receiving it in the supplied scaffold.

AVAILABLE BUNDLED COMPONENTS:
${entries}

The agentic read_file and write_file tools are the only component discovery/composition path in that tool loop; the batched writer must stay within its supplied source contract.`;
}

function toPascalCase(value: string) {
  return value
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}
