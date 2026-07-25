import { getEnv } from "@/lib/config";

type SendEmailInput = {
  html?: string;
  subject: string;
  text?: string;
  to: string;
};
type SendEmailResult = { error?: string; success: boolean };

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = getEnv("RESEND_API_KEY");

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is required to send email in production.",
      );
    }
    console.warn("[email] mock", { subject: input.subject, to: input.to });
    return { success: true };
  }

  const base = (getEnv("RESEND_BASE_URL") || "https://api.resend.com").replace(
    /\/+$/,
    "",
  );
  const from = getEnv("RESEND_FROM_EMAIL");
  if (!from) {
    return { error: "RESEND_FROM_EMAIL belum dikonfigurasi.", success: false };
  }

  try {
    const response = await fetch(`${base}/emails`, {
      body: JSON.stringify({
        from,
        html: input.html,
        subject: input.subject,
        text: input.text,
        to: input.to,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      const error = await response.text();
      console.error("[email] Resend error:", error);
      return { error: "Gagal mengirim email. Coba lagi.", success: false };
    }
    return { success: true };
  } catch (error) {
    console.error("[email] Resend error:", error);
    return { error: "Gagal mengirim email. Coba lagi.", success: false };
  }
}
