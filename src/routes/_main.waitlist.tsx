import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { resolveUserWaitlistStatus } from "./api.user.waitlist";

import { WhatsAppCommunityInvite } from "@/components/community/WhatsAppCommunityInvite";
import {
  FormField,
  chipClass,
  textInputClass,
} from "@/components/form/FormFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { auth } from "@/lib/auth";
import { useSession } from "@/lib/auth-client";
import { useValidatedForm } from "@/lib/forms";
import { useRouter } from "@/lib/navigation";
import {
  fetchJson,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateWaitlistStatus,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { uploadTempImageFile } from "@/lib/uploads/temp-image-client";
import { isWaitlistEnabled } from "@/lib/waitlist-enabled";
import { getOwnWaitlistEntry } from "@/lib/waitlist-own-entry";

// Server-side gate: must be signed-in AND (gate disabled OR not yet approved).
// Runs in the route loader so the page never renders for users who shouldn't
// see it, and so the own-entry status is already known on the very first
// render — the client-side ownQuery below is seeded from this instead of
// starting from `undefined`, which is what used to cause a form -> success
// flash while the client fetch was still in flight.
const gateIfApproved = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw redirect({ to: "/" });
  }

  const { isAdminEmail, isWaitlistApproved } = await import("@/lib/waitlist");
  const email = session.user.email;
  const isAdmin = isAdminEmail(email);
  const isApproved = await isWaitlistApproved(email);
  const waitlistEnabled = await isWaitlistEnabled();
  const isDev = process.env.NODE_ENV === "development";

  const resolved = resolveUserWaitlistStatus({
    email,
    isAdmin,
    isApproved,
    isDevelopment: isDev,
    waitlistEnabled,
  });

  if (resolved.status === "approved") {
    throw redirect({ to: "/" });
  }

  const own = await getOwnWaitlistEntry(email);
  return { own, isAdmin };
});

export const Route = createFileRoute("/_main/waitlist")({
  loader: async () => await gateIfApproved(),
  component: WaitlistPage,
});

const BUSINESS_CATEGORIES = [
  "Makanan & Minuman",
  "Fashion",
  "Kecantikan",
  "Kerajinan",
  "Jasa",
  "Lainnya",
] as const;

const BUSINESS_DURATIONS = [
  "Kurang dari 6 bulan",
  "6 bulan - 1 tahun",
  "1 - 3 tahun",
  "Lebih dari 3 tahun",
] as const;

// Single schema is the source of truth: client validates before submit, the
// server re-runs the same rules via buildWaitlistStory. Empty strings are
// allowed here for optional fields; we coerce them away only at submit time.
const waitlistSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Nama usaha minimal 2 karakter.")
    .max(160, "Nama usaha terlalu panjang."),
  businessType: z.string(),
  storyOffers: z.string().trim().min(2, "Jawab dulu: kamu jualan apa?"),
  storySince: z.enum(BUSINESS_DURATIONS, {
    error: "Pilih salah satu.",
  }),
  storyGoal: z
    .string()
    .trim()
    .min(2, "Jawab dulu: mau bikin website buat apa?"),
  photo: z
    .array(z.instanceof(File, { message: "Upload foto usaha dulu." }))
    .min(1, "Upload setidaknya 1 foto usaha.")
    .max(3, "Maksimal 3 foto.")
    .superRefine((files, ctx) => {
      for (const file of files) {
        if (file.size <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ada file foto kosong.",
          });
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ukuran foto maksimal 5 MB per file.",
          });
          return;
        }
      }
    }),
});

type WaitlistValues = z.infer<typeof waitlistSchema>;

const EMPTY_VALUES: WaitlistValues = {
  businessName: "",
  businessType: "",
  photo: [],
  storyGoal: "",
  storyOffers: "",
  storySince: BUSINESS_DURATIONS[0],
};

type OwnEntry = {
  businessName: string;
  businessType: string | null;
  id: string;
  rejectionReason: string | null;
  status: string;
  story: string;
};

function WaitlistPage() {
  const { own: initialOwn, isAdmin } = Route.useLoaderData();
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [devSkipDone, setDevSkipDone] = useState(false);
  const [step, setStep] = useState(1);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotoKeys, setUploadingPhotoKeys] = useState(
    () => new Set<string>(),
  );
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const uploadingPhotoCount = uploadingPhotoKeys.size;
  const hasTurnstile = Boolean(getTurnstileSiteKey());
  const isDev = import.meta.env.DEV;

  const form = useValidatedForm<WaitlistValues>({
    initialValues: EMPTY_VALUES,
    onSubmit: async (values) => {
      if (uploadingPhotoCount > 0) {
        throw new Error("Tunggu hingga semua foto terunggah.");
      }
      if (photoAssetIds.length === 0) {
        throw new Error("Upload setidaknya 1 foto usaha.");
      }
      const fd = new FormData();
      fd.append("businessName", values.businessName.trim());
      if (values.businessType) {
        fd.append("businessType", values.businessType);
      }
      fd.append("storyOffers", values.storyOffers.trim());
      fd.append("storySince", values.storySince);
      fd.append("storyGoal", values.storyGoal.trim());
      for (const assetId of photoAssetIds) {
        fd.append("assetIds", assetId);
      }
      fd.append("cf-turnstile-response", "dev");
      const response = await fetch("/api/waitlist", {
        body: fd,
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(json.message ?? "Gagal mengirim pendaftaran.");
      }
    },
    schema: waitlistSchema,
  });

  // Pre-fill on first load from the user's last submission, or restore draft from localStorage.
  const ownQuery = useQuery({
    queryFn: () =>
      fetchWaitlistStatus().then((data) => ({
        own: (data.own as OwnEntry | null | undefined) ?? null,
      })),
    queryKey: ["user", "waitlist", "own"],
    staleTime: 0,
    initialData: { own: initialOwn },
  });

  const statusQuery = useQuery({
    queryFn: fetchWaitlistStatus,
    queryKey: queryKeys.waitlistStatus,
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });
  const isApproved = statusQuery.data?.status === "approved" || submitted;
  const ownIsDevSkip =
    ownQuery.data?.own?.businessName.startsWith("[dev-skip]") ?? false;
  const ownStatus = ownQuery.data?.own?.status;
  // Pending/waitlisted means a real entry is already sitting in review — keep
  // showing the "submitted" screen across reloads instead of re-showing the
  // empty form. Rejected falls through to the form so the user can fix and
  // resubmit; that branch shows the rejection reason instead.
  const stillPending = ownStatus === "pending" || ownStatus === "waitlisted";
  const wasRejected = ownStatus === "rejected";

  // Restore step and form values from localStorage when mounting/ownQuery settles.
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem("umkmcepat:waitlist:step");
      if (savedStep) {
        setStep(Number(savedStep));
      }

      const savedValuesJson = localStorage.getItem("umkmcepat:waitlist:values");
      if (savedValuesJson) {
        const saved = JSON.parse(savedValuesJson);
        if (saved.businessName) {
          form.setField("businessName", saved.businessName);
        }
        if (saved.businessType) {
          form.setField("businessType", saved.businessType);
        }
        if (saved.storyOffers) {
          form.setField("storyOffers", saved.storyOffers);
        }
        if (saved.storySince) {
          form.setField("storySince", saved.storySince);
        }
        if (saved.storyGoal) {
          form.setField("storyGoal", saved.storyGoal);
        }
      } else {
        const own = ownQuery.data?.own;
        if (own) {
          form.setField("businessName", own.businessName);
          form.setField("businessType", own.businessType ?? "");
        }
      }
    } catch (err) {
      console.error("Gagal memuat draft waitlist dari localStorage:", err);
    }
    // Only run on initial hydrate/hydration of ownQuery.
  }, [ownQuery.data]);

  // Persist form values (except photo file object) to localStorage as the user types.
  useEffect(() => {
    try {
      const valuesToSave = {
        businessName: form.values.businessName,
        businessType: form.values.businessType,
        storyOffers: form.values.storyOffers,
        storySince: form.values.storySince,
        storyGoal: form.values.storyGoal,
      };
      localStorage.setItem(
        "umkmcepat:waitlist:values",
        JSON.stringify(valuesToSave),
      );
    } catch (err) {
      console.error("Gagal menyimpan draft waitlist:", err);
    }
  }, [
    form.values.businessName,
    form.values.businessType,
    form.values.storyOffers,
    form.values.storySince,
    form.values.storyGoal,
  ]);

  // Persist current step to localStorage when it changes.
  useEffect(() => {
    try {
      localStorage.setItem("umkmcepat:waitlist:step", String(step));
    } catch (err) {
      console.error("Gagal menyimpan step waitlist:", err);
    }
  }, [step]);

  useEffect(() => {
    const urls = form.values.photo.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [form.values.photo]);

  const submit = useMutation({
    mutationFn: form.handleSubmit,
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengirim pendaftaran.",
      );
    },
    onSuccess: async () => {
      setSubmitted(true);
      try {
        localStorage.removeItem("umkmcepat:waitlist:values");
        localStorage.removeItem("umkmcepat:waitlist:step");
      } catch (err) {
        console.error("Gagal membersihkan draft waitlist:", err);
      }
      await invalidateWaitlistStatus(queryClient);
      toast.success("Pendaftaran kamu sudah masuk antrian. Terima kasih!");
    },
  });

  // Admin-only dev skip: approves the signed-in user's waitlist entry via a
  // dev-only endpoint so the MainChrome gate lets them through without filling
  // the form. Restricted to admins (not all dev users) so that livestream
  // viewers on a tunnel URL still see the real waitlist flow.
  const devSkipMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ message?: string }>("/api/dev/skip-waitlist", {
        method: "POST",
      }),
    onSuccess: async () => {
      setDevSkipDone(true);
      toast.success("Pendaftaran di-skip (admin bypass).");
      await invalidateWaitlistStatus(queryClient);
      setTimeout(() => router.replace("/"), 1500);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal skip pendaftaran.",
      );
    },
  });

  // Admin self-approve: lets an admin who has filled out the waitlist form
  // approve their own pending entry with one click from the post-submit
  // "Terima kasih" view. Server-side authorization is the existing
  // requireAdmin() check on /api/admin/waitlist — the entry id is sourced
  // from the route loader, never from user input.
  const adminSelfApproveMutation = useMutation({
    mutationFn: async () => {
      const entryId = initialOwn?.id ?? ownQuery.data?.own?.id;
      if (!entryId) {
        throw new Error("Tidak ada pendaftaran yang bisa disetujui.");
      }
      return fetchJson<{ status?: string }>("/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({ action: "approve", entryId }),
      });
    },
    onSuccess: async () => {
      toast.success("Pendaftaran disetujui (admin bypass).");
      await invalidateWaitlistStatus(queryClient);
      setTimeout(() => router.replace("/"), 1500);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyetujui pendaftaran.",
      );
    },
  });

  // Dev-mode reset: clears the signed-in user's approved entry so the gate
  // can be re-tested end-to-end. Only shown when the current entry was
  // auto-generated by /api/dev/skip-waitlist (signaled by the business-name
  // prefix). Hidden in production.
  const devResetMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ message?: string }>("/api/dev/reset-waitlist", {
        method: "POST",
      }),
    onSuccess: async () => {
      await invalidateWaitlistStatus(queryClient);
      toast.success(
        "Approval di-reset (admin bypass). Refresh / untuk tes gate.",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal reset pendaftaran.",
      );
    },
  });

  const combinedStoryLength =
    form.values.storyOffers.trim().length +
    form.values.storySince.length +
    form.values.storyGoal.trim().length;
  const storyTooShort = combinedStoryLength + 30 < 80;
  const canSubmit =
    !submit.isPending &&
    uploadingPhotoCount === 0 &&
    photoAssetIds.length > 0 &&
    form.values.photo.length > 0 &&
    !storyTooShort &&
    !form.errors.businessName &&
    !form.errors.storyOffers &&
    !form.errors.storySince &&
    !form.errors.storyGoal &&
    !form.errors.photo;
  if (devSkipDone) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-surface-warm-white">
        <div className="flex size-14 items-center justify-center rounded-full border border-aurora-orange/30 bg-aurora-orange/10 text-aurora-orange">
          <Check className="size-7" strokeWidth={2.5} />
        </div>
        <h1 className="text-heading-xl font-semibold tracking-tight">
          Berhasil di-skip!
        </h1>
        <p className="max-w-md text-sm text-surface-warm-white/60">
          Mengalihkan ke beranda...
        </p>
      </div>
    );
  }

  if (submitted || stillPending) {
    return (
      <SuccessScreen
        businessName={
          form.values.businessName || ownQuery.data?.own?.businessName || ""
        }
        email={session?.user?.email ?? undefined}
        isAdmin={isAdmin}
        entryId={initialOwn?.id ?? ownQuery.data?.own?.id ?? undefined}
        onAdminApprove={() => adminSelfApproveMutation.mutate()}
        isApproving={adminSelfApproveMutation.isPending}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-stretch px-spacing-4 pb-24 pt-spacing-8 text-surface-warm-white sm:px-spacing-8">
      <header className="flex flex-col items-center gap-spacing-3 pb-spacing-6 text-center">
        <h1 className="text-heading-xl font-semibold tracking-tight">
          Daftar Tunggu
        </h1>
      </header>

      {wasRejected ? (
        <div className="mb-spacing-6 rounded-radius-lg border border-destructive/30 bg-destructive/10 px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/85">
          <p className="font-semibold text-surface-warm-white">
            Pendaftaran sebelumnya belum bisa kami terima
          </p>
          {ownQuery.data?.own?.rejectionReason ? (
            <p className="mt-spacing-2 text-surface-warm-white/70">
              Alasan: {ownQuery.data.own.rejectionReason}
            </p>
          ) : null}
          <p className="mt-spacing-2 text-surface-warm-white/70">
            Silakan perbaiki dan ajukan lagi di bawah ini.
          </p>
        </div>
      ) : null}

      <ProgressBar currentStep={step} />

      {isDev && ownIsDevSkip && isApproved ? (
        <div className="mt-spacing-4 flex flex-col items-center gap-spacing-3 rounded-radius-lg border border-aurora-orange/30 bg-aurora-orange/10 px-spacing-5 py-spacing-4 text-center text-sm text-surface-warm-white/85">
          <p>
            Akun kamu sudah auto-approved lewat dev skip. Kamu bisa pakai
            aplikasi penuh.
          </p>
          <button
            className="text-xs text-aurora-rose underline-offset-4 hover:underline disabled:opacity-50"
            disabled={devResetMutation.isPending}
            onClick={() => devResetMutation.mutate()}
            type="button"
          >
            {devResetMutation.isPending
              ? "Mereset..."
              : "Reset approval biar bisa tes gate lagi (admin bypass)"}
          </button>
        </div>
      ) : null}

      <form
        className="flex w-full flex-col"
        onSubmit={(event) => event.preventDefault()}
      >
        {step === 1 ? (
          <Step1
            errorMessage={form.errorMessage}
            markTouched={form.markTouched}
            onChange={form.setField}
            values={form.values}
          />
        ) : null}
        {step === 2 ? (
          <Step2
            errorMessage={form.errorMessage}
            hasError={form.hasError}
            markTouched={form.markTouched}
            onChange={form.setField}
            storyTooShort={storyTooShort}
            touched={form.touched}
            values={form.values}
          />
        ) : null}
        {step === 3 ? (
          <Step3
            errorMessage={form.errorMessage}
            onAddPhotos={async (newFiles) => {
              const startLen = form.values.photo.length;
              const combined = [...form.values.photo, ...newFiles].slice(0, 3);
              const accepted = combined.slice(startLen);
              form.setField("photo", combined as WaitlistValues["photo"]);
              const keys = accepted.map(waitlistPhotoKey);
              setUploadingPhotoKeys((prev) => new Set([...prev, ...keys]));
              for (const file of accepted) {
                const key = waitlistPhotoKey(file);
                try {
                  const { assetId } = await uploadTempImageFile(file);
                  setPhotoAssetIds((prev) => [...prev, assetId]);
                } catch {
                  toast.error("Gagal mengunggah foto.");
                } finally {
                  setUploadingPhotoKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                  });
                }
              }
            }}
            onRemovePhoto={(index) => {
              const removed = form.values.photo[index];
              if (removed) {
                const key = waitlistPhotoKey(removed);
                setUploadingPhotoKeys((prev) => {
                  if (!prev.has(key)) {
                    return prev;
                  }
                  const next = new Set(prev);
                  next.delete(key);
                  return next;
                });
              }
              const next = form.values.photo.filter((_, i) => i !== index);
              form.setField("photo", next as WaitlistValues["photo"]);
              setPhotoAssetIds((prev) => prev.filter((_, i) => i !== index));
            }}
            photoCount={form.values.photo.length}
            photoPreviews={photoPreviews}
            photoUploading={form.values.photo.map((file) =>
              uploadingPhotoKeys.has(waitlistPhotoKey(file)),
            )}
          />
        ) : null}

        {step === 3 ? <PublicContentNotice /> : null}

        {hasTurnstile && step === 3 ? (
          <p className="mt-spacing-4 text-xs text-surface-warm-white/50">
            Ada cek keamanan sebelum kirim.
          </p>
        ) : null}

        <div className="mt-spacing-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="flex items-center gap-spacing-2 text-sm text-surface-warm-white/60 transition hover:text-surface-warm-white"
            >
              <ArrowLeft className="size-4" />
              Kembali
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => {
                if (step === 1) {
                  form.markTouched("businessName");
                  if (form.errors.businessName) {
                    toast.error(form.errors.businessName);
                    return;
                  }
                }
                if (step === 2) {
                  form.markTouched("storyOffers");
                  form.markTouched("storySince");
                  form.markTouched("storyGoal");
                  if (
                    form.errors.storyOffers ||
                    form.errors.storySince ||
                    form.errors.storyGoal
                  ) {
                    toast.error(
                      form.errors.storyOffers ||
                        form.errors.storyGoal ||
                        form.errors.storySince ||
                        "Perbaiki dulu jawabannya.",
                    );
                    return;
                  }
                  if (storyTooShort) {
                    toast.error(
                      "Total jawabannya minimal 80 karakter biar kami yakin.",
                    );
                    return;
                  }
                }
                setStep((s) => Math.min(3, s + 1));
              }}
              className="flex items-center gap-spacing-2"
            >
              Lanjut
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                if (!canSubmit) {
                  return;
                }
                form.markTouched("photo");
                setConfirmOpen(true);
              }}
              disabled={!canSubmit}
              size="lg"
              className="flex items-center gap-spacing-2"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  Kirim Pendaftaran
                  <Check className="size-4" />
                </>
              )}
            </Button>
          )}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent showCloseButton className="max-w-md">
            <DialogHeader>
              <DialogTitle>Sebelum mengirim</DialogTitle>
              <DialogDescription>
                Cerita usaha dan foto yang kamu kirim bisa dipakai sebagai studi
                kasus publik. Jangan isi data sensitif seperti alamat rumah,
                nomor rekening, atau data pelanggan. Nama akun dan email tetap
                privat.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-spacing-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-radius-lg px-spacing-7 py-spacing-3 text-sm text-surface-warm-white/70 transition hover:bg-white/[0.06] hover:text-surface-warm-white"
                onClick={() => setConfirmOpen(false)}
                disabled={submit.isPending}
              >
                Batal
              </button>
              <Button
                type="button"
                className="flex items-center gap-spacing-2"
                disabled={!canSubmit}
                onClick={() => {
                  if (!canSubmit) {
                    return;
                  }
                  setConfirmOpen(false);
                  submit.mutate();
                }}
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  "Saya paham, kirim"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {isDev && isAdmin ? (
          <div className="mt-spacing-6 flex flex-col items-center gap-spacing-3">
            <div className="flex w-full items-center gap-spacing-3 text-[10px] uppercase tracking-wider text-surface-warm-white/40">
              <span className="h-px flex-1 bg-surface-warm-white/10" />
              atau
              <span className="h-px flex-1 bg-surface-warm-white/10" />
            </div>
            <button
              className="text-xs text-surface-warm-white/60 underline-offset-4 hover:text-surface-warm-white hover:underline disabled:opacity-50"
              disabled={devSkipMutation.isPending}
              onClick={() => devSkipMutation.mutate()}
              type="button"
            >
              {devSkipMutation.isPending
                ? "Melewati..."
                : "Lewati pendaftaran (admin bypass)"}
            </button>
            {ownQuery.data?.own ? (
              <button
                className="text-[10px] uppercase tracking-wider text-aurora-rose/70 underline-offset-4 hover:text-aurora-rose hover:underline disabled:opacity-50"
                disabled={devResetMutation.isPending}
                onClick={() => devResetMutation.mutate()}
                type="button"
              >
                {devResetMutation.isPending
                  ? "Mereset..."
                  : "Reset pendaftaran (admin bypass)"}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function PublicContentNotice() {
  return (
    <aside className="mt-spacing-6 rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/[0.04] px-spacing-5 py-spacing-4 text-sm leading-6 text-surface-warm-white/70">
      <p className="font-medium text-surface-warm-white/90">
        Studi kasus publik
      </p>
      <p className="mt-spacing-2">
        Cerita usaha dan foto yang kamu kirim bisa dipakai sebagai studi kasus
        publik. Jangan isi data sensitif (alamat rumah, nomor rekening, data
        pelanggan, dan sejenisnya). Nama akun dan email tetap privat.
      </p>
    </aside>
  );
}

function ProgressBar({ currentStep }: { currentStep: number }) {
  const steps = ["Usaha", "Cerita", "Foto"];
  return (
    <div className="mb-spacing-8 flex items-center justify-center gap-spacing-3">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isDone = stepNumber < currentStep;
        return (
          <div key={label} className="flex items-center gap-spacing-3">
            <div className="flex flex-col items-center gap-spacing-1">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                  isActive
                    ? "bg-aurora-orange text-[#151515]"
                    : isDone
                      ? "bg-aurora-orange/20 text-aurora-orange"
                      : "bg-surface-warm-white/10 text-surface-warm-white/60"
                }`}
              >
                {isDone ? <Check className="size-4" /> : stepNumber}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-warm-white/60">
                {label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div
                className={`mb-4 h-px w-10 transition ${
                  isDone ? "bg-aurora-orange/40" : "bg-surface-warm-white/10"
                }`}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Step1({
  values,
  onChange,
  errorMessage,
  markTouched,
}: {
  values: WaitlistValues;
  onChange: <K extends keyof WaitlistValues>(
    name: K,
    value: WaitlistValues[K],
  ) => void;
  errorMessage: (name: keyof WaitlistValues) => string | null;
  markTouched: (name: keyof WaitlistValues) => void;
}) {
  return (
    <Step
      question="Nama usaha kamu apa?"
      helper="Biar tim kami tahu kamu jualan apa."
      required
    >
      <FormField
        error={errorMessage("businessName")}
        label="Nama usaha"
        required
      >
        {({ id, invalid }) => (
          <input
            autoFocus
            className={textInputClass({ invalid })}
            id={id}
            onBlur={() => markTouched("businessName")}
            onChange={(event) => onChange("businessName", event.target.value)}
            placeholder="Contoh: Kopi Senja"
            type="text"
            value={values.businessName}
          />
        )}
      </FormField>

      <div className="mt-spacing-6">
        <span className="text-xs font-semibold text-surface-warm-white/80">
          Jenis usaha (opsional)
        </span>
        <div className="mt-spacing-3 flex flex-wrap gap-spacing-2">
          {BUSINESS_CATEGORIES.map((category) => {
            const active = values.businessType === category;
            return (
              <button
                key={category}
                className={chipClass({ active, invalid: false })}
                onClick={() => onChange("businessType", active ? "" : category)}
                type="button"
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>
    </Step>
  );
}

function Step2({
  values,
  onChange,
  hasError,
  errorMessage,
  markTouched,
  storyTooShort,
  touched,
}: {
  values: WaitlistValues;
  onChange: <K extends keyof WaitlistValues>(
    name: K,
    value: WaitlistValues[K],
  ) => void;
  hasError: (name: keyof WaitlistValues) => boolean;
  errorMessage: (name: keyof WaitlistValues) => string | null;
  markTouched: (name: keyof WaitlistValues) => void;
  storyTooShort: boolean;
  touched: Partial<Record<keyof WaitlistValues, boolean>>;
}) {
  const sinceInvalid = hasError("storySince");

  return (
    <Step
      question="Cerita singkat usaha kamu"
      helper="Jawab 3 pertanyaan di bawah."
      required
    >
      <FormField
        error={errorMessage("storyOffers")}
        label="Apa yang kamu jual?"
        required
      >
        {({ id, invalid }) => (
          <input
            autoFocus
            className={textInputClass({ invalid })}
            id={id}
            onBlur={() => markTouched("storyOffers")}
            onChange={(event) => onChange("storyOffers", event.target.value)}
            placeholder="Contoh: Kopi sachet dan kue tradisional"
            type="text"
            value={values.storyOffers}
          />
        )}
      </FormField>

      <div className="mt-spacing-5">
        <div className="flex items-end justify-between">
          <span className="text-xs font-semibold text-surface-warm-white/80">
            Sudah jualan sejak kapan?
            <span className="text-aurora-rose"> *</span>
          </span>
          {sinceInvalid ? (
            <span className="text-xs text-aurora-rose">
              {errorMessage("storySince")}
            </span>
          ) : null}
        </div>
        <div className="mt-spacing-3 grid grid-cols-2 gap-spacing-2">
          {BUSINESS_DURATIONS.map((duration) => {
            const active = values.storySince === duration;
            return (
              <button
                key={duration}
                className={chipClass({
                  active,
                  invalid: sinceInvalid && !active,
                })}
                onClick={() => onChange("storySince", duration)}
                type="button"
              >
                {duration}
              </button>
            );
          })}
        </div>
      </div>

      <FormField
        className="mt-spacing-5"
        error={
          errorMessage("storyGoal") ||
          ((touched.storyGoal || touched.storyOffers || touched.storySince) &&
          storyTooShort
            ? "Total jawabannya minimal 80 karakter biar kami yakin."
            : null)
        }
        label="Mau bikin website buat apa?"
        required
      >
        {({ id, invalid }) => (
          <input
            className={textInputClass({ invalid })}
            id={id}
            onBlur={() => markTouched("storyGoal")}
            onChange={(event) => onChange("storyGoal", event.target.value)}
            placeholder="Contoh: Tampilin menu biar pelanggan bisa pesan"
            type="text"
            value={values.storyGoal}
          />
        )}
      </FormField>
    </Step>
  );
}

function waitlistPhotoKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function Step3({
  photoPreviews,
  photoUploading,
  onAddPhotos,
  onRemovePhoto,
  photoCount,
  errorMessage,
}: {
  photoPreviews: string[];
  photoUploading: boolean[];
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (index: number) => void;
  photoCount: number;
  errorMessage: (name: keyof WaitlistValues) => string | null;
}) {
  const photoError = errorMessage("photo");
  const canAdd = photoCount < 3;
  return (
    <Step
      question="Upload foto usaha kamu"
      helper="Wajib minimal 1 foto. Bisa foto toko, produk, atau tampilan online kamu."
      required
    >
      <div className="flex flex-wrap gap-spacing-3">
        {photoPreviews.map((url, i) => (
          <ImageUploadThumb
            alt={`Foto ${i + 1}`}
            className="size-20"
            key={url}
            onRemove={() => onRemovePhoto(i)}
            src={url}
            uploading={photoUploading[i] === true}
          />
        ))}
        {canAdd ? (
          <label className="flex size-20 cursor-pointer flex-col items-center justify-center rounded-radius-md border border-dashed border-surface-warm-white/20 bg-surface-warm-white/5 text-surface-warm-white/60 transition hover:border-aurora-orange/40 hover:bg-surface-warm-white/10 hover:text-surface-warm-white/80">
            <ImagePlus className="size-5" />
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide">
              Upload
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;
                if (!files) {
                  return;
                }
                const remaining = 3 - photoCount;
                const toAdd = Array.from(files).slice(0, remaining);
                onAddPhotos(toAdd);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>

      {photoError ? (
        <p className="mt-spacing-2 text-xs text-aurora-rose">{photoError}</p>
      ) : (
        <p className="mt-spacing-2 text-xs text-surface-warm-white/50">
          {photoCount}/3 foto · PNG / JPG / WEBP, maksimal 5 MB per file
        </p>
      )}
    </Step>
  );
}

function Step({
  question,
  helper,
  required,
  children,
}: {
  question: string;
  helper: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <h2 className="text-center text-heading-lg font-semibold tracking-tight text-surface-warm-white">
        {question}
        {required ? <span className="text-aurora-rose"> *</span> : null}
      </h2>
      <p className="mt-spacing-2 text-center text-sm text-surface-warm-white/60">
        {helper}
      </p>
      <div className="mt-spacing-8">{children}</div>
    </div>
  );
}

function SuccessScreen({
  businessName,
  email,
  isAdmin,
  entryId,
  onAdminApprove,
  isApproving,
}: {
  businessName: string;
  email?: string;
  isAdmin: boolean;
  entryId?: string;
  onAdminApprove: () => void;
  isApproving: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-surface-warm-white">
      <div className="flex size-14 items-center justify-center rounded-full border border-aurora-orange/30 bg-aurora-orange/10 text-aurora-orange">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <h1 className="text-heading-xl font-semibold tracking-tight">
        Terima kasih, {businessName || "kamu"}!
      </h1>
      <p className="max-w-md text-sm text-surface-warm-white/60">
        Pendaftaran kamu sudah kami terima. Tim kami akan menghubungi lewat
        {email ? (
          <>
            {" "}
            email <span className="text-surface-warm-white/80">{email}</span>
          </>
        ) : (
          " email"
        )}{" "}
        setelah kami cek.
      </p>
      <WhatsAppCommunityInvite variant="waitlist" />
      <Link
        href="/"
        className="text-sm text-surface-warm-white/60 underline-offset-4 transition hover:text-surface-warm-white hover:underline"
      >
        Lihat beranda
      </Link>
      {isAdmin && entryId ? (
        <button
          className="mt-spacing-4 text-xs text-surface-warm-white/60 underline-offset-4 hover:text-surface-warm-white hover:underline disabled:opacity-50"
          disabled={isApproving}
          onClick={onAdminApprove}
          type="button"
        >
          {isApproving ? "Menyetujui..." : "Setujui saya (admin bypass)"}
        </button>
      ) : null}
    </div>
  );
}
