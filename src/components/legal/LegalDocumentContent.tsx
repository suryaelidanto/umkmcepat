import { legalDocuments, type LegalDocumentKey } from "@/lib/legal-documents";

export function LegalDocumentContent({
  compact = false,
  documentKey,
}: {
  compact?: boolean;
  documentKey: LegalDocumentKey;
}) {
  const document = legalDocuments[documentKey];

  return (
    <article className={compact ? "space-y-spacing-6" : "mx-auto max-w-3xl"}>
      <div>
        <h1
          className={
            compact
              ? "text-2xl font-semibold tracking-[-0.04em]"
              : "text-4xl font-semibold tracking-[-0.05em] sm:text-5xl"
          }
        >
          {document.title}
        </h1>
        <p className="mt-spacing-5 text-sm leading-6 text-surface-warm-white/62 sm:text-base">
          {document.intro}
        </p>
      </div>

      <div
        className={
          compact ? "space-y-spacing-6" : "mt-spacing-10 space-y-spacing-8"
        }
      >
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
