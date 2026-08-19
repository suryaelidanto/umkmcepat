/**
 * Comprehensive Catalog of all 45+ Pre-seeded Shadcn/UI Components
 * and Creative Layout Primitives for the AI Landing Page Generator.
 *
 * Single source of truth for the model during code generation.
 */

export interface ComponentDocumentation {
  name: string;
  module: string;
  description: string;
  importExample: string;
}

export const COMPLETE_COMPONENT_REGISTRY: ComponentDocumentation[] = [
  // Creative Layout Primitives
  {
    name: "BentoGrid",
    module: "@/components/site/layout",
    description:
      "Multi-column asymmetric container for modern, scannable Bento layouts.",
    importExample:
      'import { BentoGrid, BentoCard } from "@/components/site/layout";',
  },
  {
    name: "BentoCard",
    module: "@/components/site/layout",
    description:
      "Responsive Bento card container with colSpan (1|2|3) and rowSpan (1|2) for visual hierarchy.",
    importExample: 'import { BentoCard } from "@/components/site/layout";',
  },
  {
    name: "StatCounter",
    module: "@/components/site/layout",
    description:
      "High-impact numerical highlight card (value: string, label: string).",
    importExample: 'import { StatCounter } from "@/components/site/layout";',
  },
  {
    name: "BadgePill",
    module: "@/components/site/layout",
    description:
      "Soft glassmorphism pill badge for category tags, guarantees, and chips.",
    importExample: 'import { BadgePill } from "@/components/site/layout";',
  },
  {
    name: "TestimonialCard",
    module: "@/components/site/layout",
    description:
      "Social proof quote card with star rating and author avatar badge.",
    importExample:
      'import { TestimonialCard } from "@/components/site/layout";',
  },
  {
    name: "SiteSection",
    module: "@/components/site/layout",
    description:
      "Section wrapper (density: 'compact'|'regular'|'airy', surface: 'base'|'muted'|'contrast'|'card'|'accent', width: 'reading'|'content'|'wide').",
    importExample: 'import { SiteSection } from "@/components/site/layout";',
  },
  {
    name: "SiteSplit",
    module: "@/components/site/layout",
    description:
      "2-column split grid (emphasis: 'equal'|'leading'|'trailing').",
    importExample: 'import { SiteSplit } from "@/components/site/layout";',
  },
  {
    name: "SiteCluster",
    module: "@/components/site/layout",
    description:
      "Flex wrap cluster (justify: 'start'|'center'|'between'|'end').",
    importExample: 'import { SiteCluster } from "@/components/site/layout";',
  },
  {
    name: "SiteStack",
    module: "@/components/site/layout",
    description: "Vertical flex stack (gap: 'xs'|'sm'|'md'|'lg'|'xl').",
    importExample: 'import { SiteStack } from "@/components/site/layout";',
  },

  // Core Shadcn/UI Components
  {
    name: "Button",
    module: "@/components/ui/button",
    description:
      "Primary action button (variant: 'default'|'outline'|'secondary'|'ghost'|'destructive', size: 'default'|'sm'|'lg'|'icon', asChild).",
    importExample: 'import { Button } from "@/components/ui/button";',
  },
  {
    name: "Card",
    module: "@/components/ui/card",
    description:
      "Standard card surface with CardHeader, CardTitle, CardDescription, CardContent, CardFooter.",
    importExample:
      'import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";',
  },
  {
    name: "Accordion",
    module: "@/components/ui/accordion",
    description:
      "Collapsible FAQ/accordion list (Accordion, AccordionItem, AccordionTrigger, AccordionContent).",
    importExample:
      'import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";',
  },
  {
    name: "Badge",
    module: "@/components/ui/badge",
    description:
      "Status badge tag (variant: 'default'|'secondary'|'outline'|'destructive').",
    importExample: 'import { Badge } from "@/components/ui/badge";',
  },
  {
    name: "Tabs",
    module: "@/components/ui/tabs",
    description:
      "Interactive category tabs (Tabs, TabsList, TabsTrigger, TabsContent).",
    importExample:
      'import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";',
  },
  {
    name: "Carousel",
    module: "@/components/ui/carousel",
    description:
      "Interactive carousel/slider (Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext).",
    importExample:
      'import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";',
  },
  {
    name: "Avatar",
    module: "@/components/ui/avatar",
    description:
      "User/customer avatar with fallback initials (Avatar, AvatarImage, AvatarFallback).",
    importExample:
      'import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";',
  },
  {
    name: "Dialog",
    module: "@/components/ui/dialog",
    description:
      "Modal popup dialog (Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription).",
    importExample:
      'import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";',
  },
  {
    name: "Sheet",
    module: "@/components/ui/sheet",
    description:
      "Slide-over drawer panel (Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle).",
    importExample:
      'import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";',
  },
  {
    name: "Popover",
    module: "@/components/ui/popover",
    description:
      "Floating popover card (Popover, PopoverTrigger, PopoverContent).",
    importExample:
      'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";',
  },
  {
    name: "Separator",
    module: "@/components/ui/separator",
    description: "Visual dividing line (orientation: 'horizontal'|'vertical').",
    importExample: 'import { Separator } from "@/components/ui/separator";',
  },
  {
    name: "Table",
    module: "@/components/ui/table",
    description:
      "Data/pricing comparison table (Table, TableHeader, TableBody, TableRow, TableHead, TableCell).",
    importExample:
      'import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";',
  },
  {
    name: "Tooltip",
    module: "@/components/ui/tooltip",
    description:
      "Hover tooltip label (TooltipProvider, Tooltip, TooltipTrigger, TooltipContent).",
    importExample:
      'import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";',
  },
  {
    name: "Lucide Icons",
    module: "lucide-react",
    description:
      "1,400+ domain icons (Check, Star, Sparkles, ShieldCheck, Clock, Phone, MapPin, ArrowRight, Zap, Award, Flame, Heart, etc.).",
    importExample:
      'import { Sparkles, ShieldCheck, Clock, Star, Check, Phone, MapPin, ArrowRight } from "lucide-react";',
  },
];

export function getFormattedShadcnRegistryPrompt(): string {
  const categories = COMPLETE_COMPONENT_REGISTRY.slice(0, 15)
    .map((c) => `- ${c.name} (${c.module}): ${c.description}`)
    .join("\n");

  return `PRE-INSTALLED SHADCN/UI & CREATIVE REGISTRY:
All 45+ components and layout primitives are pre-installed in the scaffold (Button, Card, Accordion, Badge, Tabs, Carousel, Avatar, Dialog, Sheet, BentoGrid, BentoCard, StatCounter, BadgePill, TestimonialCard, Lucide icons, etc.). Import and compose them directly.
${categories}`;
}
