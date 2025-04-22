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
  primaryColor: string; // Hex color code (e.g., "#3B82F6")
  ctaText: string; // Text for the main Call to Action button
  layoutStyle: 'standard' | 'minimal' | string; // Predefined or custom
  tone: 'professional' | 'friendly' | 'persuasive' | string; // Predefined or custom
  font: 'Inter' | 'Poppins' | string; // Font name or class
  whatsappCTA: boolean; // True if CTA should link to WhatsApp
  whatsappNumber?: string; // WhatsApp number (only if whatsappCTA is true)
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
    - ctaText: Strong call to action (e.g., "Pesan Sekarang", "Hubungi Kami", "Daftar Gratis").
    - layoutStyle: Suggest 'standard' or 'minimal'.
    - tone: Suggest 'professional', 'friendly', or 'persuasive'.
    - font: Suggest 'Inter' (preferred) or 'Poppins'.
    - whatsappCTA: Set to true ONLY if the user provided a WhatsApp number, otherwise false.
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