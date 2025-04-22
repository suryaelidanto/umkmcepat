"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AiGeneratedContent } from "@/lib/ai";
import { tweakSchema, TweakSchema } from "@/lib/zod-schemas";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";

interface TweakDialogProps {
  slug: string;
  // currentContent: AiGeneratedContent; // No need to pass, mutation will refetch
  tweaksLeft: number;
  children: React.ReactNode; // To wrap the trigger button
}

// Define the expected response structure from /api/tweak
interface TweakApiResponse {
  message: string;
  updatedAiContent: AiGeneratedContent;
  tweaksLeft: number;
}

// Mutation function
const sendTweakInstruction = async (
  data: TweakSchema
): Promise<TweakApiResponse> => {
  const res = await fetch("/api/tweak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.message || "Gagal mengirim instruksi tweak");
  }
  return result;
};

export function TweakDialog({ slug, tweaksLeft, children }: TweakDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["landingPage", slug];

  const form = useForm<TweakSchema>({
    resolver: zodResolver(tweakSchema),
    defaultValues: {
      instruction: "",
      slug: slug, // Include slug in form data for the API
    },
  });

  const tweakMutation = useMutation({
    mutationFn: sendTweakInstruction,
    onSuccess: (data) => {
      toast.success("Tweak Berhasil!", { description: data.message });
      // Update the query cache with the new data from the server
      queryClient.setQueryData(
        queryKey,
        (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          oldData: any
        ) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            aiContent: data.updatedAiContent,
            tweaksLeft: data.tweaksLeft,
          };
        }
      );
      form.reset(); // Clear the form
      setIsOpen(false); // Close the dialog
    },
    onError: (error) => {
      toast.error("Tweak Gagal", { description: error.message });
    },
  });

  const onSubmit = (data: TweakSchema) => {
    if (tweaksLeft <= 0) {
      toast.error("Jatah tweak habis.");
      return;
    }
    tweakMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Bot className="mr-2 h-5 w-5" /> Ubah Konten dengan AI
          </DialogTitle>
          <DialogDescription>
            Berikan instruksi untuk mengubah konten halaman ini. Sisa jatah
            tweak: {tweaksLeft}x.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div>
            <Label htmlFor="instruction" className="sr-only">
              Instruksi Tweak
            </Label>
            <Textarea
              id="instruction"
              placeholder="Contoh: Ganti warna utama jadi biru dong. Buat deskripsi lebih singkat."
              rows={4}
              {...form.register("instruction")}
              disabled={tweakMutation.isPending || tweaksLeft <= 0}
            />
            {form.formState.errors.instruction && (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.instruction.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={tweakMutation.isPending || tweaksLeft <= 0}
            >
              {tweakMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengirim...
                </>
              ) : (
                "Kirim Instruksi"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
