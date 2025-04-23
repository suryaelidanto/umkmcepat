import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.warn("Missing OPENAI_API_KEY environment variable. AI features will fail.");
  // throw new Error("Missing OPENAI_API_KEY environment variable");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Updated AI Content Structure ---
// More focused on persuasive elements and dynamic sections
export interface AiGeneratedContent {
  // Meta
  businessType: 'Product' | 'Service' | 'Other'; // AI's best guess based on input
  tone: 'professional' | 'friendly' | 'persuasive' | 'enthusiastic' | string; // Expanded options, context-dependent

  // Core Hero Content (Persuasive & Contextual)
  headline: string; // Compelling, benefit-driven, tailored to Product/Service
  subheadline: string; // Supports headline, adds detail/credibility
  heroDescription: string; // Persuasive intro, addresses pain points/desires (3-5 sentences)

  // Dynamic Content Sections (Tailored to Business Type)
  sections: Array<{
    id: string; // Suggested semantic ID (e.g., 'features', 'benefits', 'why-us', 'services', 'products', 'how-it-works', 'gallery')
    title: string; // Relevant title for the section (e.g., "Mengapa Memilih Kami?", "Layanan Unggulan Kami", "Produk Terlaris")
    content: string; // Formatted content (can be paragraph or list - AI decides best format and includes it as a single string)
    layoutHint?: 'list' | 'paragraph' | 'gallery_placeholder'; // Hint for frontend rendering
  }>;

  // Call To Action (Clear & Strong)
  ctaText: string; // Very specific, action-oriented, leads to conversion goal
  whatsappCTA: boolean; // Determines if CTA links to WhatsApp
  whatsappNumber?: string; // Included only if whatsappCTA is true

  // Optional aesthetic hints (less critical for core content)
  layoutStyle?: 'standard' | 'minimal' | 'modern' | string; // Optional suggestion
  font?: 'Inter' | 'Poppins' | string; // Optional suggestion

  // --- Fields being removed/handled elsewhere ---
  // primaryColor is handled by generateColorTheme
  // features (replaced by dynamic sections)
  // description (replaced by heroDescription)
  // featuresTitle, galleryTitle, etc. (replaced by dynamic sections[].title)
}

// === Color Theme Interface (Remains the same) ===
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

// --- Revamped AI Content Generation Function ---
export async function generateLandingPageContent(
  namaUsaha: string,
  kategori: string,
  deskripsi_user?: string,
  hasWhatsApp?: boolean
): Promise<AiGeneratedContent> {

  // --- NEW DETAILED SYSTEM PROMPT ---
  const systemPrompt = `
You are Genesis, a world-class digital marketing strategist and copywriter specializing in creating high-converting landing pages for Indonesian SMEs (UMKM). Your goal is NOT just to describe, but to **SELL** effectively by understanding the business and its target audience.

**Your Task:**
Generate a complete, persuasive landing page content structure based on the user's limited input. Output **ONLY** a valid JSON object adhering STRICTLY to the updated AiGeneratedContent interface below, with no introductory text, explanations, or markdown formatting outside the JSON structure.

**Output JSON Interface (AiGeneratedContent):**
\`\`\`json
{
  "businessType": "Product | Service | Other",
  "tone": "professional | friendly | persuasive | enthusiastic | string",
  "headline": "Catchy main headline (string, plain text only, max 15 words)",
  "subheadline": "Supporting subheadline (string, plain text only, max 25 words)",
  "heroDescription": "Detailed description of the business, value, offerings. **MUST BE 100% PLAIN TEXT. NO MARKDOWN (##,*, -, etc). NO EMOJI. NO HTML.** Write naturally. Use \\n ONLY to separate logical paragraphs if needed. Max ~2000 chars. (string)",
  "sections": [
    {
      "title": "Relevant Section Title for specific info (e.g., 'Layanan Utama', 'Tentang Kami')",
      "content": "Content for this section. **MUST BE 100% PLAIN TEXT. NO MARKDOWN (##,*, -, etc). NO EMOJI. NO HTML.** Use \\n ONLY to separate logical paragraphs if needed. Do not format as a list unless layoutHint is 'list'.",
      "layoutHint": "Optional: 'default' or 'list' or 'gallery_placeholder'"
    }
    // ... generate 1-3 highly relevant, focused sections that ADD to heroDescription ...
  ],
  "ctaText": "Compelling call-to-action button text (string, plain text only, max 5 words)",
  "whatsappCTA": boolean indicating if the CTA should link to WhatsApp (boolean),
  "whatsappNumber": "WhatsApp number if whatsappCTA is true, otherwise null (string or null)"
}
\`\`\`

**Core Instructions & Mindset:**

1.  **Analyze Input & Determine Business Type:** Carefully analyze 'Business Name', 'Category', and 'User Description' to determine if the core offering is a tangible **'Product'**, an intangible **'Service'**, or **'Other'**. This is CRUCIAL for tailoring the content.
2.  **Adopt the Right Tone:** Based on \`businessType\` and \`Category\`, choose the most appropriate \`tone\`.
    *   **Service (e.g., Konsultan, Agensi, Reparasi):** Usually 'professional' or 'persuasive', focusing on expertise, trust, solutions, and results.
    *   **Product (e.g., Makanan, Pakaian, Kerajinan):** Often 'enthusiastic', 'friendly', or 'persuasive', focusing on benefits, desire, uniqueness, and ease of purchase.
    *   **Other (e.g., Komunitas, Acara):** Adapt tone accordingly ('friendly', 'informative').
3.  **Craft Persuasive Hero Content:**
    *   \`headline\`: Grab attention instantly. Focus on the **main benefit** or solve a key **pain point**. Use strong verbs. Tailor to Product/Service.
    *   \`subheadline\`: Elaborate on the headline, add credibility, or highlight a key differentiator.
    *   \`heroDescription\`: Write a compelling narrative (3-5 sentences). Start with the customer's need/desire. Introduce the business as the solution. Emphasize unique value and benefits. Build trust and desire.
4.  **Generate Relevant & Dynamic Sections:** Create 2 to 4 \`sections\` that best showcase the business's value. **Do NOT use generic titles like "Fitur"**. Choose titles and content relevant to the \`businessType\`:\n    *   **If Service:** Consider sections like 'Layanan Kami' (list key services), 'Mengapa Memilih Kami?' (highlight differentiators/expertise), 'Proses Kerja Kami' (build transparency/trust), 'Studi Kasus/Portofolio' (provide proof).
    *   **If Product:** Consider sections like 'Keunggulan Produk' (list key benefits/features), 'Koleksi Kami' / 'Produk Terlaris' (showcase items), 'Testimoni Pelanggan' (social proof), 'Cara Pemesanan'.
    *   **For \`content\`:** Format it clearly. If it's a list of benefits/services/products, use bullet points (e.g., "- Benefit 1\\\\n- Benefit 2"). If it's explanatory, use a paragraph. Choose the \`layoutHint\` accordingly. For a gallery section, use \`layoutHint: 'gallery_placeholder'\` and write placeholder content like "Lihat hasil karya/produk kami yang luar biasa.".
5.  **Write a Powerful Call To Action (CTA):**
    *   \`ctaText\`: Be specific and action-oriented. What EXACTLY should the user do next?\n        *   If \`hasWhatsApp\` is true: Focus on direct contact (e.g., "Chat Langsung di WA Sekarang!", "Konsultasi Gratis via WhatsApp", "Pesan Produk via WA").
        *   If \`hasWhatsApp\` is false: Focus on the next logical step (e.g., "Lihat Semua Produk", "Pelajari Layanan Kami", "Daftar Workshop").
    *   \`whatsappCTA\`: Set strictly based on the \`hasWhatsApp\` input flag.
    *   \`whatsappNumber\`: Include ONLY if \`whatsappCTA\` is true.
6.  **Indonesian Context:** Use clear, natural Bahasa Indonesia suitable for UMKM and their customers.
7.  **Strict JSON Output:** Ensure the final output is ONLY the valid JSON object specified, without any other text.

**Example User Input for Guidance:**
\`\`\`
Business Name: Kopi Senja Abadi
Category: Minuman Kopi
User Description: Kedai kopi kecil dengan biji lokal berkualitas dan suasana tenang.
Has WhatsApp Number: Yes
\`\`\`
*(Your output for this should be a JSON object following the interface, likely with businessType: 'Product', a friendly/enthusiastic tone, relevant sections like 'Menu Andalan' or 'Kenapa Kopi Kami Spesial?', and a WhatsApp CTA).*

**PERINGATAN PENTING: Output HARUS HANYA JSON yang valid. JANGAN PERNAH menyertakan karakter markdown seperti \\\`###\\\`, \\\`*\\\`, atau \\\`_\\\` di dalam nilai string JSON manapun (terutama headline, subheadline, heroDescription, dan sections[].content). Nilai string harus berupa teks biasa atau teks dengan newline (\\\\n) jika diperlukan untuk daftar bullet dalam 'content'.**

Output Format: JSON object with the following structure. **ALL FIELDS LISTED HERE ARE MANDATORY unless explicitly marked optional.**
{
  "businessType": "Product | Service | Other",
  "tone": "professional | friendly | persuasive | enthusiastic | string",
  "headline": "Catchy main headline (string, plain text only, max 15 words)",
  "subheadline": "Supporting subheadline (string, plain text only, max 25 words)",
  "heroDescription": "Detailed description... PLAIN TEXT ONLY... Max ~2000 chars. (string)",
  "sections": [
    {
      "id": "string",
      "title": "Relevant Section Title...",
      "content": "Content... PLAIN TEXT ONLY...",
      "layoutHint": "Optional: 'default' or 'list' or 'gallery_placeholder'"
    }
    // ... generate 1-3 sections total ...
  ],
  "ctaText": "Compelling call-to-action... (string, plain text only, max 5 words)",
  "whatsappCTA": boolean,
  "whatsappNumber": "WhatsApp number if whatsappCTA is true, otherwise null (string or null)",
  "layoutStyle": "string | undefined",
  "font": "string | undefined"
}

Constraint Checklist & Confidence Score:
1. Generated Headline (Yes/No):
2. Generated Subheadline (Yes/No):
3. Generated Hero Description (PLAIN TEXT ONLY...) (Yes/No):
4. Generated 1-3 Sections **(Array with required fields)** (Yes/No):
5. Section Content (**PLAIN TEXT ONLY**, no markdown/emoji/tags) (Yes/No):
6. Generated CTA Text (Yes/No):
7. Generated WhatsApp CTA fields (Yes/No):
Confidence Score (1-5):

Confidence Score: (1-5) - Evaluate the quality and relevance of the generated content.

IMPORTANT:
- **CRITICAL:** ALL string values MUST be plain text. They MUST NOT contain ANY markdown (##, ###, *, _, lists like '- item'), emojis, or HTML tags. Use only standard punctuation and paragraph breaks (\\n).
- Focus on clarity, relevance, and the desired tone.
- Provide diverse and meaningful content for each section.
- If key information is sparse, make reasonable assumptions based on the category.
- Make sure the JSON is valid.
  `;

  const userMessage = `
    Business Name: ${namaUsaha}
    Category: ${kategori}
    User Description (Optional): ${deskripsi_user || '-'}
    Has WhatsApp Number: ${hasWhatsApp ? 'Yes' : 'No'}
  `;

  try {
    // Use a more capable model if necessary for complex instructions, but start with gpt-4o
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.75, // Balanced temperature for creativity and relevance
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI response content is empty.");
    }

    // Attempt to parse the JSON content
    let parsedContent: AiGeneratedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError);
      console.error("Raw OpenAI Response:", content); // Log raw response for debugging
      throw new Error("Gagal memproses respons dari AI. Format tidak valid.");
    }

    // --- Enhanced Validation & Default Fallbacks --- 
    // Instead of throwing error immediately, check each field and provide defaults

    if (!parsedContent.businessType || !['Product', 'Service', 'Other'].includes(parsedContent.businessType)) {
        console.warn("AI Validation Warning: Missing or invalid 'businessType', defaulting to 'Other'. Raw AI content:", content);
        parsedContent.businessType = 'Other';
    }
    if (!parsedContent.tone) {
        console.warn("AI Validation Warning: Missing 'tone', defaulting to 'professional'. Raw AI content:", content);
        parsedContent.tone = 'professional';
    }
    if (!parsedContent.headline) {
        console.warn("AI Validation Warning: Missing 'headline', defaulting to business name. Raw AI content:", content);
        parsedContent.headline = namaUsaha; // Use business name as fallback
    }
    if (!parsedContent.subheadline) {
        console.warn("AI Validation Warning: Missing 'subheadline', providing generic default. Raw AI content:", content);
        parsedContent.subheadline = `Solusi ${kategori} terbaik untuk Anda.`; // Generic fallback
    }
    if (!parsedContent.heroDescription) {
        console.warn("AI Validation Warning: Missing 'heroDescription', providing generic default. Raw AI content:", content);
        parsedContent.heroDescription = `Temukan ${kategori} berkualitas dari ${namaUsaha}. Kami menyediakan layanan dan produk terbaik untuk kebutuhan Anda.`; // Generic fallback
    }
    if (!Array.isArray(parsedContent.sections) || parsedContent.sections.length === 0) {
        console.warn("AI Validation Warning: Missing or empty 'sections', providing default section. Raw AI content:", content);
        parsedContent.sections = [
            { 
                id: 'about', 
                title: `Tentang ${namaUsaha}`, 
                content: `Informasi lebih lanjut mengenai ${namaUsaha} dan layanan yang kami tawarkan.`, 
                layoutHint: 'paragraph' 
            }
        ];
    } else {
        // Validate fields within each section
        parsedContent.sections = parsedContent.sections.map((section, index) => {
            let validatedSection = { ...section };
            if (!validatedSection.id) {
                console.warn(`AI Validation Warning: Section ${index} missing 'id', defaulting to 'section-${index}'.`);
                validatedSection.id = `section-${index}`;
            }
            if (!validatedSection.title) {
                console.warn(`AI Validation Warning: Section ${index} missing 'title', providing default.`);
                validatedSection.title = `Informasi Bagian ${index + 1}`;
            }
            if (!validatedSection.content) {
                console.warn(`AI Validation Warning: Section ${index} missing 'content', providing default.`);
                validatedSection.content = `Detail untuk bagian ini belum tersedia.`;
            }
            // Ensure layoutHint is valid if provided
            if (validatedSection.layoutHint && !['list', 'paragraph', 'gallery_placeholder'].includes(validatedSection.layoutHint)) {
                 console.warn(`AI Validation Warning: Section ${index} has invalid 'layoutHint', defaulting to 'paragraph'.`);
                validatedSection.layoutHint = 'paragraph';
            }
            return validatedSection;
        });
    }
    if (!parsedContent.ctaText) {
        console.warn("AI Validation Warning: Missing 'ctaText', providing default based on WhatsApp. Raw AI content:", content);
        parsedContent.ctaText = hasWhatsApp ? 'Hubungi via WA' : 'Pelajari Lebih Lanjut';
    }
    if (typeof parsedContent.whatsappCTA !== 'boolean') {
        console.warn("AI Validation Warning: Missing or invalid 'whatsappCTA', defaulting based on input flag. Raw AI content:", content);
        parsedContent.whatsappCTA = !!hasWhatsApp; // Default based on whether user provided number
    }

    // Ensure whatsappNumber consistency
    if (!parsedContent.whatsappCTA && parsedContent.whatsappNumber) {
        console.warn("Correcting AI output: Removing whatsappNumber because whatsappCTA is false.");
        delete parsedContent.whatsappNumber;
    }
    if (parsedContent.whatsappCTA && !hasWhatsApp) {
        console.warn("Correcting AI output: Setting whatsappCTA to false because no WhatsApp number was provided by the user.");
        parsedContent.whatsappCTA = false;
        delete parsedContent.whatsappNumber;
    }

    // --- Optional: Add basic content moderation or length checks here if needed ---

    console.log("AI Generated Content (Revamped V2):", parsedContent);
    return parsedContent;

  } catch (error) {
    console.error("Error generating landing page content (Revamped):", error);
    // Provide a more specific error message if possible
    if (error instanceof Error && error.message.includes("JSON")) {
         throw error; // Re-throw parsing errors
    }
    throw new Error(`Gagal menghasilkan konten AI: ${error instanceof Error ? error.message : 'Unknown AI Error'}`);
  }
}

// === Color Theme Generation Function (generateColorTheme) ===
// Keep this function as is for now, assuming it works well for generating the ColorThemeJson.
// It will be called separately by the API route.
export async function generateColorTheme(
  namaUsaha: string,
  kategori: string
): Promise<ColorThemeJson> {
  const systemPrompt = `
    You are an expert UI/UX designer specializing in color theory for branding Indonesian SMEs.
    Your task is to generate a complete, harmonious, and accessible color theme based on the business name and category.
    Output **ONLY** a valid JSON object adhering STRICTLY to the ColorThemeJson interface below.
    The output MUST use **HSL color format without the 'hsl()' wrapper**, just the numbers and percentages (e.g., "222.2 47.4% 11.2%").
    Ensure sufficient contrast between background/foreground pairs (e.g., primary/on-primary, background/foreground, card/on-card).
    Follow shadcn/ui conventions for color tokens.

    **Output JSON Interface (ColorThemeJson):**
    \`\`\`json
    {
      "primary": "string (HSL value)", "on-primary": "string (HSL value)",
      "secondary": "string (HSL value)", "on-secondary": "string (HSL value)",
      "background": "string (HSL value)", "on-background": "string (HSL value)",
      "surface": "string (HSL value)", "on-surface": "string (HSL value)",
      "accent": "string (HSL value)", "muted": "string (HSL value)",
      "border": "string (HSL value)", "success": "string (HSL value)", "error": "string (HSL value)",
      "card": "string (HSL value)", "on-card": "string (HSL value)",
      "popover": "string (HSL value)", "on-popover": "string (HSL value)",
      "destructive": "string (HSL value)", "on-destructive": "string (HSL value)",
      "input": "string (HSL value)", "ring": "string (HSL value)",
      "foreground": "string (HSL value)", "primary_foreground": "string (HSL value)",
      "secondary_foreground": "string (HSL value)", "muted_foreground": "string (HSL value)",
      "accent_foreground": "string (HSL value)", "destructive_foreground": "string (HSL value)",
      "card_foreground": "string (HSL value)", "popover_foreground": "string (HSL value)"
    }
    \`\`\`

    **Guidelines:**
    - Choose a 'primary' color that strongly reflects the business category (e.g., Food: warm tones; Tech: blues; Nature: greens).
    - **VARIATION IS KEY:** Generate diverse themes. **Actively avoid** themes where 'primary', 'secondary', and 'background' are all very light (e.g., Lightness > 85%). Aim for clear visual distinction. Randomly consider generating a **dark theme** (dark background, light text) or a **light theme** (light background, dark text).
    - Ensure high contrast for 'on-primary', 'on-background', 'on-card', etc.
    - Derive other colors (secondary, accent, muted, border, etc.) harmoniously.
    - **CRITICAL HSL FORMAT:** Output HSL values ONLY as strings like "210 40% 96.1%".
    - **EXAMPLE TO AVOID:** { primary: "210 20% 90%", secondary: "0 0% 95%", background: "0 0% 100%", ... } (This is too light/monochromatic).
  `;

   const userMessage = `
    Business Name: ${namaUsaha}
    Category: ${kategori}
    Generate a complete and *visually distinct* HSL color theme JSON according to the interface. Consider light or dark mode.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI color theme response content is empty.");
    }

    let parsedTheme: ColorThemeJson;
     try {
        parsedTheme = JSON.parse(content);
        // --- Add HSL Value Validation ---
        Object.values(parsedTheme).forEach(value => {
            if (typeof value !== 'string' || !/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value)) {
                throw new Error(`Invalid HSL format detected: "${value}". Expected format like "222.2 47.4% 11.2%".`);
            }
        });
    } catch (parseError) {
      console.error("Failed to parse or validate OpenAI Color JSON response:", parseError);
      console.error("Raw OpenAI Response:", content);
      throw new Error("Gagal memproses tema warna dari AI. Format tidak valid.");
    }

     // Basic check for essential keys (can be expanded)
    if (!parsedTheme.primary || !parsedTheme['on-primary'] || !parsedTheme.background || !parsedTheme.foreground) {
         console.error("Generated Color Theme is missing essential fields:", parsedTheme);
        throw new Error("Struktur tema warna AI yang dihasilkan tidak lengkap.");
    }


    console.log("AI Generated Color Theme (V2):", parsedTheme);
    return parsedTheme;

  } catch (error) {
    console.error("Error generating color theme:", error);
     if (error instanceof Error && (error.message.includes("JSON") || error.message.includes("HSL"))) {
         throw error; // Re-throw parsing/validation errors
    }
    throw new Error(`Gagal menghasilkan tema warna AI: ${error instanceof Error ? error.message : 'Unknown AI Error'}`);
  }
}


// --- Tweak Function (Cleaned up) ---
export async function tweakLandingPageContent(
  currentContent: AiGeneratedContent,
  userInstruction: string
): Promise<AiGeneratedContent> {

 const systemPrompt = `
    You are an expert landing page editor, focusing on improving conversion.
    The user wants to modify their existing landing page content based on their instruction.
    **Analyze the instruction carefully.** Does it target a specific section (headline, heroDescription, a specific section title/content) or a general aspect (tone, focus)?

    Current content (JSON): ${JSON.stringify(currentContent, null, 2)}

    User's instruction: ${userInstruction}

    Modify the current JSON based on the user's instruction.
    - If the instruction is specific (e.g., "Ubah headline menjadi...", "Tambahkan detail X ke bagian Y"), make the precise change.
    - If the instruction is general (e.g., "Buat lebih menjual", "Fokuskan pada kecepatan layanan"), intelligently revise the relevant parts (headline, descriptions, section content) to reflect the instruction, while maintaining the overall structure.
    - Preserve fields not mentioned in the instruction.
    - Ensure the output is **ONLY** the modified, valid JSON object matching the AiGeneratedContent interface provided below, with no extra text or markdown formatting.

    **Output JSON Interface (AiGeneratedContent):**
    \`\`\`json
    {
      "businessType": "${currentContent.businessType}",
      "tone": "string",
      "headline": "string",
      "subheadline": "string",
      "heroDescription": "string",
      "sections": [
        {
          "id": "string",
          "title": "string",
          "content": "string",
          "layoutHint": "list | paragraph | gallery_placeholder"
        }
      ],
      "ctaText": "string",
      "whatsappCTA": ${currentContent.whatsappCTA},
      "whatsappNumber": ${currentContent.whatsappNumber ? `"${currentContent.whatsappNumber}"` : undefined},
      "layoutStyle": "string | undefined",
      "font": "string | undefined"
    }
    \`\`\`
  `;

  try {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
        ],
        temperature: 0.5,
        response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI tweak response content is empty.");
    }

     let parsedContent: AiGeneratedContent;
    try {
        parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI tweak JSON response:", parseError);
      console.error("Raw OpenAI Response:", content);
      throw new Error("Gagal memproses hasil tweak dari AI. Format tidak valid.");
    }

    // Simplified validation for tweak
    if (
      !parsedContent.businessType ||
      !parsedContent.headline ||
      !parsedContent.ctaText
    ) {
      console.error("Tweaked JSON is missing required fields:", parsedContent);
      throw new Error("Struktur konten AI yang di-tweak tidak lengkap.");
    }

    // Ensure whatsappNumber consistency
     if (!parsedContent.whatsappCTA && parsedContent.whatsappNumber) {
        delete parsedContent.whatsappNumber;
    }
    if (parsedContent.whatsappCTA && !parsedContent.whatsappNumber && currentContent.whatsappNumber) {
        parsedContent.whatsappNumber = currentContent.whatsappNumber;
    }

    console.log("AI Tweaked Content (Revamped):", parsedContent);
    return parsedContent;

  } catch (error) {
      console.error("Error tweaking landing page content (Revamped):", error);
       if (error instanceof Error && error.message.includes("JSON")) {
         throw error; // Re-throw parsing errors
      }
      throw new Error(`Gagal melakukan tweak AI: ${error instanceof Error ? error.message : 'Unknown AI Error'}`);
  }
}


// === Description Generation Function (generateBusinessDescription - Sales Focused) ===
export async function generateBusinessDescription(
  namaUsaha: string,
  kategori: string
): Promise<string> {
  const systemPrompt = `
    You are an expert Indonesian digital marketing copywriter specializing in high-conversion landing page descriptions for SMEs (UMKM).
    Your **sole mission** is to write copy that **SELLS** and drives **CONVERSION**.
    Focus on the **customer's needs, desires, and pain points**, positioning the business as the perfect solution.
    Highlight unique benefits and create a sense of urgency or desire.
  `;

  const userMessage = `
    Business Name: ${namaUsaha}
    Category: ${kategori}

    Generate a **short, punchy, and highly persuasive** landing page description (around 2-3 concise paragraphs).

    **CRITICAL INSTRUCTIONS:**
    1.  **Format:** PURE PLAIN TEXT with standard sentences and paragraphs.
    2.  **Markdown/HTML:** **NO MARKDOWN (like **, ##, -, *) and NO HTML tags.** Absolutely forbidden.
    3.  **Emojis:** **Emojis ARE ALLOWED** and encouraged where they add value and personality 😊👍🎉, but use them sparingly and appropriately.
    4.  **Length:** Keep it **concise and impactful**, around 500-800 characters ideally. Focus on the core selling points.
    5.  **Tone:** Highly persuasive, benefit-driven, and engaging.

    Example of desired style (with emojis):
    "🚀 Tingkatkan penjualan Anda dengan [Nama Usaha]! Kami solusi [Kategori] terbaik untuk [target audiens].\\n\\n✨ Dapatkan [manfaat utama 1] dan [manfaat utama 2] dengan mudah. Produk kami [keunggulan unik].\\n\\n💬 Hubungi kami sekarang untuk penawaran spesial! 😉"
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.75,
      max_tokens: 250,
    });
    const description = response.choices[0]?.message?.content?.trim();
    if (!description) {
         throw new Error("OpenAI description response is empty.");
    }

    return description;

  } catch (error) {
    console.error("Error generating business description:", error);
    throw new Error(`Gagal menghasilkan deskripsi AI: ${error instanceof Error ? error.message : 'Unknown AI Error'}`);
  }
}

// ... (Ensure all exports are correct) ...