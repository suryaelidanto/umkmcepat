import { LegalDocumentContent } from "@/components/legal/LegalDocumentContent";
import { DarkPage } from "@/components/ui/surface";

export default function PrivacyPage() {
  return (
    <DarkPage className="py-spacing-14">
      <LegalDocumentContent documentKey="privacy" />
    </DarkPage>
  );
}
