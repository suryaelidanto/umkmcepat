import { useState } from "react";
import { expect, screen, waitFor } from "storybook/test";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  parameters: {
    backgrounds: { default: "Dark workspace" },
    layout: "centered",
  },
  title: "Core UI/Dialog",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <DialogDemo />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Buka dialog" }));
    await waitFor(async () => {
      await expect(screen.getByRole("dialog")).toBeVisible();
    });
  },
};

export const DeleteConfirmation: Story = {
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus website?</DialogTitle>
          <DialogDescription>
            Website ini akan dihapus permanen dan tidak bisa dikembalikan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-spacing-4">
          <Button
            variant="outline"
            className="border-surface-warm-white/14 bg-transparent text-surface-warm-white/78 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          >
            Batal
          </Button>
          <Button className="bg-[#9f1d1d] text-surface-warm-white hover:bg-[#8b1717]">
            Hapus
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

function DialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className="bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
        onClick={() => setOpen(true)}
      >
        Buka dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Website siap dilihat</DialogTitle>
            <DialogDescription>
              Cek bagian utama, kontak, dan ajakan pesan sebelum dibagikan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-spacing-4">
            <Button
              variant="outline"
              className="border-surface-warm-white/14 bg-transparent text-surface-warm-white/78 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            <Button className="bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86">
              Lihat preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
