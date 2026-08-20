import emilMotion from "./emil-motion/SKILL.md?raw";
import impeccableCraft from "./impeccable-craft/SKILL.md?raw";
import indonesianUmkm from "./indonesian-umkm/SKILL.md?raw";
import shadcnUi from "./shadcn-ui/SKILL.md?raw";
import vercelWebDesign from "./vercel-web-design/SKILL.md?raw";

export const PROJECT_SKILL_NAMES = [
  "impeccable-craft",
  "vercel-web-design",
  "emil-motion",
  "indonesian-umkm",
  "shadcn-ui",
] as const;

export const PROJECT_CORE_SKILL_NAMES = [
  "impeccable-craft",
  "vercel-web-design",
  "indonesian-umkm",
  "shadcn-ui",
] as const;

export type ProjectSkillName = (typeof PROJECT_SKILL_NAMES)[number];

const SKILLS: Record<ProjectSkillName, string> = {
  "impeccable-craft": impeccableCraft,
  "vercel-web-design": vercelWebDesign,
  "emil-motion": emilMotion,
  "indonesian-umkm": indonesianUmkm,
  "shadcn-ui": shadcnUi,
};

export function readProjectSkill(name: ProjectSkillName) {
  return { content: SKILLS[name], name };
}
