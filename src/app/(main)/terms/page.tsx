import { LegalDocumentContent } from "@/components/legal/LegalDocumentContent";
import { DarkPage } from "@/components/ui/surface";

export default function TermsPage() {
  return (
    <DarkPage className="py-spacing-14">
      <LegalDocumentContent documentKey="terms" />
    </DarkPage>
  );
}
