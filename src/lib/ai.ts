import OpenAI from "openai";

import { getConfiguredProvider, getEnv, requireEnv } from "@/lib/config";

// Define the expected structure of the AI-generated JSON
export interface AiGeneratedContent {
  headline: string;
  subheadline: string;
  description: string;
  features: string[];
  featuresTitle?: string;
  galleryTitle?: string;
  testimonialsTitle?: string;
  contactTitle?: string;
  primaryColor: string;
  ctaText: string;
  layoutStyle: "standard" | "minimal" | string;
  tone: "professional" | "friendly" | "persuasive" | string;
  font: "Inter" | "Poppins" | string;
  whatsappCTA: boolean;
  whatsappNumber?: string;
}

export interface ColorThemeJson {
  primary: string;
  "on-primary": string;
  secondary: string;
  "on-secondary": string;
  background: string;
  "on-background": string;
  surface: string;
  "on-surface": string;
  accent: string;
  muted: string;
  border: string;
  success: string;
  error: string;
  card: string;
  "on-card": string;
  popover: string;
  "on-popover": string;
  destructive: string;
  "on-destructive": string;
  input: string;
  ring: string;
  foreground: string;
  primary_foreground: string;
  secondary_foreground: string;
  muted_foreground: string;
  accent_foreground: string;
  destructive_foreground: string;
  card_foreground: string;
  popover_foreground: string;
  "on-success"?: string;
  "on-error"?: string;
}

type JsonSchemaName = "landing page content" | "tweaked landing page content" | "color theme";

const AI_MODEL = getEnv("AI_MODEL", getEnv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001"));

function createAiClient() {
  const provider = getConfiguredProvider("ai");

  if (provider !== "openrouter") {
    throw new Error(`AI provider '${provider}' is registered but not implemented yet.`);
  }

  return new OpenAI({
    apiKey: requireEnv("OPENROUTER_API_KEY", { feature: "OpenRouter AI" }),
    baseURL: getEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    defaultHeaders: {
      "HTTP-Referer": getEnv("OPENROUTER_SITE_URL", getEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")),
      "X-Title": getEnv("OPENROUTER_APP_NAME", "UMKM Cepat"),
    },
  });
}

function parseJson<T>(content: string, schemaName: JsonSchemaName): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`AI returned invalid JSON for ${schemaName}.`);
  }
}

function validateContent(content: AiGeneratedContent): AiGeneratedContent {
  if (
    !content.headline ||
    !content.subheadline ||
    !content.description ||
    !Array.isArray(content.features) ||
    content.features.length === 0 ||
    !content.primaryColor ||
    !content.ctaText
  ) {
    throw new Error("Generated landing page content is missing required fields.");
  }

  if (!content.whatsappCTA && content.whatsappNumber) {
    delete content.whatsappNumber;
  }

  return content;
}

async function createJsonCompletion(systemPrompt: string, userMessage: string | undefined, temperature: number) {
  const client = createAiClient();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  return client.chat.completions.create({
    model: AI_MODEL,
    messages,
    temperature,
    response_format: { type: "json_object" },
  });
}

async function createTextCompletion(systemPrompt: string, userMessage: string, temperature: number, maxTokens: number) {
  const client = createAiClient();

  return client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  });
}

export async function generateLandingPageContent(
  businessName: string,
  category: string,
  userDescription?: string,
  hasWhatsApp?: boolean
): Promise<AiGeneratedContent> {
  const systemPrompt = `
    You are an expert landing page copywriter and designer for Indonesian SMEs (UMKM).
    Generate content for a simple promotional landing page based on the user's input.
    Output ONLY a valid JSON object matching the AiGeneratedContent interface, with no extra text or markdown formatting.
    Interface: { headline: string; subheadline: string; description: string; features: string[]; primaryColor: string; ctaText: string; layoutStyle: string; tone: string; font: string; whatsappCTA: boolean; whatsappNumber?: string; }
    Constraints:
    - headline: Compelling, short (max 10 words).
    - subheadline: Supportive, slightly longer (max 20 words).
    - description: Persuasive, highlighting benefits (3-5 sentences).
    - features: 3-5 bullet points of key features/benefits (string array).
    - primaryColor: Choose an attractive hex color code suitable for the business category.
    - ctaText: Generate a strong Call to Action text. If WhatsApp is provided, invite contact via WhatsApp. If not, use a non-WhatsApp CTA.
    - layoutStyle: Suggest 'standard' or 'minimal'.
    - tone: Suggest 'professional', 'friendly', or 'persuasive'.
    - font: Suggest 'Inter' (preferred) or 'Poppins'.
    - whatsappCTA: Set to true ONLY if the user provided a WhatsApp number.
    - whatsappNumber: Include the user's provided number ONLY if whatsappCTA is true, otherwise omit this field.
    Be creative and tailor the content to the Indonesian market and the business category.
  `;

  const userMessage = `
    Business Name: ${businessName}
    Category: ${category}
    User Description (Optional): ${userDescription || "-"}
    Has WhatsApp Number: ${hasWhatsApp ? "Yes" : "No"}
  `;

  try {
    const response = await createJsonCompletion(systemPrompt, userMessage, 0.7);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("AI response content is empty.");
    }

    const parsedContent = validateContent(parseJson<AiGeneratedContent>(content, "landing page content"));

    if (parsedContent.whatsappCTA && !hasWhatsApp) {
      parsedContent.whatsappCTA = false;
      delete parsedContent.whatsappNumber;
    }

    return parsedContent;
  } catch (error) {
    console.error("Error generating landing page content:", error);
    throw new Error("Gagal menghasilkan konten AI. Coba lagi nanti.");
  }
}

export async function tweakLandingPageContent(
  currentContent: AiGeneratedContent,
  userInstruction: string
): Promise<AiGeneratedContent> {
  const systemPrompt = `
    You are an expert landing page editor.
    Current content (JSON): ${JSON.stringify(currentContent)}
    User's instruction: ${userInstruction}
    Modify the current JSON based only on the user's instruction.
    Maintain the original structure and fields unless specifically asked to change them.
    Output ONLY the modified, valid JSON object matching the AiGeneratedContent interface, with no extra text or markdown formatting.
    Interface: { headline: string; subheadline: string; description: string; features: string[]; primaryColor: string; ctaText: string; layoutStyle: string; tone: string; font: string; whatsappCTA: boolean; whatsappNumber?: string; }
  `;

  try {
    const response = await createJsonCompletion(systemPrompt, undefined, 0.5);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("AI tweak response content is empty.");
    }

    const parsedContent = validateContent(parseJson<AiGeneratedContent>(content, "tweaked landing page content"));

    if (parsedContent.whatsappCTA && !parsedContent.whatsappNumber && currentContent.whatsappNumber) {
      parsedContent.whatsappNumber = currentContent.whatsappNumber;
    }

    return parsedContent;
  } catch (error) {
    console.error("Error tweaking landing page content:", error);
    throw new Error("Gagal melakukan tweak AI. Coba lagi nanti.");
  }
}

export async function generateBusinessDescription(
  businessName: string,
  category: string
): Promise<string> {
  const systemPrompt = `
    Anda adalah copywriter AI yang ahli membuat deskripsi singkat maksimal 3-4 kalimat atau sekitar 400 karakter untuk landing page UMKM Indonesia.
    Fokus pada manfaat utama bagi calon pelanggan dan gunakan gaya bahasa yang persuasif namun profesional.
    Hindari penggunaan list/bullet point.
    Output HANYA teks deskripsi saja, tanpa kalimat pembuka/penutup atau format tambahan.
  `;

  const userMessage = `
    Business Name: ${businessName}
    Business Category: ${category}
    Buatkan deskripsi landing page yang menarik.
  `;

  try {
    const response = await createTextCompletion(systemPrompt, userMessage, 0.8, 150);
    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("AI response for description is empty.");
    }

    return description;
  } catch (error) {
    console.error("Error generating business description:", error);
    throw new Error("Gagal menghasilkan deskripsi AI.");
  }
}

export async function generateColorTheme(
  businessName: string,
  category: string
): Promise<ColorThemeJson> {
  const systemPrompt = `
    You are a UI color theme generator specializing in accessible and appealing themes for Indonesian SMEs (UMKM) based on shadcn/ui conventions.
    Output ONLY a valid JSON object matching the ColorThemeJson interface, with no extra text or markdown formatting.
    All color values MUST be in HSL format as a string: "H S% L%" (e.g., "210 40% 96.1%"). Do NOT use Hex.
    Include every required shadcn-compatible key: primary, on-primary, secondary, on-secondary, background, on-background, surface, on-surface, accent, muted, border, success, error, card, on-card, popover, on-popover, destructive, on-destructive, input, ring, foreground, primary_foreground, secondary_foreground, muted_foreground, accent_foreground, destructive_foreground, card_foreground, popover_foreground.
    Ensure foreground values have accessible contrast. Make colors suitable for the business category.
  `;

  const userMessage = `
    Business Name: ${businessName}
    Category: ${category}
  `;

  try {
    const response = await createJsonCompletion(systemPrompt, userMessage, 0.8);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("AI color theme response content is empty.");
    }

    const parsedTheme = parseJson<Partial<ColorThemeJson>>(content, "color theme");
    return normalizeColorTheme(parsedTheme);
  } catch (error) {
    console.error("Error generating color theme:", error);
    throw new Error(`Gagal menghasilkan tema warna AI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeColorTheme(parsedTheme: Partial<ColorThemeJson>): ColorThemeJson {
  const requiredKeys: Array<keyof ColorThemeJson> = [
    "primary",
    "on-primary",
    "secondary",
    "on-secondary",
    "background",
    "on-background",
    "surface",
    "on-surface",
    "accent",
    "muted",
    "border",
    "success",
    "error",
    "card",
    "on-card",
    "popover",
    "on-popover",
    "destructive",
    "on-destructive",
    "input",
    "ring",
    "foreground",
    "primary_foreground",
    "secondary_foreground",
    "muted_foreground",
    "accent_foreground",
    "destructive_foreground",
    "card_foreground",
    "popover_foreground",
  ];

  const finalTheme = {} as ColorThemeJson;
  const hslRegex = /^\s*(\d{1,3}(\.\d+)?)\s+(\d{1,3}(\.\d+)?)%\s+(\d{1,3}(\.\d+)?)%\s*$/;

  for (const key of requiredKeys) {
    const value = parsedTheme[key];
    if (typeof value === "string" && hslRegex.test(value)) {
      finalTheme[key] = value.trim();
      continue;
    }

    finalTheme[key] = getThemeFallback(key, finalTheme, parsedTheme);

    if (!hslRegex.test(finalTheme[key])) {
      throw new Error(`Invalid fallback HSL value for ${key}.`);
    }
  }

  if (parsedTheme["on-success"] && hslRegex.test(parsedTheme["on-success"])) {
    finalTheme["on-success"] = parsedTheme["on-success"].trim();
  }

  if (parsedTheme["on-error"] && hslRegex.test(parsedTheme["on-error"])) {
    finalTheme["on-error"] = parsedTheme["on-error"].trim();
  }

  return finalTheme;
}

function getThemeFallback(
  key: keyof ColorThemeJson,
  finalTheme: Partial<ColorThemeJson>,
  parsedTheme: Partial<ColorThemeJson>
): string {
  const fallbacks: Partial<Record<keyof ColorThemeJson, string>> = {
    primary: "222 47% 11%",
    "on-primary": "0 0% 100%",
    secondary: "210 40% 96%",
    "on-secondary": "222 47% 11%",
    background: "0 0% 100%",
    "on-background": "222 47% 11%",
    surface: finalTheme.background || "0 0% 100%",
    "on-surface": finalTheme["on-background"] || "222 47% 11%",
    accent: finalTheme.primary || "217 91% 60%",
    muted: finalTheme.secondary || "210 40% 96%",
    border: "214 32% 91%",
    success: "142 71% 45%",
    error: "0 84% 60%",
    card: finalTheme.surface || finalTheme.background || "0 0% 100%",
    "on-card": finalTheme["on-surface"] || finalTheme["on-background"] || "222 47% 11%",
    popover: finalTheme.card || "0 0% 100%",
    "on-popover": finalTheme["on-card"] || "222 47% 11%",
    destructive: finalTheme.error || "0 84% 60%",
    "on-destructive": parsedTheme["on-error"] || "0 0% 100%",
    input: finalTheme.border || "214 32% 91%",
    ring: finalTheme.primary || "215 20% 65%",
    foreground: finalTheme["on-background"] || "222 47% 11%",
    primary_foreground: finalTheme["on-primary"] || "0 0% 100%",
    secondary_foreground: finalTheme["on-secondary"] || "222 47% 11%",
    muted_foreground: "215 16% 47%",
    accent_foreground: finalTheme["on-primary"] || "0 0% 100%",
    destructive_foreground: parsedTheme["on-error"] || finalTheme["on-destructive"] || "0 0% 100%",
    card_foreground: finalTheme["on-card"] || "222 47% 11%",
    popover_foreground: finalTheme["on-popover"] || "222 47% 11%",
  };

  const fallback = fallbacks[key];

  if (!fallback) {
    throw new Error(`Missing fallback for color key ${key}.`);
  }

  return fallback;
}
