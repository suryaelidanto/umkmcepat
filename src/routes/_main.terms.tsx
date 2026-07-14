import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentContent } from "@/components/legal/LegalDocumentContent";
import { DarkPage } from "@/components/ui/surface";

export const Route = createFileRoute("/_main/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <DarkPage className="py-spacing-14">
      <LegalDocumentContent documentKey="terms" />
    </DarkPage>
  );
}
