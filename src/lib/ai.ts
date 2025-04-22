import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.warn("Missing OPENAI_API_KEY environment variable. AI features will fail.");
  // throw new Error("Missing OPENAI_API_KEY environment variable");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the expected structure of the AI-generated JSON
// This should EXACTLY match the prompt requirements
export interface AiGeneratedContent {
  headline: string;
  subheadline: string;
  description: string;
  features: string[]; // Array of feature strings
  featuresTitle?: string; // Added: Optional title for features section
  galleryTitle?: string; // Added: Optional title for gallery section
  testimonialsTitle?: string; // Added: Optional title for testimonials section
  contactTitle?: string; // Added: Optional title for contact section
  primaryColor: string; // Hex color code (e.g., "#3B82F6")
  ctaText: string; // Text for the main Call to Action button
  layoutStyle: 'standard' | 'minimal' | string; // Predefined or custom
  tone: 'professional' | 'friendly' | 'persuasive' | string; // Predefined or custom
  font: 'Inter' | 'Poppins' | string; // Font name or class
  whatsappCTA: boolean; // True if CTA should link to WhatsApp
  whatsappNumber?: string; // WhatsApp number (only if whatsappCTA is true)
}

// === Interface for Color Theme ===
// Updated to include all shadcn/ui compatible tokens and specify HSL format
export interface ColorThemeJson {
  primary: string;        // HSL string e.g., "222.2 47.4% 11.2%"
  "on-primary": string;   // HSL string
  secondary: string;
  "on-secondary": string;
  background: string;
  "on-background": string;
  surface: string;        // Can be same as card
  "on-surface": string;     // Can be same as on-card
  accent: string;
  muted: string;
  border: string;
  success: string;
  error: string;          // Often same as destructive

  // Additional tokens for full shadcn compatibility
  card: string;           // HSL string
  "on-card": string;      // HSL string
  popover: string;        // HSL string
  "on-popover": string;   // HSL string
  destructive: string;    // HSL string
  "on-destructive": string;// HSL string (renamed from destructive_foreground for consistency)
  input: string;          // HSL string (renamed from border_input)
  ring: string;           // HSL string

  // Foreground variants (can be derived but good to generate for consistency)
  foreground: string;           // Alias for on-background
  primary_foreground: string;   // Alias for on-primary
  secondary_foreground: string; // Alias for on-secondary
  muted_foreground: string;     // HSL string
  accent_foreground: string;    // HSL string
  destructive_foreground: string; // Alias for on-destructive
  card_foreground: string;      // Alias for on-card
  popover_foreground: string;   // Alias for on-popover

  // Optional tokens (AI might not always generate these consistently)
  "on-success"?: string;  // Optional HSL string for text on success color
  "on-error"?: string;    // Optional HSL string for text on error/destructive color
}

// Function to generate landing page content using GPT-4o-mini
export async function generateLandingPageContent(
  namaUsaha: string,
  kategori: string,
  deskripsi_user?: string,
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
    - primaryColor: Choose an attractive hex color code suitable for the business category (e.g., food=orange/red, tech=blue, beauty=pink/purple).
    - ctaText: Generate a strong Call to Action text specifically inviting users to contact via WhatsApp (e.g., "Hubungi via WhatsApp", "Chat Sekarang di WA", "Kontak via WhatsApp"). Avoid generic phrases like "Pesan Sekarang" unless the context *only* makes sense for ordering (like food). If the user didn't provide a WhatsApp number, generate a relevant non-WhatsApp CTA (e.g., "Lihat Produk", "Pelajari Lebih Lanjut").
    - layoutStyle: Suggest 'standard' or 'minimal'.
    - tone: Suggest 'professional', 'friendly', or 'persuasive'.
    - font: Suggest 'Inter' (preferred) or 'Poppins'.
    - whatsappCTA: Set to true ONLY if the user provided a WhatsApp number (indicated by 'Has WhatsApp Number: Yes' in the user message), otherwise false.
    - whatsappNumber: Include the user's provided number ONLY if whatsappCTA is true, otherwise omit this field.
    Be creative and tailor the content to the Indonesian market and the business category.
  `;

  const userMessage = `
    Business Name: ${namaUsaha}
    Category: ${kategori}
    User Description (Optional): ${deskripsi_user || '-'}
    Has WhatsApp Number: ${hasWhatsApp ? 'Yes' : 'No'}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use the specified model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7, // Adjust temperature for creativity vs consistency
      response_format: { type: "json_object" }, // Ensure JSON output
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI response content is empty.");
    }

    // Attempt to parse the JSON content
    const parsedContent: AiGeneratedContent = JSON.parse(content);

    // Basic validation (can be enhanced)
    if (
      !parsedContent.headline ||
      !parsedContent.subheadline ||
      !parsedContent.description ||
      !parsedContent.features ||
      !parsedContent.primaryColor ||
      !parsedContent.ctaText
      // ... add more checks if needed
    ) {
      throw new Error("Generated JSON is missing required fields.");
    }

    // Ensure whatsappNumber is only present if whatsappCTA is true
    if (!parsedContent.whatsappCTA && parsedContent.whatsappNumber) {
        delete parsedContent.whatsappNumber;
    }
    if (parsedContent.whatsappCTA && !hasWhatsApp) {
        // If AI hallucinated whatsappCTA=true without input, correct it
        parsedContent.whatsappCTA = false;
        delete parsedContent.whatsappNumber;
    }


    console.log("AI Generated Content:", parsedContent);
    return parsedContent;

  } catch (error) {
    console.error("Error generating landing page content:", error);
    // Provide a fallback or throw a more specific error
    throw new Error("Gagal menghasilkan konten AI. Coba lagi nanti.");
  }
}

// Function to tweak landing page content using AI
export async function tweakLandingPageContent(
  currentContent: AiGeneratedContent,
  userInstruction: string
): Promise<AiGeneratedContent> {

 const systemPrompt = `
    You are an expert landing page editor.
    The user wants to modify their existing landing page content based on their instruction.
    Current content (JSON): ${JSON.stringify(currentContent)}
    User's instruction: ${userInstruction}
    Modify the current JSON based *only* on the user's instruction.
    Maintain the original structure and fields unless specifically asked to change them.
    Output ONLY the modified, valid JSON object matching the AiGeneratedContent interface, with no extra text or markdown formatting.
    Interface: { headline: string; subheadline: string; description: string; features: string[]; primaryColor: string; ctaText: string; layoutStyle: string; tone: string; font: string; whatsappCTA: boolean; whatsappNumber?: string; }
  `;

  try {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            // No user message needed here as instruction is in system prompt
        ],
        temperature: 0.5, // Lower temperature for more predictable edits
        response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI tweak response content is empty.");
    }

    const parsedContent: AiGeneratedContent = JSON.parse(content);

    // Add validation similar to the generation function
    if (!parsedContent.headline /* ... etc */) {
        throw new Error("Tweaked JSON is missing required fields.");
    }

     // Ensure whatsappNumber consistency remains after tweak
     if (!parsedContent.whatsappCTA && parsedContent.whatsappNumber) {
        delete parsedContent.whatsappNumber;
    }
    // We trust the AI to not add whatsappCTA if it wasn't there and wasn't asked for
    // but if whatsappCTA becomes true, ensure number exists if possible from original
    if (parsedContent.whatsappCTA && !parsedContent.whatsappNumber && currentContent.whatsappNumber) {
        parsedContent.whatsappNumber = currentContent.whatsappNumber;
    }


    console.log("AI Tweaked Content:", parsedContent);
    return parsedContent;

  } catch (error) {
      console.error("Error tweaking landing page content:", error);
      throw new Error("Gagal melakukan tweak AI. Coba lagi nanti.");
  }
}

// === NEW FUNCTION for Generating Description ===
export async function generateBusinessDescription(
  namaUsaha: string,
  kategori: string
): Promise<string> {
  const systemPrompt = `
    Anda adalah copywriter AI yang ahli membuat deskripsi singkat (maksimal 3-4 kalimat atau sekitar 400 karakter) untuk landing page UMKM Indonesia.
    Fokus pada manfaat utama bagi calon pelanggan dan gunakan gaya bahasa yang persuasif namun profesional.
    Hindari penggunaan list/bullet point.
    Output HANYA teks deskripsi saja, tanpa kalimat pembuka/penutup atau format tambahan.
  `;

  const userMessage = `
    Nama Usaha: ${namaUsaha}
    Kategori Usaha: ${kategori}
    Buatkan deskripsi landing page yang menarik.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8, // Slightly higher temp for more creative descriptions
      max_tokens: 150, // Limit output length
      // No response_format needed as we expect plain text
    });

    const description = response.choices[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("OpenAI response for description is empty.");
    }

    console.log("AI Generated Description:", description);
    return description;

  } catch (error) {
    console.error("Error generating business description:", error);
    throw new Error("Gagal menghasilkan deskripsi AI.");
  }
}

// === NEW FUNCTION for Generating Color Theme ===
export async function generateColorTheme(
  namaUsaha: string,
  kategori: string
): Promise<ColorThemeJson> {
  const systemPrompt = `
    You are a UI color theme generator specializing in creating accessible and appealing themes for Indonesian SMEs (UMKM) based on shadcn/ui conventions.
    Your task is to generate a COMPLETE color theme based on the business name and category.
    Output ONLY a valid JSON object matching the ColorThemeJson interface, with no extra text or markdown formatting.
    All color values MUST be in HSL format as a string: "H S% L%" (e.g., "210 40% 96.1%"). Do NOT use Hex.

    Interface Definition:
    {
      primary: string; "on-primary": string;
      secondary: string; "on-secondary": string;
      background: string; "on-background": string;
      surface: string; "on-surface": string; // Typically slightly different from background for elements like cards
      accent: string; // A distinct color for highlights or specific CTAs
      muted: string; // For subtle backgrounds or borders
      border: string; // Default border color
      success: string; "on-success"?: string; // Generate success color, on-success is optional
      error: string; "on-error"?: string; // Generate error color, on-error is optional (often same as destructive)

      // Additional required shadcn tokens
      card: string; "on-card": string; // Often same as surface, on-surface
      popover: string; "on-popover": string; // Often same as card, on-card
      destructive: string; "on-destructive": string; // For destructive actions (often same as error)
      input: string; // Border color for input fields (often same as border or slightly different)
      ring: string; // Focus ring color

      // Foreground variants (derive if possible, but define explicitly)
      foreground: string; // Alias for on-background
      primary_foreground: string; // Alias for on-primary
      secondary_foreground: string; // Alias for on-secondary
      muted_foreground: string; // Text on muted background
      accent_foreground: string; // Text on accent background
      destructive_foreground: string; // Alias for on-destructive
      card_foreground: string; // Alias for on-card
      popover_foreground: string; // Alias for on-popover
    }

    Color Generation Guidelines:
    1.  **Accessibility:** Ensure sufficient contrast between background colors (primary, secondary, background, surface, card, popover, accent, destructive, muted) and their corresponding foreground colors (on-*, *_foreground). Use WCAG AA contrast ratios as a target. For example, 'on-primary' must contrast well with 'primary'. 'foreground' must contrast with 'background'. 'card-foreground' must contrast with 'card'.
    2.  **Category Appropriateness:** Choose a 'primary' color suitable for the business category (e.g., food=warm tones like orange/red, tech=blue/purple, nature=green, finance=blue/green, beauty=pink/purple/peach).
    3.  **Harmony:** Secondary and accent colors should complement the primary color. Background, surface, card, popover should generally be neutral (light or dark depending on the theme type).
    4.  **Consistency:**
        - 'on-primary', 'primary_foreground' should be the same.
        - 'on-secondary', 'secondary_foreground' should be the same.
        - 'on-background', 'foreground' should be the same.
        - 'on-card', 'card_foreground' should be the same, and often the same as 'on-surface'.
        - 'on-popover', 'popover_foreground' should be the same, and often the same as 'on-card'.
        - 'on-destructive', 'destructive_foreground' should be the same.
        - 'error' and 'destructive' can often be the same color. 'on-error' and 'on-destructive'/'destructive_foreground' should also be the same.
        - 'surface' and 'card' are often the same. 'popover' is often the same as 'card'.
        - 'input' border is often the same as 'border'.
        - 'accent_foreground' often uses the same color as 'on-primary' for simplicity and contrast.
        - 'muted_foreground' should contrast with 'muted'.
    5.  **HSL Format:** Strictly use the "H S% L%" format for all color strings.

    Example (Light Theme):
    {
      "primary": "222.2 47.4% 11.2%", "on-primary": "0 0% 100%",
      "secondary": "210 40% 96.1%", "on-secondary": "222.2 47.4% 11.2%",
      "background": "0 0% 100%", "on-background": "222.2 47.4% 11.2%",
      "surface": "0 0% 100%", "on-surface": "222.2 47.4% 11.2%",
      "accent": "217.2 91.2% 59.8%", "on-accent": "0 0% 100%", // Note: using on-accent in prompt, map to accent_foreground later if needed
      "muted": "210 40% 96.1%", "on-muted": "215.4 16.3% 46.9%", // Note: using on-muted in prompt, map to muted_foreground later if needed
      "border": "214.3 31.8% 91.4%",
      "success": "142.1 70.6% 45.3%", "on-success": "0 0% 100%",
      "error": "0 84.2% 60.2%", "on-error": "0 0% 100%",
      "card": "0 0% 100%", "on-card": "222.2 47.4% 11.2%",
      "popover": "0 0% 100%", "on-popover": "222.2 47.4% 11.2%",
      "destructive": "0 84.2% 60.2%", "on-destructive": "0 0% 100%",
      "input": "214.3 31.8% 91.4%",
      "ring": "215 20.2% 65.1%",
      "foreground": "222.2 47.4% 11.2%",
      "primary_foreground": "0 0% 100%",
      "secondary_foreground": "222.2 47.4% 11.2%",
      "muted_foreground": "215.4 16.3% 46.9%",
      "accent_foreground": "0 0% 100%",
      "destructive_foreground": "0 0% 100%",
      "card_foreground": "222.2 47.4% 11.2%",
      "popover_foreground": "222.2 47.4% 11.2%"
    }
  `;

    const userMessage = `
    Business Name: ${namaUsaha}
    Category: ${kategori}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Or a model known for good JSON generation
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8, // Slightly higher temperature for more varied color palettes
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI color theme response content is empty.");
    }

    const parsedTheme: Partial<ColorThemeJson> = JSON.parse(content);

    // --- Post-processing & Validation ---
    // Ensure all required keys exist and have valid HSL strings
    const requiredKeys: Array<keyof ColorThemeJson> = [
      'primary', 'on-primary', 'secondary', 'on-secondary', 'background', 'on-background',
      'surface', 'on-surface', 'accent', 'muted', 'border', 'success', 'error',
      'card', 'on-card', 'popover', 'on-popover', 'destructive', 'on-destructive',
      'input', 'ring', 'foreground', 'primary_foreground', 'secondary_foreground',
      'muted_foreground', 'accent_foreground', 'destructive_foreground',
      'card_foreground', 'popover_foreground'
    ];

    const finalTheme = {} as ColorThemeJson;
    let isValid = true;
    const hslRegex = /^\s*(\d{1,3}(\.\d+)?)\s+(\d{1,3}(\.\d+)?)%\s+(\d{1,3}(\.\d+)?)%\s*$/;

    for (const key of requiredKeys) {
      const value = parsedTheme[key];
      if (typeof value === 'string' && hslRegex.test(value)) {
        finalTheme[key] = value.trim(); // Assign valid value
      } else {
        // Attempt to fill based on conventions if missing or invalid
        console.warn(`Missing or invalid HSL for key: ${key}. Attempting fallback.`);
        if (key === 'foreground') finalTheme[key] = finalTheme['on-background'] || '0 0% 8%'; // dark default
        else if (key === 'primary_foreground') finalTheme[key] = finalTheme['on-primary'] || '0 0% 98%'; // light default
        else if (key === 'secondary_foreground') finalTheme[key] = finalTheme['on-secondary'] || '0 0% 8%';
        else if (key === 'card') finalTheme[key] = finalTheme['surface'] || finalTheme['background'] || '0 0% 100%';
        else if (key === 'on-card' || key === 'card_foreground') finalTheme[key] = finalTheme['on-surface'] || finalTheme['foreground'] || '0 0% 8%';
        else if (key === 'popover') finalTheme[key] = finalTheme['card'] || '0 0% 100%';
        else if (key === 'on-popover' || key === 'popover_foreground') finalTheme[key] = finalTheme['on-card'] || '0 0% 8%';
        else if (key === 'destructive') finalTheme[key] = finalTheme['error'] || '0 84% 60%';
        else if (key === 'on-destructive' || key === 'destructive_foreground') finalTheme[key] = parsedTheme['on-error'] || finalTheme['on-primary'] || '0 0% 98%';
        else if (key === 'input') finalTheme[key] = finalTheme['border'] || '214 32% 91%';
        else if (key === 'ring') finalTheme[key] = finalTheme['primary'] || '215 20% 65%';
        else if (key === 'accent_foreground') finalTheme[key] = finalTheme['on-primary'] || '0 0% 98%';
        else if (key === 'muted_foreground') finalTheme[key] = finalTheme['secondary_foreground'] || '215 16% 47%';
        else {
          console.error(`Could not determine fallback for missing/invalid key: ${key}`);
          isValid = false; // Mark as invalid if a required key cannot be filled
          break; // Stop processing if a critical key is missing
        }
         // Re-validate fallback value
        if (!hslRegex.test(finalTheme[key])) {
           console.error(`Fallback HSL value for ${key} is also invalid: ${finalTheme[key]}`);
           isValid = false;
           break;
        }
      }
    }

    // Add optional keys if they exist and are valid
    if (parsedTheme['on-success'] && typeof parsedTheme['on-success'] === 'string' && hslRegex.test(parsedTheme['on-success'])) {
      finalTheme['on-success'] = parsedTheme['on-success'].trim();
    }
    if (parsedTheme['on-error'] && typeof parsedTheme['on-error'] === 'string' && hslRegex.test(parsedTheme['on-error'])) {
      finalTheme['on-error'] = parsedTheme['on-error'].trim();
      // Ensure consistency if on-error was provided
      if (!finalTheme['on-destructive']) {
          // const errorColor = finalTheme['error'] || '0 84% 60%'; // Ensure error exists
          finalTheme['on-destructive'] = parsedTheme['on-error'];
      }
      if (!finalTheme['destructive_foreground']) {
          finalTheme['destructive_foreground'] = parsedTheme['on-error'];
      }
    }


    if (!isValid) {
        throw new Error("Generated color theme JSON is incomplete or has invalid HSL values after attempting fallbacks.");
    }


    console.log("AI Generated Color Theme (HSL):", finalTheme);
    return finalTheme;

  } catch (error) {
    console.error("Error generating color theme:", error);
    throw new Error(`Gagal menghasilkan tema warna AI: ${error instanceof Error ? error.message : String(error)}`);
  }
} 