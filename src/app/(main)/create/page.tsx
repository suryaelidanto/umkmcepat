import { CreateLandingPageForm } from "@/components/forms/CreateLandingPageForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export default function BuatPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card className="w-full border border-foreground-primary/10 ">
        <CardHeader>
          <h1 className="text-[24px] font-semibold leading-[28px] tracking-[-0.04em]">✨ Buat Landing Page Baru</h1>
          <CardDescription>
            Isi detail usahamu di bawah ini. AI akan membantu membuatkan konten
            yang menarik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateLandingPageForm />
        </CardContent>
      </Card>
    </div>
  );
}
