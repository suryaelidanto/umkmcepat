import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getTurnstileSiteKey } from "@/lib/turnstile";

export const Route = createFileRoute("/_main/waitlist")({
  component: WaitlistPage,
});

function WaitlistPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const hasTurnstile = Boolean(getTurnstileSiteKey());

  const submit = useMutation({
    mutationFn: async () => {
      const form = new FormData(formRef.current ?? undefined);
      if (hasTurnstile) {
        form.append(
          "cf-turnstile-response",
          (form.get("cf-turnstile-response") as string) || "dev",
        );
      } else {
        form.append("cf-turnstile-response", "dev");
      }
      const response = await fetch("/api/waitlist", {
        body: form,
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(json.message ?? "Gagal mengirim pendaftaran.");
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengirim pendaftaran.",
      );
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Permintaan kamu masuk antrian. Terima kasih!");
    },
  });

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center gap-spacing-6 px-spacing-6 py-spacing-14 text-center">
        <h1 className="text-heading-lg font-[600] tracking-[-0.9px]">
          Terima kasih, {businessName || "kamu"}!
        </h1>
        <p className="text-body-large text-secondary">
          Permintaan kamu masuk antrian pilot. Kami akan meninjau cerita usaha
          kamu dan menghubungi lewat email begitu disetujui.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-spacing-6 py-spacing-14">
      <div className="flex flex-col gap-spacing-4">
        <h1 className="text-heading-xl font-[600] tracking-[-1.2px]">
          Gabung antrian pilot UMKM Cepat
        </h1>
        <p className="text-body-large text-secondary">
          Kami membuka pilot bertahap untuk UMKM Indonesia. Ceritakan usaha kamu
          — semakin jelas, semakin yakin kami menyetujui. Gambar usaha opsional
          tapi membantu.
        </p>
      </div>

      <form
        ref={formRef}
        className="mt-spacing-10 flex flex-col gap-spacing-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="Email" required>
          <input
            name="email"
            type="email"
            required
            className="h-11 w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-5 text-body-base outline-none focus:ring-2 focus:ring-action-primary"
            placeholder="kamu@email.com"
          />
        </Field>

        <Field label="Nama usaha" required>
          <input
            name="businessName"
            type="text"
            required
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            className="h-11 w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-5 text-body-base outline-none focus:ring-2 focus:ring-action-primary"
            placeholder="Kopi Senja"
          />
        </Field>

        <div className="grid gap-spacing-6 sm:grid-cols-2">
          <Field label="Telepon (opsional)">
            <input
              name="phone"
              type="tel"
              className="h-11 w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-5 text-body-base outline-none focus:ring-2 focus:ring-action-primary"
              placeholder="0812..."
            />
          </Field>
          <Field label="Jenis usaha (opsional)">
            <input
              name="businessType"
              type="text"
              className="h-11 w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-5 text-body-base outline-none focus:ring-2 focus:ring-action-primary"
              placeholder="Kedai kopi"
            />
          </Field>
        </div>

        <Field label="Cerita usaha kamu" required hint="Minimal 80 karakter.">
          <textarea
            name="story"
            required
            rows={5}
            className="w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-5 py-spacing-4 text-body-base outline-none focus:ring-2 focus:ring-action-primary"
            placeholder="Ceritakan usaha kamu — apa yang dijual, untuk siapa, sejak kapan, dan kenapa butuh website."
          />
        </Field>

        <Field
          label="Foto usaha (opsional)"
          hint="Membantu kami yakin menyetujui. PNG/JPG/WEBP, maksimal 5 MB."
        >
          <input
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-body-small text-secondary"
          />
        </Field>

        {hasTurnstile ? (
          <p className="text-body-small text-secondary">
            Verifikasi keamanan akan muncul sebelum submit.
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={submit.isPending}
          className="w-full sm:w-auto"
        >
          {submit.isPending ? "Mengirim..." : "Kirim pendaftaran"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  children,
  label,
  required,
  hint,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-spacing-2">
      <span className="text-label-emphasis font-[480]">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="text-body-small text-secondary">{hint}</span>
      ) : null}
    </label>
  );
}
