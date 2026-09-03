import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { auth } from "@/lib/auth/auth";
import { useSession } from "@/lib/auth/auth-client";
import { getTurnstileSiteKey } from "@/lib/auth/turnstile";
import { useValidatedForm } from "@/lib/forms";
import { useRouter } from "@/lib/navigation";
import {
  fetchJson,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateAdminWaitlistData,
  invalidateWaitlistStatus,
  queryKeys,
  waitlistPagePollInterval,
} from "@/lib/query-client";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";
import { getOwnWaitlistEntry } from "@/lib/waitlist/waitlist-own-entry";
import { resolveWaitlistView } from "@/lib/waitlist/waitlist-view";

// Server-side gate: must be signed-in AND (gate disabled OR not yet approved).
const gateIfApproved = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw redirect({ to: "/" });
  }

  const { isAdminEmail, isWaitlistApproved } =
    await import("@/lib/waitlist/waitlist");
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

function WaitlistPage() {
  const { own: initialOwn, isAdmin } = Route.useLoaderData();
  const { data: session } = useSession();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const approvalTimerRef = useRef<number | null>(null);
  const approvalToastShownRef = useRef(false);
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

  // The shared status query owns both the effective gate and the user's own
  const statusQuery = useQuery({
    queryFn: fetchWaitlistStatus,
    queryKey: queryKeys.waitlistStatus,
    ...GATE_QUERY_OPTIONS,
    initialData: { status: null, own: initialOwn },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) =>
      waitlistPagePollInterval(query.state.data, submitted),
  });
  const isApproved = statusQuery.data?.status === "approved";
  const ownIsDevSkip =
    statusQuery.data?.own?.businessName.startsWith("[dev-skip]") ?? false;
  const ownStatus = statusQuery.data?.own?.status ?? null;
  const view = resolveWaitlistView({
    effectiveStatus: statusQuery.data?.status,
    ownStatus,
    submitted,
  });
  const wasRejected = ownStatus === "rejected";

  useEffect(() => {
    if (!isApproved || devSkipDone || approvalTimerRef.current !== null) {
      return;
    }
    if (!approvalToastShownRef.current) {
      approvalToastShownRef.current = true;
      toast.success("Pendaftaran disetujui. Mengalihkan ke beranda...");
    }
    approvalTimerRef.current = window.setTimeout(() => {
      approvalTimerRef.current = null;
      routerRef.current.replace("/");
    }, 900);
    return () => {
      if (approvalTimerRef.current !== null) {
        window.clearTimeout(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
    };
  }, [devSkipDone, isApproved]);

  // Restore step and form values from localStorage when mounting/status settles.
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
        const own = statusQuery.data?.own;
        if (own) {
          form.setField("businessName", own.businessName);
          form.setField("businessType", own.businessType ?? "");
        }
      }
    } catch (err) {
      console.error("Gagal memuat draft waitlist dari localStorage:", err);
    }
    // Only run on initial hydrate/hydration of the status query.
  }, [statusQuery.data]);

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
      setSubmitted(false);
      toast.success("Pendaftaran kamu sudah masuk antrian. Terima kasih!");
    },
  });

  // Admin-only dev skip: approves the signed-in user's waitlist entry via a
  const devSkipMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ message?: string }>("/api/dev/skip-waitlist", {
        method: "POST",
      }),
    onSuccess: async () => {
      setDevSkipDone(true);
      toast.success("Pendaftaran di-skip (admin bypass).");
      await invalidateWaitlistStatus(queryClient);
      setTimeout(() => void router.replace("/"), 1500);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal skip pendaftaran.",
      );
    },
  });

  // Admin self-approve: lets an admin who has filled out the waitlist form
  const adminSelfApproveMutation = useMutation({
    mutationFn: async () => {
      const entryId = initialOwn?.id ?? statusQuery.data?.own?.id;
      if (!entryId) {
        throw new Error("Tidak ada pendaftaran yang bisa disetujui.");
      }
      return fetchJson<{ status?: string }>("/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({ action: "approve", entryId }),
      });
    },
    onSuccess: async () => {
      await invalidateAdminWaitlistData(queryClient);
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
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-[#1c1c1c] dark:text-surface-warm-white">
        <div className="flex size-14 items-center justify-center rounded-full border border-accent-orange-border bg-accent-orange-subtle text-accent-orange">
          <Check className="size-7" strokeWidth={2.5} />
        </div>
        <h1 className="text-heading-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
          Berhasil di-skip!
        </h1>
        <p className="max-w-md text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
          Mengalihkan ke beranda...
        </p>
      </div>
    );
  }

  if (view === "approval") {
    return <ApprovalScreen />;
  }

  if (view === "success") {
    return (
      <SuccessScreen
        businessName={
          form.values.businessName || statusQuery.data?.own?.businessName || ""
        }
        email={session?.user?.email ?? undefined}
        isAdmin={isAdmin}
        entryId={statusQuery.data?.own?.id}
        onAdminApprove={() => adminSelfApproveMutation.mutate()}
        isApproving={adminSelfApproveMutation.isPending}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-stretch px-spacing-4 py-spacing-8 text-[#1c1c1c] dark:text-surface-warm-white sm:px-spacing-6">
      <div className="rounded-3xl border border-black/10 bg-[#fcfbf8] p-spacing-6 shadow-sm dark:border-white/10 dark:bg-[#1c1c1a] dark:shadow-[0_20px_40px_rgba(0,0,0,0.35)] sm:p-spacing-9">
        <ProgressBar currentStep={step} />

        {wasRejected ? (
          <div className="mb-spacing-6 rounded-radius-lg border border-destructive/30 bg-destructive/10 px-spacing-5 py-spacing-4 text-sm text-[#1c1c1c] dark:text-surface-warm-white/85">
            <p className="font-semibold text-destructive dark:text-surface-warm-white">
              Pendaftaran sebelumnya belum bisa kami terima
            </p>
            {statusQuery.data?.own?.rejectionReason ? (
              <p className="mt-spacing-2 text-[#5f5f5d] dark:text-surface-warm-white/70">
                Alasan: {statusQuery.data.own.rejectionReason}
              </p>
            ) : null}
            <p className="mt-spacing-2 text-[#5f5f5d] dark:text-surface-warm-white/70">
              Silakan perbaiki dan ajukan lagi di bawah ini.
            </p>
          </div>
        ) : null}

        {isDev && ownIsDevSkip && isApproved ? (
          <div className="mt-spacing-4 flex flex-col items-center gap-spacing-3 rounded-radius-lg border border-black/10 bg-black/[0.02] px-spacing-5 py-spacing-4 text-center text-sm text-[#1c1c1c] dark:border-white/10 dark:bg-white/[0.02] dark:text-surface-warm-white/85">
            <p>
              Akun kamu sudah auto-approved lewat dev skip. Kamu bisa pakai
              aplikasi penuh.
            </p>
            <button
              className="text-xs text-destructive underline-offset-4 hover:underline disabled:opacity-50"
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
          className="mt-spacing-6 flex w-full flex-col"
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
                const combined = [...form.values.photo, ...newFiles].slice(
                  0,
                  3,
                );
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

          {hasTurnstile && step === 3 ? (
            <p className="mt-spacing-4 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
              Ada cek keamanan sebelum kirim.
            </p>
          ) : null}

          <div className="mt-spacing-8 flex items-center justify-between border-t border-black/5 pt-spacing-4 dark:border-white/5">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="flex items-center gap-spacing-2 text-sm text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:bg-white/10 dark:hover:text-surface-warm-white"
              >
                <ArrowLeft className="size-4" />
                Kembali
              </Button>
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
                        "Tulis minimal 80 karakter untuk melengkapi cerita usahamu.",
                      );
                      return;
                    }
                  }
                  setStep((s) => Math.min(3, s + 1));
                }}
                className="flex items-center gap-spacing-2 bg-action-primary text-surface-warm-white hover:bg-action-primary/90 dark:bg-surface-warm-white dark:text-action-primary dark:hover:bg-white"
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
                size="default"
                className="flex items-center gap-spacing-2 bg-action-primary text-surface-warm-white hover:bg-action-primary/90 dark:bg-surface-warm-white dark:text-action-primary dark:hover:bg-white"
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
                  Cerita usaha dan foto yang kamu kirim bisa dipakai sebagai
                  studi kasus publik. Jangan isi data sensitif seperti alamat
                  rumah, nomor rekening, atau data pelanggan. Nama akun dan
                  email tetap privat.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-spacing-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-radius-lg px-spacing-7 py-spacing-3 text-sm text-[#5f5f5d] transition hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:bg-white/[0.06] dark:hover:text-surface-warm-white"
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
              <div className="flex w-full items-center gap-spacing-3 text-[10px] uppercase tracking-wider text-[#5f5f5d]/70 dark:text-surface-warm-white/40">
                <span className="h-px flex-1 bg-black/10 dark:bg-surface-warm-white/10" />
                <span>atau</span>
                <span className="h-px flex-1 bg-black/10 dark:bg-surface-warm-white/10" />
              </div>
              <button
                className="text-xs text-[#5f5f5d] underline-offset-4 hover:text-[#1c1c1c] hover:underline disabled:opacity-50 dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
                disabled={devSkipMutation.isPending}
                onClick={() => devSkipMutation.mutate()}
                type="button"
              >
                {devSkipMutation.isPending
                  ? "Melewati..."
                  : "Lewati pendaftaran (admin bypass)"}
              </button>
              {statusQuery.data?.own ? (
                <button
                  className="text-[10px] uppercase tracking-wider text-destructive/70 underline-offset-4 hover:text-destructive hover:underline disabled:opacity-50"
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
    </div>
  );
}

function ProgressBar({ currentStep }: { currentStep: number }) {
  const steps = ["Usaha", "Cerita", "Foto"];
  const totalSteps = steps.length;
  const currentLabel = steps[currentStep - 1] ?? "";

  return (
    <div className="mb-spacing-7 flex flex-col gap-spacing-3 border-b border-black/10 pb-spacing-5 dark:border-white/10">
      <div className="flex items-center justify-between text-xs font-medium text-[#5f5f5d] dark:text-surface-warm-white/60">
        <span className="font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
          Langkah {currentStep} dari {totalSteps}: {currentLabel}
        </span>
        <span className="tabular-nums">
          {Math.round((currentStep / totalSteps) * 100)}% selesai
        </span>
      </div>

      <div className="flex gap-1.5">
        {steps.map((_, index) => {
          const stepNum = index + 1;
          const isFilled = stepNum <= currentStep;
          return (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                isFilled
                  ? "bg-action-primary dark:bg-surface-warm-white"
                  : "bg-black/10 dark:bg-white/10"
              }`}
            />
          );
        })}
      </div>
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
            placeholder="Tulis nama usaha"
            type="text"
            value={values.businessName}
          />
        )}
      </FormField>

      <div className="mt-spacing-6">
        <span className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80">
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
            placeholder="Tulis produk atau layanan"
            type="text"
            value={values.storyOffers}
          />
        )}
      </FormField>

      <div className="mt-spacing-5">
        <div className="flex items-end justify-between">
          <span className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80">
            Sudah jualan sejak kapan?
            <span className="text-destructive"> *</span>
          </span>
          {sinceInvalid ? (
            <span className="text-xs text-destructive">
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
            ? "Tulis minimal 80 karakter untuk melengkapi cerita usahamu."
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
            placeholder="Tulis tujuan membuat website"
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
          <label className="flex size-20 cursor-pointer flex-col items-center justify-center rounded-radius-md border border-dashed border-black/20 bg-black/[0.03] text-[#5f5f5d] transition hover:border-action-primary hover:bg-black/[0.06] hover:text-[#1c1c1c] dark:border-surface-warm-white/20 dark:bg-surface-warm-white/5 dark:text-surface-warm-white/60 dark:hover:border-surface-warm-white/50 dark:hover:bg-surface-warm-white/10 dark:hover:text-surface-warm-white">
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
        <p className="mt-spacing-2 text-xs text-destructive">{photoError}</p>
      ) : (
        <p className="mt-spacing-2 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
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
      <h2 className="text-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-2xl">
        {question}
        {required ? <span className="text-destructive"> *</span> : null}
      </h2>
      <p className="mt-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60 sm:text-sm">
        {helper}
      </p>
      <div className="mt-spacing-6">{children}</div>
    </div>
  );
}

function ApprovalScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-[#1c1c1c] dark:text-surface-warm-white">
      <div className="flex size-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <h1 className="text-heading-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
        Pendaftaran disetujui!
      </h1>
      <p className="max-w-md text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
        Mengalihkan kamu ke beranda untuk mulai membuat website.
      </p>
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
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-[#1c1c1c] dark:text-surface-warm-white">
      <div className="flex size-14 items-center justify-center rounded-full border border-accent-orange-border bg-accent-orange-subtle text-accent-orange">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <h1 className="text-heading-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
        Terima kasih, {businessName || "kamu"}!
      </h1>
      <p className="max-w-md text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
        Pendaftaran kamu sudah kami terima. Tim kami akan menghubungi lewat
        {email ? (
          <>
            {" "}
            email{" "}
            <span className="font-medium text-[#1c1c1c] dark:text-surface-warm-white/80">
              {email}
            </span>
          </>
        ) : (
          " email"
        )}{" "}
        setelah kami cek.
      </p>
      <WhatsAppCommunityInvite variant="waitlist" />
      <Link
        href="/"
        className="text-sm text-[#5f5f5d] underline-offset-4 transition hover:text-[#1c1c1c] hover:underline dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
      >
        Lihat beranda
      </Link>
      {isAdmin && entryId ? (
        <button
          className="mt-spacing-4 text-xs text-[#5f5f5d] underline-offset-4 hover:text-[#1c1c1c] hover:underline disabled:opacity-50 dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
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
